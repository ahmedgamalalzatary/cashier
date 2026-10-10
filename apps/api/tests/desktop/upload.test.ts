import { afterEach, describe, expect, it, vi } from "vitest";
import { requestUploadBatch, UnlinkedError } from "../../src/desktop/upload.js";
import {gunzipSync} from "node:zlib";

const options = {
  apiUrl: "https://online.example/api",
  deviceToken: "a-device-token-over-32-characters",
  appVersion: "0.3.0",
};

const body = {
  appVersion: "0.3.0",
  migrationCheckpoint: 1791405602054,
  rows: [
    {
      seq: 1,
      table: "employees",
      op: "upsert" as const,
      pk: { id: "a", branch_id: "b" },
      row: { id: "a", branch_id: "b", name: "Person" },
    },
  ],
};

afterEach(() => vi.useRealTimers());

describe("requesting an upload batch", () => {
  it("sends the agreed gzip body without changing the captured data",async()=>{
    let decoded:unknown;
    await requestUploadBatch(options,body,{fetch:async(_url,init)=>{
      expect(new Headers(init?.headers).get("Content-Encoding")).toBe("gzip");
      decoded=JSON.parse(gunzipSync(init!.body as Buffer).toString("utf8"));
      return Response.json({acknowledgedSeqs:[1]});
    }});
    expect(decoded).toEqual(body);
  });
  it("posts to the device ingest endpoint as this PC", async () => {
    let url: string | undefined;
    let headers: Headers | undefined;
    await requestUploadBatch(options, body, {
      fetch: async (target, init) => {
        url = String(target);
        headers = new Headers(init?.headers);
        return Response.json({ acknowledgedSeqs: [1] });
      },
    });

    expect(url).toBe("https://online.example/api/device/ingest");
    expect(headers?.get("Authorization")).toBe(
      "Device a-device-token-over-32-characters",
    );
    expect(headers?.get("X-Cashier-Version")).toBe("0.3.0");
    expect(headers?.get("Content-Type")).toBe("application/json");
  });

  it("returns the acknowledged sequences", async () => {
    const answer = await requestUploadBatch(options, body, {
      fetch: async () => Response.json({ acknowledgedSeqs: [1, 2] }),
    });
    expect(answer).toEqual({ acknowledgedSeqs: [1, 2] });
  });

  it("reports an unlinked PC so the worker can stop", async () => {
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => new Response("", { status: 401 }),
      }),
    ).rejects.toBeInstanceOf(UnlinkedError);
  });

  it("refuses a batch the site considers from a newer schema", async () => {
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => new Response("", { status: 409 }),
      }),
    ).rejects.toThrow(/newer/i);
  });

  it("rejects an answer that is not a list of sequences", async () => {
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => Response.json({ acknowledgedSeqs: "1" }),
      }),
    ).rejects.toThrow();
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => Response.json({ acknowledgedSeqs: [null] }),
      }),
    ).rejects.toThrow();
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => new Response("not json", { status: 200 }),
      }),
    ).rejects.toThrow();
  });

  it("keeps everything queued when the site answers with an error", async () => {
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => new Response("", { status: 500 }),
      }),
    ).rejects.toThrow(/500/);
  });

  it("reports an unreachable site plainly", async () => {
    await expect(
      requestUploadBatch(options, body, {
        fetch: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it("gives up on a request that hangs rather than blocking the worker", async () => {
    vi.useFakeTimers();
    let aborted = false;
    let notifyStarted!:()=>void;
    const started=new Promise<void>(resolve=>{notifyStarted=resolve;});
    const pending = requestUploadBatch({ ...options, timeoutMs: 50 }, body, {
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          notifyStarted();
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    });
    const rejection = expect(pending).rejects.toThrow("aborted");
    await started;
    await vi.advanceTimersByTimeAsync(60);
    await rejection;
    expect(aborted).toBe(true);
  });

  it("stops immediately when the worker is already shutting down", async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    await expect(
      requestUploadBatch({ ...options, signal: controller.signal }, body, {
        fetch: async () => {
          called = true;
          return Response.json({ acknowledgedSeqs: [] });
        },
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});
