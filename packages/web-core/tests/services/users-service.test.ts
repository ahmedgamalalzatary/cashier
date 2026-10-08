import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createUser,
  listUsers,
  setUserActive,
  updateUser,
  type UserSaveBody,
} from '../../src/services/users-service';

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
      name: "Admin",
      username: "admin-two",
      role: "admin" as const,
      password: "secret-123",
    };
    const updateBody = { name: "Evening cashier" };
    await createUser(createBody);
    await updateUser(testId(3), updateBody);
    expect(request).toHaveBeenNthCalledWith(1, "/api/users", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/users/00000000-0000-7000-8000-000000000003", {
      method: "PUT",
      body: JSON.stringify(updateBody),
    });
  });

  it("changes account state", async () => {
    const body: UserSaveBody = { isActive: false };

    await setUserActive(testId(3), false);
    expect(request).toHaveBeenCalledWith("/api/users/00000000-0000-7000-8000-000000000003", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  });
});
