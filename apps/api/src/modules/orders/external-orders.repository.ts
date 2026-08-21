import type { ExternalOrderSummary } from "@cashier/shared";
import { and, desc, like, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { externalOrdersCache } from "../../db/schema.js";

const CHUNK_SIZE = 250;

export class ExternalOrdersRepository {
  constructor(private readonly db: Db) {}

  async insertUnseen(orders: ExternalOrderSummary[]) {
    const cachedAt = new Date();
    for (let index = 0; index < orders.length; index += CHUNK_SIZE) {
      const rows = orders.slice(index, index + CHUNK_SIZE).map((order) => ({
        externalId: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
        deliveryFee: order.deliveryFee,
        externalCreatedAt: order.createdAt,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        orderType: order.orderType,
        itemCount: order.itemCount,
        cachedAt,
      }));
      await this.db
        .insert(externalOrdersCache)
        .values(rows)
        .onDuplicateKeyUpdate({
          set: { externalId: sql`external_id` },
        });
    }
  }

  async list(params: {
    search?: string;
    day?: string;
    page: number;
    pageSize: number;
  }) {
    const filters: SQL[] = [];
    const search = params.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      filters.push(
        or(
          like(externalOrdersCache.customerName, pattern),
          like(externalOrdersCache.customerPhone, pattern),
          like(sql`CAST(${externalOrdersCache.externalId} AS CHAR)`, pattern),
        )!,
      );
    }
    if (params.day) {
      filters.push(
        like(externalOrdersCache.externalCreatedAt, `${params.day}%`),
      );
    }
    const where = filters.length ? and(...filters) : undefined;
    const [rows, [summary]] = await Promise.all([
      this.db
        .select()
        .from(externalOrdersCache)
        .where(where)
        .orderBy(
          desc(externalOrdersCache.externalCreatedAt),
          desc(externalOrdersCache.externalId),
        )
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      this.db
        .select({
          totalCount: sql<number>`COUNT(*)`,
          totalAmount: sql<string>`COALESCE(SUM(${externalOrdersCache.totalAmount}), 0)`,
          discountAmount: sql<string>`COALESCE(SUM(${externalOrdersCache.discountAmount}), 0)`,
          pendingCount: sql<number>`COALESCE(SUM(${externalOrdersCache.orderStatus} = 'pending'), 0)`,
        })
        .from(externalOrdersCache)
        .where(where),
    ]);
    const totalCount = Number(summary?.totalCount ?? 0);
    const totalPages = Math.ceil(totalCount / params.pageSize);
    return {
      data: rows.map((row) => ({
        id: row.externalId,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        subtotal: row.subtotal,
        discountAmount: row.discountAmount,
        totalAmount: row.totalAmount,
        deliveryFee: row.deliveryFee,
        createdAt: row.externalCreatedAt,
        orderStatus: row.orderStatus,
        paymentStatus: row.paymentStatus,
        paymentMethod: row.paymentMethod,
        orderType: row.orderType,
        itemCount: row.itemCount,
      })),
      pagination: {
        currentPage: params.page,
        pageSize: params.pageSize,
        totalCount,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPreviousPage: params.page > 1,
      },
      totals: {
        count: totalCount,
        sales: String(summary?.totalAmount ?? "0.00"),
        discounts: String(summary?.discountAmount ?? "0.00"),
        pending: Number(summary?.pendingCount ?? 0),
      },
    };
  }
}
