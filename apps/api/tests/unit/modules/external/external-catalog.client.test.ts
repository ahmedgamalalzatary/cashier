import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ExternalBackendClient } from "../../../../src/modules/external/external-backend.client.js";
import { ExternalCatalogClient } from "../../../../src/modules/external/external-catalog.client.js";
import { ExternalOrdersClient } from "../../../../src/modules/orders/external-orders.client.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const category = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  nameAr: "مشروبات ساخنة",
  nameEn: "Hot Drinks",
  descriptionAr: null,
  descriptionEn: null,
  isActive: true,
  isVisible: true,
  displayOrder: 2,
  ...overrides,
});

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 9,
  nameAr: "لاتيه",
  nameEn: "Latte",
  price: 80,
  calories: 120,
  pointsReward: 8,
  isAvailable: true,
  isVisible: true,
  categoryName: "Hot Drinks",
  sizes: [
    {
      id: 91,
      nameAr: "كبير",
      nameEn: "Large",
      price: 100,
      isDefault: true,
    },
  ],
  modifierGroups: [
    {
      id: 92,
      nameAr: "إضافات",
      nameEn: "Extras",
      isRequired: false,
      maxSelections: 2,
      options: [
        {
          id: 93,
          nameAr: "شوت إضافي",
          nameEn: "Extra shot",
          extraPrice: 15,
        },
      ],
    },
  ],
  ...overrides,
});

const createCatalog = (fetcher: typeof fetch) => {
  const backend = new ExternalBackendClient(
    {
      baseUrl: "https://catalog.example.com",
      phoneNumber: "01234567890",
      password: "server-only-password",
    },
    fetcher,
  );
  return new ExternalCatalogClient(backend);
};

describe("ExternalCatalogClient", () => {
  it("waits for in-flight authentication recovery before retrying a stale request", async () => {
    let loginCount = 0;
    let dataCount = 0;
    let releaseLogin!: () => void;
    let announceLogin!: () => void;
    const loginPending = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    const loginStarted = new Promise<void>((resolve) => {
      announceLogin = resolve;
    });
    const authorizations: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/Auth/login")) {
        loginCount += 1;
        if (loginCount === 2) {
          announceLogin();
          await loginPending;
        }
        return jsonResponse({
          accessToken: loginCount === 1 ? "old-access" : "new-access",
          refreshToken: loginCount === 1 ? "old-refresh" : "new-refresh",
        });
      }
      if (url.endsWith("/api/Auth/refresh-token")) {
        return jsonResponse({}, 401);
      }
      authorizations.push(
        new Headers(init?.headers).get("Authorization") ?? "",
      );
      dataCount += 1;
      if (dataCount === 2) await loginStarted;
      return dataCount <= 2 ? jsonResponse({}, 401) : jsonResponse([]);
    });
    const backend = new ExternalBackendClient(
      {
        baseUrl: "https://catalog.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );

    const requests = Promise.all([
      backend.get("/data", z.array(z.unknown())),
      backend.get("/data", z.array(z.unknown())),
    ]);
    await loginStarted;
    releaseLogin();
    await requests;

    expect(authorizations).toEqual([
      "Bearer old-access",
      "Bearer old-access",
      "Bearer new-access",
      "Bearer new-access",
    ]);
  });

  it("shares one authenticated session with external orders", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/Auth/login")) {
        return jsonResponse({
          accessToken: "shared-access",
          refreshToken: "shared-refresh",
        });
      }
      if (url.endsWith("/api/admin/categories")) {
        return jsonResponse([category()]);
      }
      if (url.endsWith("/api/admin/products")) {
        return jsonResponse([product()]);
      }
      return jsonResponse([]);
    });
    const backend = new ExternalBackendClient(
      {
        baseUrl: "https://catalog.example.com",
        phoneNumber: "01234567890",
        password: "server-only-password",
      },
      fetcher,
    );
    const catalog = new ExternalCatalogClient(backend);
    const orders = new ExternalOrdersClient(backend);

    await Promise.all([catalog.load(), orders.list()]);

    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/Auth/login"),
      ),
    ).toHaveLength(1);
  });

  it("loads and strictly resolves a complete bilingual catalog", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([category()]))
      .mockResolvedValueOnce(jsonResponse([product()]));

    const catalog = await createCatalog(fetcher).load();

    expect(catalog.categories).toEqual([
      expect.objectContaining({ externalId: 3, nameEn: "Hot Drinks" }),
    ]);
    expect(catalog.products).toEqual([
      expect.objectContaining({
        externalId: 9,
        externalCategoryId: 3,
        nameAr: "لاتيه",
        descriptionAr: null,
        discountPercentage: null,
        imageUrl: null,
        sizes: [expect.objectContaining({ externalId: 91 })],
        modifierGroups: [
          expect.objectContaining({
            externalId: 92,
            options: [expect.objectContaining({ externalId: 93 })],
          }),
        ],
      }),
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://catalog.example.com/api/admin/categories",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-1" }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "https://catalog.example.com/api/admin/products",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-1" }),
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects the complete refresh when a category name is ambiguous", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          category(),
          category({ id: 4, nameAr: "Hot Drinks", nameEn: "Other" }),
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([product()]));

    await expect(createCatalog(fetcher).load()).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects malformed nested money instead of partially accepting products", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([category()]))
      .mockResolvedValueOnce(
        jsonResponse([
          product({
            modifierGroups: [
              {
                id: 92,
                nameAr: "إضافات",
                nameEn: "Extras",
                isRequired: false,
                maxSelections: 2,
                options: [
                  {
                    id: 93,
                    nameAr: "شوت إضافي",
                    nameEn: "Extra shot",
                    extraPrice: "not-money",
                  },
                ],
              },
            ],
          }),
        ]),
      );

    await expect(createCatalog(fetcher).load()).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects duplicate external IDs before updating the local cache", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([category()]))
      .mockResolvedValueOnce(
        jsonResponse([product(), product({ nameEn: "Duplicate Latte" })]),
      );

    await expect(createCatalog(fetcher).load()).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects nested IDs reused by different products", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([category()]))
      .mockResolvedValueOnce(
        jsonResponse([product(), product({ id: 10, nameEn: "Mocha" })]),
      );

    await expect(createCatalog(fetcher).load()).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects an external discount above 100 percent", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([category()]))
      .mockResolvedValueOnce(
        jsonResponse([product({ discountPercentage: 100.01 })]),
      );

    await expect(createCatalog(fetcher).load()).rejects.toMatchObject({
      status: 502,
    });
  });

  it("rejects external money that would be rounded or overflow storage", async () => {
    for (const price of [80.001, 1e-7, "10000000000.00"]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
        )
        .mockResolvedValueOnce(jsonResponse([category()]))
        .mockResolvedValueOnce(jsonResponse([product({ price })]));

      await expect(createCatalog(fetcher).load()).rejects.toMatchObject({
        status: 502,
      });
    }
  });

  it("accepts valid two-decimal numeric money despite floating-point representation", async () => {
    for (const price of [0.29, 0.57, 10.12]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
        )
        .mockResolvedValueOnce(jsonResponse([category()]))
        .mockResolvedValueOnce(jsonResponse([product({ price })]));

      await expect(createCatalog(fetcher).load()).resolves.toBeDefined();
    }
  });

  it("keeps the products whose modifiers are named when others are unnamed", async () => {
    // The external backend lost its modifier names in a migration and omits
    // the properties entirely, so a whole-catalog rejection would block every
    // healthy product too.
    const unnamedGroup = product({
      id: 10,
      nameEn: "Mocha",
      sizes: [],
      modifierGroups: [
        {
          id: 94,
          isRequired: true,
          maxSelections: 1,
          options: [{ id: 95, extraPrice: 0 }],
        },
      ],
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-1", refreshToken: "refresh-1" }),
      )
      .mockResolvedValueOnce(jsonResponse([category()]))
      .mockResolvedValueOnce(jsonResponse([product(), unnamedGroup]));

    const catalog = await createCatalog(fetcher).load();

    expect(catalog.products).toEqual([
      expect.objectContaining({ externalId: 9 }),
      expect.objectContaining({
        externalId: 10,
        modifierGroups: [
          expect.objectContaining({
            externalId: 94,
            nameAr: null,
            nameEn: null,
            options: [
              expect.objectContaining({
                externalId: 95,
                nameAr: null,
                nameEn: null,
              }),
            ],
          }),
        ],
      }),
    ]);
  });
});
