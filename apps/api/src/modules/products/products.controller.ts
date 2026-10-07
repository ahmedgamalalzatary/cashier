import type { Request, Response } from "express";
import { idParam } from "@cashier/server-core";
import type { ProductsService } from "./products.service.js";
import { productStockSetupInput } from "./products.schemas.js";
import type { CacheRefreshRepository } from "../external/cache-refresh.repository.js";
import type { ProductsRepository } from "./products.repository.js";
import { HttpError } from "@cashier/server-core";

export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly refreshStore: CacheRefreshRepository,
    private readonly localCatalog: Pick<ProductsRepository, "getLocalCatalog">,
  ) {}

  local = async (_req: Request, res: Response) => {
    res.json(await this.localCatalog.getLocalCatalog());
  };

  list = async (req: Request, res: Response) => {
    const forPos = req.query.pos === "true";
    const [catalog, refreshStatus] = await Promise.all([
      this.service.list().catch((error) => {
        if (!forPos || !(error instanceof HttpError) || error.status !== 503)
          throw error;
        return {
          categories: [],
          products: [],
          lastSuccessfulSyncAt: null,
          stale: true,
          syncError: error.message,
        };
      }),
      this.refreshStore.getStatus(),
    ]);
    const local = forPos ? await this.localCatalog.getLocalCatalog() : null;
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().toLocaleLowerCase()
        : "";
    const requestedPage = Math.max(1, Math.trunc(Number(req.query.page) || 1));
    const requestedPageSize = Math.min(
      100,
      Math.max(1, Math.trunc(Number(req.query.pageSize) || 50)),
    );
    const products = search
      ? catalog.products.filter((product) =>
          `${product.nameAr} ${product.nameEn}`
            .toLocaleLowerCase()
            .includes(search),
        )
      : catalog.products;
    const unpaginated = req.query.all === "true";
    const pageSize = unpaginated
      ? Math.max(1, products.length)
      : requestedPageSize;
    const totalPages = unpaginated
      ? 1
      : Math.max(1, Math.ceil(products.length / pageSize));
    const page = unpaginated ? 1 : Math.min(requestedPage, totalPages);
    res.json({
      ...catalog,
      ...(local
        ? { localCategories: local.categories, localProducts: local.products }
        : {}),
      stale:
        catalog.stale ||
        (!!refreshStatus.lastFailedAt &&
          (!refreshStatus.lastSuccessfulSyncAt ||
            refreshStatus.lastFailedAt > refreshStatus.lastSuccessfulSyncAt)),
      syncError: refreshStatus.lastError ?? catalog.syncError,
      products: unpaginated
        ? products
        : products.slice((page - 1) * pageSize, page * pageSize),
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: products.length,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  };

  refresh = async (_req: Request, res: Response) => {
    await this.refreshStore.request(new Date());
    res.status(202).json({ accepted: true });
  };

  refreshStatus = async (_req: Request, res: Response) => {
    res.json(await this.refreshStore.getStatus());
  };

  configureStock = async (req: Request, res: Response) => {
    await this.service.configureStock(
      idParam.parse(req.params.id),
      productStockSetupInput.parse(req.body),
    );
    res.json({ ok: true });
  };
}
