import { z } from "zod";
import type { ExternalOrderSummary } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";

export type ExternalOrdersConfig = {
  baseUrl: string;
  phoneNumber: string;
  password: string;
};

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

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

const decimal = (value: number | string) => Number(value).toFixed(2);

const orderStatuses = {
  0: "pending",
  1: "completed",
  2: "cancelled",
} as const;

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

const orderTypes = {
  1: "pickup",
  2: "delivery",
} as const;

export class ExternalOrdersClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private loginPromise: Promise<void> | null = null;
  private recoveryPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ExternalOrdersConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async list(): Promise<ExternalOrderSummary[]> {
    if (!this.accessToken) await this.ensureLogin();
    const attemptedToken = this.accessToken!;
    let response = await this.fetchOrders(attemptedToken);
    if (response.status === 401) {
      await this.recoverAuthentication(attemptedToken);
      response = await this.fetchOrders(this.accessToken!);
    }
    if (!response.ok) throw new HttpError(502, "تعذر تحميل طلبات الأونلاين");

    const rows = await this.parseResponse(externalOrdersSchema, response);
    return rows.map((row) => ({
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
      orderType:
        orderTypes[row.orderType as keyof typeof orderTypes] ?? "unknown",
      itemCount: row.orderItems.reduce((sum, item) => sum + item.quantity, 0),
    }));
  }

  private fetchOrders(accessToken: string) {
    return this.request(`${this.config.baseUrl}/api/AdminOrders`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  private async ensureLogin() {
    if (this.accessToken) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  private async login() {
    const response = await this.request(
      `${this.config.baseUrl}/api/Auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: this.config.phoneNumber,
          password: this.config.password,
        }),
      },
    );
    if (!response.ok)
      throw new HttpError(502, "تعذر تسجيل الدخول إلى خدمة طلبات الأونلاين");
    const tokens = await this.parseResponse(tokensSchema, response);
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }

  private async recoverAuthentication(failedAccessToken: string) {
    if (this.accessToken !== failedAccessToken) return;
    if (!this.recoveryPromise) {
      this.recoveryPromise = this.refreshOrLogin().finally(() => {
        this.recoveryPromise = null;
      });
    }
    await this.recoveryPromise;
  }

  private async refreshOrLogin() {
    if (this.refreshToken) {
      const response = await this.request(
        `${this.config.baseUrl}/api/Auth/refresh-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        },
      );
      if (response.ok) {
        const tokens = await this.parseResponse(tokensSchema, response);
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
        return;
      }
    }

    this.accessToken = null;
    this.refreshToken = null;
    await this.ensureLogin();
  }

  private async request(input: string, init?: RequestInit) {
    try {
      return await this.fetcher(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(10_000),
      });
    } catch {
      throw new HttpError(502, "تعذر الاتصال بخدمة طلبات الأونلاين");
    }
  }

  private async parseResponse<T>(schema: z.ZodType<T>, response: Response) {
    try {
      return schema.parse(await response.json());
    } catch {
      throw new HttpError(
        502,
        "استجابت خدمة طلبات الأونلاين ببيانات غير صالحة",
      );
    }
  }
}
