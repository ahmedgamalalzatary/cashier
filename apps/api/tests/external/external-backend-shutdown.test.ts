import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ExternalBackendClient } from "../../src/modules/external/external-backend.client.js";

describe("external client shutdown", () => {
  it("cancels an in-flight upstream login when its owning worker stops", async () => {
    const shutdown = new AbortController();
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetcher: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        started();
        init!.signal!.addEventListener(
          "abort",
          () => reject(init!.signal!.reason),
          { once: true },
        );
      });
    const client = new ExternalBackendClient(
      {
        baseUrl: "https://orders.example",
        phoneNumber: "01234567890",
        password: "password",
      },
      fetcher,
      shutdown.signal,
    );
    const pending = client.get("/orders", z.array(z.unknown()));
    const failed = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await requestStarted;
    shutdown.abort();
    await failed;
  });
});
