import { describe, expect, it, vi } from "vitest";
import { ExternalOrdersClient } from "../../../../src/modules/orders/external-orders.client.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const rawOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 17,
  subTotal: 140,
  discountAmount: 10,
  totalAmount: 145,
  createdAt: "2026-08-17T19:30:00",
  orderStatus: 0,
  paymentStatus: 5,
  paymentMethod: 1,
  orderType: 2,
  deliveryFee: 15,
  phoneNumber: "01000000000",
  user: {
    fullName: "عميل تجريبي",
    phoneNumber: "01111111111",
    passwordHash: "must-never-leave-the-external-api-boundary",
    refreshToken: "must-also-be-removed",
  },
  orderItems: [{ quantity: 2 }, { quantity: 1 }],
  ...overrides,
});

describe("ExternalOrdersClient", () => {
  it("loads every external order page for cache synchronization", async () => {
    const page = (currentPage: number, data: unknown[]) => ({
      data,
      pagination: {
        currentPage,
        pageSize: 1,
        totalCount: 3,
        totalPages: 3,
        hasNextPage: currentPage < 3,
        hasPreviousPage: currentPage > 1,
      },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "a", refreshToken: "r" }),
      )
      .mockResolvedValueOnce(jsonResponse(page(1, [rawOrder({ id: 1 })])))
      .mockResolvedValueOnce(jsonResponse(page(2, [rawOrder({ id: 2 })])))
      .mockResolvedValueOnce(jsonResponse(page(3, [rawOrder({ id: 3 })])));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "p",
      },
      fetcher,
    );

    await expect(client.listAll()).resolves.toMatchObject([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    expect(fetcher.mock.calls.slice(1).map(([url]) => String(url))).toEqual([
      "https://orders.example.com/api/AdminOrders/search?page=1&pageSize=100",
      "https://orders.example.com/api/AdminOrders/search?page=2&pageSize=100",
      "https://orders.example.com/api/AdminOrders/search?page=3&pageSize=100",
    ]);
  });

  it("requests paginated external orders and unwraps pagination metadata", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "a", refreshToken: "r" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [rawOrder()],
          pagination: {
            currentPage: 2,
            pageSize: 1,
            totalCount: 3,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: true,
          },
        }),
      );
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "p",
      },
      fetcher,
    );
    await expect(
      client.listPage({ search: "17", page: 2, pageSize: 1 }),
    ).resolves.toMatchObject({
      data: [{ id: 17 }],
      pagination: { totalCount: 3 },
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://orders.example.com/api/AdminOrders/search?search=17&page=2&pageSize=1",
      expect.anything(),
    );
  });
  it("authenticates once and maps external orders to the safe cashier contract", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([rawOrder()]));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    const orders = await client.list();

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://orders.example.com/api/Auth/login",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          phoneNumber: "01234567890",
          password: "server-only-password",
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://orders.example.com/api/AdminOrders",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-1" }),
      }),
    );
    expect(orders).toEqual([
      {
        id: 17,
        customerName: "عميل تجريبي",
        customerPhone: "01000000000",
        subtotal: "140.00",
        discountAmount: "10.00",
        totalAmount: "145.00",
        deliveryFee: "15.00",
        createdAt: "2026-08-17T19:30:00",
        orderStatus: "pending",
        paymentStatus: "unpaid",
        paymentMethod: "cash_on_delivery",
        orderType: "delivery",
        itemCount: 3,
      },
    ]);
    expect(JSON.stringify(orders)).not.toContain("passwordHash");
    expect(JSON.stringify(orders)).not.toContain("refreshToken");
  });

  it("refreshes an expired access token and retries the orders request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "expired-access",
          refreshToken: "refresh-1",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-2", refreshToken: "refresh-2" }),
      )
      .mockResolvedValueOnce(jsonResponse([]));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await expect(client.list()).resolves.toEqual([]);

    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "https://orders.example.com/api/Auth/refresh-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refreshToken: "refresh-1" }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      4,
      "https://orders.example.com/api/AdminOrders",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-2" }),
      }),
    );
  });

  it("logs in again when the refresh token is rejected", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "expired-access",
          refreshToken: "expired-refresh",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-2", refreshToken: "refresh-2" }),
      )
      .mockResolvedValueOnce(jsonResponse([]));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await expect(client.list()).resolves.toEqual([]);

    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith("/login")),
    ).toHaveLength(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      5,
      "https://orders.example.com/api/AdminOrders",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-2" }),
      }),
    );
  });

  it("reports upstream network failures as a bad gateway", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await expect(client.list()).rejects.toMatchObject({
      status: 502,
      message: "تعذر الاتصال بخدمة طلبات الأونلاين",
    });
  });

  it("reports malformed upstream order data as a bad gateway", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([{ id: 17, user: {} }]));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await expect(client.list()).rejects.toMatchObject({
      status: 502,
      message: "استجابت خدمة طلبات الأونلاين ببيانات غير صالحة",
    });
  });

  it("rejects non-numeric upstream money before it reaches frontend totals", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([rawOrder({ totalAmount: "abc" })]));
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await expect(client.list()).rejects.toMatchObject({ status: 502 });
  });

  it("rejects invalid upstream Cairo timestamps before frontend rendering", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse([rawOrder({ createdAt: "2026-99-40T25:70:00" })]),
      );
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await expect(client.list()).rejects.toMatchObject({ status: 502 });
  });

  it("shares one login across concurrent order requests", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/login")) {
        await Promise.resolve();
        return jsonResponse({
          accessToken: "shared-access",
          refreshToken: "shared-refresh",
        });
      }
      return jsonResponse([]);
    });
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await Promise.all([client.list(), client.list()]);

    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith("/login")),
    ).toHaveLength(1);
  });

  it("shares one token refresh across concurrent unauthorized responses", async () => {
    let refreshCalls = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/login"))
        return jsonResponse({
          accessToken: "expired-access",
          refreshToken: "refresh-1",
        });
      if (url.endsWith("/refresh-token")) {
        refreshCalls += 1;
        await Promise.resolve();
        return jsonResponse({
          accessToken: "fresh-access",
          refreshToken: "refresh-2",
        });
      }
      const authorization = (init?.headers as Record<string, string>)
        .Authorization;
      return authorization === "Bearer expired-access"
        ? jsonResponse({}, 401)
        : jsonResponse([]);
    });
    const client = new ExternalOrdersClient(
      {
        baseUrl: "https://orders.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    await Promise.all([client.list(), client.list()]);

    expect(refreshCalls).toBe(1);
  });
});
