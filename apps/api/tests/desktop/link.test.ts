import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_ONLINE_API_URL,
  linkDesktop,
  onlineApiUrl,
  readSettings,
  requestLink,
  saveLink,
  type LocalBranches,
} from "../../src/desktop/link.js";

const BRANCH = {
  id: "019a1234-5678-7000-8000-000000000020",
  name: "فرع الشمال",
};
const TOKEN = "a".repeat(43);

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-link-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function settingsFile(contents: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-link-"));
  directories.push(directory);
  const file = path.join(directory, "settings.env");
  fs.writeFileSync(file, contents);
  return file;
}

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("online address", () => {
  it("uses the Cashier site unless the settings name another", () => {
    expect(onlineApiUrl({})).toBe(DEFAULT_ONLINE_API_URL);
    expect(DEFAULT_ONLINE_API_URL).toBe("https://cashier.biscofa.tech/api");
    expect(onlineApiUrl({ ONLINE_API_URL: "https://other.example/api/" })).toBe(
      "https://other.example/api",
    );
  });

  it("allows plain http only to this PC, for development", () => {
    expect(onlineApiUrl({ ONLINE_API_URL: "http://127.0.0.1:4001/api" })).toBe(
      "http://127.0.0.1:4001/api",
    );
    expect(() =>
      onlineApiUrl({ ONLINE_API_URL: "http://cashier.example/api" }),
    ).toThrow("ONLINE_API_URL");
    expect(() => onlineApiUrl({ ONLINE_API_URL: "not a url" })).toThrow(
      "ONLINE_API_URL",
    );
  });
});

describe("asking online to link this PC", () => {
  const ask = (fetch: typeof globalThis.fetch) =>
    requestLink({
      apiUrl: "https://cashier.example/api",
      code: "abcd-2345",
      appVersion: "0.3.0",
      fetch,
    });

  it("sends the typed code with this app's version and returns the branch", async () => {
    const fetch = answer(201, { deviceToken: TOKEN, branch: BRANCH });

    await expect(ask(fetch)).resolves.toEqual({
      deviceToken: TOKEN,
      branch: BRANCH,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://cashier.example/api/device/link");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ code: "abcd-2345" });
    expect(new Headers(init.headers).get("X-Cashier-Version")).toBe("0.3.0");
  });

  it("shows the server's reason for a refused or limited code", async () => {
    const reason = "كود الربط غير صحيح أو منتهي الصلاحية";

    await expect(ask(answer(400, { error: reason }))).rejects.toThrow(reason);
    await expect(ask(answer(429, { error: "محاولات كثيرة" }))).rejects.toThrow(
      "محاولات كثيرة",
    );
  });

  it("explains that linking needs the internet when the site cannot be reached", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(ask(fetch)).rejects.toThrow("الإنترنت");
  });

  it("refuses an answer that is not a usable link", async () => {
    await expect(
      ask(answer(201, { deviceToken: "", branch: BRANCH })),
    ).rejects.toThrow();
    await expect(
      ask(answer(201, { deviceToken: TOKEN, branch: { id: "1", name: "x" } })),
    ).rejects.toThrow();
  });
});

describe("saving the link", () => {
  it("adds the branch and token and keeps every other setting", () => {
    const file = settingsFile(
      'MYSQL_PASSWORD="secret"\nBRANCH_ID=""\nDESKTOP_SYNC_ENABLED=false\n',
    );

    saveLink(file, { branchId: BRANCH.id, deviceToken: TOKEN });

    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain('MYSQL_PASSWORD="secret"');
    expect(text).toContain("DESKTOP_SYNC_ENABLED=false");
    expect(text).toContain(`BRANCH_ID="${BRANCH.id}"`);
    expect(text).toContain(`DEVICE_TOKEN="${TOKEN}"`);
    expect(text.match(/BRANCH_ID=/g)).toHaveLength(1);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["settings.env"]);
  });

  it("turns background syncing off on a PC that never chose", () => {
    // A fresh install has no synchronization switch, and the settings loader
    // defaults it to on, which then demands upstream credentials a new PC
    // does not have. Linking is where the choice is made.
    const file = settingsFile(
      'MYSQL_PASSWORD="secret"\nMYSQL_ROOT_PASSWORD="root"\nJWT_SECRET="x"\n',
    );

    saveLink(file, { branchId: BRANCH.id, deviceToken: TOKEN });

    expect(readSettings(file).DESKTOP_SYNC_ENABLED).toBe("false");
  });

  it("leaves a chosen synchronization setting exactly as it was", () => {
    const file = settingsFile(
      'DESKTOP_SYNC_ENABLED="true"\nEXTERNAL_ORDERS_BASE_URL="https://orders.example.com"\n',
    );

    saveLink(file, { branchId: BRANCH.id, deviceToken: TOKEN });

    const text = fs.readFileSync(file, "utf8");
    expect(readSettings(file).DESKTOP_SYNC_ENABLED).toBe("true");
    expect(text).toContain('EXTERNAL_ORDERS_BASE_URL="https://orders.example.com"');
    expect(text.match(/DESKTOP_SYNC_ENABLED=/g)).toHaveLength(1);
  });
});

function localBranches(ids: string[]): LocalBranches & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    list: async () => ids.map((id) => ({ id })),
    save: async (branch) => {
      saved.push(branch);
    },
  };
}

describe("linking this PC", () => {
  const link = (
    file: string,
    branches: LocalBranches,
    fetch: typeof globalThis.fetch = answer(201, {
      deviceToken: TOKEN,
      branch: BRANCH,
    }),
  ) =>
    linkDesktop({
      settingsFile: file,
      code: "ABCD2345",
      appVersion: "0.3.0",
      branches,
      fetch,
    });

  it("stores the branch locally before saving the settings that point to it", async () => {
    const file = settingsFile('JWT_SECRET="x"\n');
    const branches = localBranches([]);

    await expect(link(file, branches)).resolves.toEqual(BRANCH);

    expect(branches.saved).toEqual([BRANCH]);
    expect(fs.readFileSync(file, "utf8")).toContain(`DEVICE_TOKEN="${TOKEN}"`);
  });

  it("refuses a PC that is already linked without asking online", async () => {
    const file = settingsFile(`BRANCH_ID="${BRANCH.id}"\n`);
    const fetch = answer(201, { deviceToken: TOKEN, branch: BRANCH });

    await expect(link(file, localBranches([BRANCH.id]), fetch)).rejects.toThrow(
      "مربوط",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a database that already holds several branches without asking online", async () => {
    const file = settingsFile("");
    const fetch = answer(201, { deviceToken: TOKEN, branch: BRANCH });

    await expect(
      link(
        file,
        localBranches([BRANCH.id, "019a1234-5678-7000-8000-000000000021"]),
        fetch,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finishes an interrupted link of the same branch", async () => {
    // The branch row was saved but the settings were not.
    const file = settingsFile("");
    const branches = localBranches([BRANCH.id]);

    await expect(link(file, branches)).resolves.toEqual(BRANCH);
    expect(fs.readFileSync(file, "utf8")).toContain(`BRANCH_ID="${BRANCH.id}"`);
  });

  it("saves nothing when the code belongs to another branch than this PC's data", async () => {
    const file = settingsFile("");
    const branches = localBranches(["019a1234-5678-7000-8000-000000000021"]);

    await expect(link(file, branches)).rejects.toThrow();

    expect(branches.saved).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toBe("");
  });

  it("saves nothing when online refuses the code", async () => {
    const file = settingsFile("");
    const branches = localBranches([]);

    await expect(
      link(file, branches, answer(400, { error: "كود غير صحيح" })),
    ).rejects.toThrow("كود غير صحيح");

    expect(branches.saved).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toBe("");
  });
});
