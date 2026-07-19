import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createUser,
  listUsers,
  setUserActive,
  updateUser,
  type UserSaveBody,
} from "../../src/services/users-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("users service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists users", async () => {
    await listUsers();
    expect(request).toHaveBeenCalledWith("/api/users");
  });

  it("creates and updates users", async () => {
    const createBody = {
      name: "Cashier",
      username: "cashier",
      role: "cashier" as const,
      password: "secret-123",
    };
    const updateBody = { name: "Evening cashier" };
    await createUser(createBody);
    await updateUser(3, updateBody);
    expect(request).toHaveBeenNthCalledWith(1, "/api/users", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/users/3", {
      method: "PUT",
      body: JSON.stringify(updateBody),
    });
  });

  it("changes account state", async () => {
    const body: UserSaveBody = { isActive: false };

    await setUserActive(3, false);
    expect(request).toHaveBeenCalledWith("/api/users/3", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  });
});
