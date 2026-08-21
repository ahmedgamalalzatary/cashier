import { z } from "zod";
import type { ExternalOrderSummary } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import {
  ExternalBackendClient,
  ExternalBackendError,
  type ExternalBackendConfig,
} from "../external/external-backend.client.js";

export type ExternalOrdersConfig = ExternalBackendConfig;

const decimalSchema = z.union([
  z.number().finite(),
  z.string().regex(/^-?\d+(?:\.\d+)?$/),
]);

const cairoDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?$/)
  .refine((value) => {
    const parsed = new Date(`${value}Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 19) === value.slice(0, 19)
    );
  });

const externalOrderSchema = z.object({
  id: z.number().int(),
  subTotal: decimalSchema,
  discountAmount: decimalSchema,
  totalAmount: decimalSchema,
  deliveryFee: decimalSchema,
  createdAt: cairoDateTimeSchema,
  orderStatus: z.number().int(),
  paymentStatus: z.number().int(),
  paymentMethod: z.number().int(),
  orderType: z.number().int(),
  phoneNumber: z.string().nullable().optional(),
  user: z
    .object({
      fullName: z.string().nullable().optional(),
      userName: z.string().nullable().optional(),
      phoneNumber: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  orderItems: z.array(z.object({ quantity: z.number().int().nonnegative() })),
});

const externalOrdersSchema = z.array(externalOrderSchema);
const paginationSchema = z.object({ currentPage: z.number().int(), pageSize: z.number().int(), totalCount: z.number().int(), totalPages: z.number().int(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean() });
const externalOrdersPageSchema = z.object({ data: externalOrdersSchema, pagination: paginationSchema });
const decimal = (value: number | string) => Number(value).toFixed(2);

const orderStatuses = { 0: "pending", 1: "completed", 2: "cancelled" } as const;
const paymentStatuses = {
  1: "pending",
  2: "paid",
  3: "failed",
  4: "cancelled",
  5: "unpaid",
} as const;
const paymentMethods = {
  1: "cash_on_delivery",
  2: "online",
  3: "onsite",
} as const;
const orderTypes = { 1: "pickup", 2: "delivery" } as const;

export class ExternalOrdersClient {
  private readonly backend: ExternalBackendClient;

  constructor(
    backendOrConfig: ExternalBackendClient | ExternalOrdersConfig,
    fetcher: typeof fetch = fetch,
  ) {
    this.backend =
      backendOrConfig instanceof ExternalBackendClient
        ? backendOrConfig
        : new ExternalBackendClient(backendOrConfig, fetcher);
  }

  async list(): Promise<ExternalOrderSummary[]> {
    return (await this.listPage()).data;
  }

  async listPage(params: { search?: string; page?: number; pageSize?: number } = {}) {
    let rows: z.infer<typeof externalOrdersSchema>;
    try {
      const query = new URLSearchParams();
      if (params.search?.trim()) query.set("search", params.search.trim());
      if (params.page !== undefined) query.set("page", String(params.page));
      if (params.pageSize !== undefined) query.set("pageSize", String(params.pageSize));
      const path = query.size ? `/api/AdminOrders/search?${query}` : "/api/AdminOrders";
      const response = await this.backend.get(path, z.union([externalOrdersSchema, externalOrdersPageSchema]));
      const page = Array.isArray(response) ? { data: response, pagination: { currentPage: 1, pageSize: response.length, totalCount: response.length, totalPages: response.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false } } : response;
      rows = page.data;
      var pagination = page.pagination;
    } catch (error) {
      if (error instanceof ExternalBackendError) {
        const messages = {
          invalid: "استجابت خدمة طلبات الأونلاين ببيانات غير صالحة",
          transport: "تعذر الاتصال بخدمة طلبات الأونلاين",
          auth: "تعذر تسجيل الدخول إلى خدمة طلبات الأونلاين",
          upstream: "تعذر تحميل طلبات الأونلاين",
        } as const;
        throw new HttpError(502, messages[error.kind]);
      }
      throw new HttpError(502, "تعذر تحميل طلبات الأونلاين");
    }

    return { data: rows.map((row) => ({
      id: row.id,
      customerName: row.user?.fullName ?? row.user?.userName ?? "—",
      customerPhone: row.phoneNumber ?? row.user?.phoneNumber ?? null,
      subtotal: decimal(row.subTotal),
      discountAmount: decimal(row.discountAmount),
      totalAmount: decimal(row.totalAmount),
      deliveryFee: decimal(row.deliveryFee),
      createdAt: row.createdAt,
      orderStatus:
        orderStatuses[row.orderStatus as keyof typeof orderStatuses] ??
        "unknown",
      paymentStatus:
        paymentStatuses[row.paymentStatus as keyof typeof paymentStatuses] ??
        "unknown",
      paymentMethod:
        paymentMethods[row.paymentMethod as keyof typeof paymentMethods] ??
        "unknown",
      orderType: orderTypes[row.orderType as keyof typeof orderTypes] ?? "unknown",
      itemCount: row.orderItems.reduce((sum, item) => sum + item.quantity, 0),
    })), pagination };
  }
}
