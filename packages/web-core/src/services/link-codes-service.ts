import { api } from "@cashier/web-core/lib/api";

export type LinkCode = {
  code: string;
  expiresAt: string;
};

/** The plaintext code comes back once and is never retrievable again. */
export const generateLinkCode = (branchId: string) =>
  api<LinkCode>("/api/link-codes", {
    method: "POST",
    body: JSON.stringify({ branchId }),
  });
