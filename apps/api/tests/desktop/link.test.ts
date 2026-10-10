import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_ONLINE_API_URL,
  fileLink,
  forgetLink,
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
    expect(text).toContain(
      'EXTERNAL_ORDERS_BASE_URL="https://orders.example.com"',
    );
    expect(text.match(/DESKTOP_SYNC_ENABLED=/g)).toHaveLength(1);
  });
});

describe("forgetting a link that online revoked", () => {
  it("removes only the device token, so the next start asks for a code for the same branch", () => {
    const file = settingsFile(
      `MYSQL_PASSWORD="secret"\r\nBRANCH_ID="${BRANCH.id}"\r\nDEVICE_TOKEN="${TOKEN}"\r\nDESKTOP_SYNC_ENABLED=false\r\n`,
    );

    forgetLink(file, TOKEN);

    expect(readSettings(file)).toEqual({
      MYSQL_PASSWORD: "secret",
      BRANCH_ID: BRANCH.id,
      DESKTOP_SYNC_ENABLED: "false",
    });
    expect(fs.readdirSync(path.dirname(file))).toEqual(["settings.env"]);
  });

  it("keeps a token that a newer link already saved", () => {
    const newer = "b".repeat(43);
    const contents = `BRANCH_ID="${BRANCH.id}"\nDEVICE_TOKEN="${newer}"\n`;
    const file = settingsFile(contents);

    forgetLink(file, TOKEN);

    expect(fs.readFileSync(file, "utf8")).toBe(contents);
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
    const file = settingsFile(
      `BRANCH_ID="${BRANCH.id}"\nDEVICE_TOKEN="${TOKEN}"\n`,
    );
    const fetch = answer(201, { deviceToken: TOKEN, branch: BRANCH });

    await expect(link(file, localBranches([BRANCH.id]), fetch)).rejects.toThrow(
      "مربوط",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("links a manually configured branch that has no device token yet", async () => {
    const file = settingsFile(`BRANCH_ID="${BRANCH.id}"\n`);
    const sent: unknown[] = [];
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json(
        { deviceToken: TOKEN, branch: BRANCH },
        { status: 201 },
      );
    };
    await expect(link(file, localBranches([]), fetch)).resolves.toEqual(BRANCH);
    expect(sent).toEqual([{ code: "ABCD2345", expectedBranchId: BRANCH.id }]);
    expect(readSettings(file).DEVICE_TOKEN).toBe(TOKEN);
  });

  it("refuses conflicting preset and stored branches before spending a code", async () => {
    const file = settingsFile(
      'BRANCH_ID="019a1234-5678-7000-8000-000000000021"\n',
    );
    const fetch = answer(201, { deviceToken: TOKEN, branch: BRANCH });
    await expect(
      link(file, localBranches([BRANCH.id]), fetch),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not resume a saved answer over a different preset branch", async () => {
    const file = settingsFile(`BRANCH_ID="${BRANCH.id}"\n`);
    fileLink(file).writePending({
      branchId: "019a1234-5678-7000-8000-000000000021",
      branchName: "Other branch",
      deviceToken: TOKEN,
    });
    const held = localBranches([]);
    await expect(link(file, held)).rejects.toThrow();
    expect(held.saved).toHaveLength(0);
    expect(readSettings(file).BRANCH_ID).toBe(BRANCH.id);
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

  it("tells online which branch this PC already holds, so a code for another branch is never spent", async () => {
    const file = settingsFile("");
    const sent: unknown[] = [];
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ deviceToken: TOKEN, branch: BRANCH }),
          {
            status: 201,
          },
        );
      },
    );

    await expect(
      link(file, localBranches([BRANCH.id]), fetch as never),
    ).resolves.toEqual(BRANCH);

    expect(sent).toEqual([{ code: "ABCD2345", expectedBranchId: BRANCH.id }]);
  });

  it("says nothing about branches when this PC holds none", async () => {
    const file = settingsFile("");
    const sent: unknown[] = [];
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ deviceToken: TOKEN, branch: BRANCH }),
          {
            status: 201,
          },
        );
      },
    );

    await expect(
      link(file, localBranches([]), fetch as never),
    ).resolves.toEqual(BRANCH);

    // an older online build must keep seeing exactly what it saw before
    expect(sent).toEqual([{ code: "ABCD2345" }]);
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

describe("a link that online accepted but this PC did not finish", () => {
  const OTHER = { id: "019a1234-5678-7000-8000-000000000021", name: "فرع آخر" };
  const pendingPath = (file: string) =>
    path.join(path.dirname(file), "pending-link.json");
  const writePending = (file: string, value: unknown) =>
    fs.writeFileSync(pendingPath(file), JSON.stringify(value));
  /** Any online request would be a bug: the answer is already on disk. */
  const noOnline: typeof globalThis.fetch = () => {
    throw new Error("online must not be asked again");
  };

  it("writes the record before the branch row, so a crash still finds it", async () => {
    const file = settingsFile("");
    const seen: (string | null)[] = [];
    const branches: LocalBranches = {
      list: async () => [],
      save: async () => {
        seen.push(fs.existsSync(pendingPath(file)) ? "recorded" : null);
      },
    };

    await linkDesktop({
      settingsFile: file,
      code: "ABCD2345",
      appVersion: "0.3.0",
      branches,
      fetch: answer(201, { deviceToken: TOKEN, branch: BRANCH }),
    });

    expect(seen).toEqual(["recorded"]);
    // and it is gone once the settings carry the link
    expect(fs.existsSync(pendingPath(file))).toBe(false);
  });

  it("finishes the settings on the next start without asking online again", async () => {
    const file = settingsFile("");
    writePending(file, {
      branchId: BRANCH.id,
      branchName: BRANCH.name,
      deviceToken: TOKEN,
    });
    const branches = localBranches([]);

    await expect(
      linkDesktop({
        settingsFile: file,
        code: "ABCD2345",
        appVersion: "0.3.0",
        branches,
        fetch: noOnline,
      }),
    ).resolves.toEqual(BRANCH);

    expect(branches.saved).toEqual([BRANCH]);
    expect(fs.readFileSync(file, "utf8")).toContain(`DEVICE_TOKEN="${TOKEN}"`);
    expect(fs.existsSync(pendingPath(file))).toBe(false);
  });

  it("finishes only the settings when the branch row was already saved", async () => {
    const file = settingsFile('JWT_SECRET="keep me"\n');
    writePending(file, {
      branchId: BRANCH.id,
      branchName: BRANCH.name,
      deviceToken: TOKEN,
    });
    const branches = localBranches([BRANCH.id]);

    await linkDesktop({
      settingsFile: file,
      code: "ABCD2345",
      appVersion: "0.3.0",
      branches,
      fetch: noOnline,
    });

    // the same branch is only named again, never added twice
    expect(branches.saved).toEqual([BRANCH]);
    const settings = fs.readFileSync(file, "utf8");
    expect(settings).toContain(`BRANCH_ID="${BRANCH.id}"`);
    // settings this PC already had are kept
    expect(settings).toContain('JWT_SECRET="keep me"');
  });

  it("clears a stale record once the settings already carry the link", async () => {
    const file = settingsFile(
      `BRANCH_ID="${BRANCH.id}"\nDEVICE_TOKEN="${TOKEN}"\n`,
    );
    writePending(file, {
      branchId: BRANCH.id,
      branchName: BRANCH.name,
      deviceToken: TOKEN,
    });

    await expect(
      linkDesktop({
        settingsFile: file,
        code: "ABCD2345",
        appVersion: "0.3.0",
        branches: localBranches([BRANCH.id]),
        fetch: noOnline,
      }),
    ).rejects.toThrow("مربوط");
    // recognised as finished, then cleaned up rather than left to rot
    expect(fs.existsSync(pendingPath(file))).toBe(false);
  });

  it("refuses a record for another branch than this PC holds", async () => {
    const file = settingsFile("");
    writePending(file, {
      branchId: OTHER.id,
      branchName: OTHER.name,
      deviceToken: TOKEN,
    });
    const branches = localBranches([BRANCH.id]);

    await expect(
      linkDesktop({
        settingsFile: file,
        code: "ABCD2345",
        appVersion: "0.3.0",
        branches,
        fetch: noOnline,
      }),
    ).rejects.toThrow("فرعًا آخر");

    expect(branches.saved).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toBe("");
    // kept, so the next start still refuses rather than linking the wrong branch
    expect(fs.existsSync(pendingPath(file))).toBe(true);
  });

  it("keeps the record when the settings write fails", async () => {
    const file = settingsFile("");
    const branches = localBranches([]);
    const files = fileLink(file);

    await expect(
      linkDesktop({
        settingsFile: file,
        code: "ABCD2345",
        appVersion: "0.3.0",
        branches,
        fetch: answer(201, { deviceToken: TOKEN, branch: BRANCH }),
        files: {
          ...files,
          writeLink: () => {
            throw new Error("the disk is full");
          },
        },
      }),
    ).rejects.toThrow("the disk is full");

    expect(branches.saved).toEqual([BRANCH]);
    expect(fs.existsSync(pendingPath(file))).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("");
  });

  it("never leaves the device token where anyone else can read it", async () => {
    const file = settingsFile("");
    let mode = 0;
    const branches: LocalBranches = {
      list: async () => [],
      save: async () => {
        mode = fs.statSync(pendingPath(file)).mode & 0o777;
      },
    };

    await linkDesktop({
      settingsFile: file,
      code: "ABCD2345",
      appVersion: "0.3.0",
      branches,
      fetch: answer(201, { deviceToken: TOKEN, branch: BRANCH }),
    });

    if (process.platform !== "win32") expect(mode).toBe(0o600);
  });

  it("tells the person a refused code may need replacing", async () => {
    const file = settingsFile("");

    await expect(
      linkDesktop({
        settingsFile: file,
        code: "ABCD2345",
        appVersion: "0.3.0",
        branches: localBranches([]),
        fetch: answer(400, { error: "كود الربط غير صحيح أو منتهي الصلاحية" }),
      }),
    ).rejects.toThrow("كود ربط جديد");
  });
});
