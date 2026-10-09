import fs from "node:fs";
import { parse } from "dotenv";
import { z } from "zod";
import { branches, type Db } from "@cashier/db";

/** Baked into the build (plan 7.2); `ONLINE_API_URL` in settings.env overrides it. */
export const DEFAULT_ONLINE_API_URL = "https://cashier.biscofa.tech/api";

const LINK_TIMEOUT_MS = 20_000;
const OFFLINE =
  "تعذر الاتصال بموقع كاشير. ربط الجهاز يحتاج إلى الإنترنت مرة واحدة؛ تأكد من الاتصال وحاول مرة أخرى.";
const ALREADY_LINKED = "هذا الجهاز مربوط بفرع بالفعل.";
const OTHER_BRANCH =
  "بيانات هذا الجهاز تخص فرعًا آخر. اطلب كود ربط لذلك الفرع.";

export function readSettings(settingsFile: string) {
  return parse(fs.readFileSync(settingsFile));
}

/** Where the online API lives. Plain http is allowed only to this PC (development). */
export function onlineApiUrl(source: Record<string, string | undefined>) {
  const configured = source.ONLINE_API_URL?.trim() || DEFAULT_ONLINE_API_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("ONLINE_API_URL must be a valid address");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("ONLINE_API_URL must use https");
  return configured.replace(/\/+$/, "");
}

const linkAnswer = z.object({
  deviceToken: z.string().min(32),
  branch: z.object({ id: z.string().uuid(), name: z.string().min(1) }),
});
export type LinkAnswer = z.infer<typeof linkAnswer>;

/** Exchanges the one-time code for this PC's device token (plan 7.4). */
export async function requestLink({
  apiUrl,
  code,
  appVersion,
  expectedBranchId,
  fetch = globalThis.fetch,
}: {
  apiUrl: string;
  code: string;
  appVersion: string;
  /** The branch this PC already holds; online refuses a code for any other. */
  expectedBranchId?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<LinkAnswer> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/device/link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cashier-Version": appVersion,
      },
      body: JSON.stringify(
        expectedBranchId === undefined ? { code } : { code, expectedBranchId },
      ),
      signal: AbortSignal.timeout(LINK_TIMEOUT_MS),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const reason = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      reason.success
        ? reason.data.error
        : `تعذر ربط الجهاز (${response.status})`,
    );
  }
  const parsed = linkAnswer.safeParse(body);
  if (!parsed.success)
    throw new Error("أعاد موقع كاشير ردًا غير متوقع؛ حاول مرة أخرى.");
  return parsed.data;
}

/**
 * Writes the branch and the device token into settings.env, keeping every
 * other line. The file is replaced in one step, so it is never half written.
 *
 * A PC that never chose also gets background syncing turned off. The settings
 * loader defaults it to on, which then demands upstream credentials that a new
 * PC does not have; an installation that configured syncing keeps its choice.
 */
export function saveLink(
  settingsFile: string,
  link: { branchId: string; deviceToken: string },
) {
  const values: Record<string, string> = {
    BRANCH_ID: link.branchId,
    DEVICE_TOKEN: link.deviceToken,
  };
  const kept = fs
    .readFileSync(settingsFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const key = line.split("=", 1)[0]?.trim();
      return line.trim() !== "" && !(key in values);
    });
  if (!kept.some((line) => line.split("=", 1)[0]?.trim() === "DESKTOP_SYNC_ENABLED"))
    values.DESKTOP_SYNC_ENABLED = "false";
  const lines = [
    ...kept,
    ...Object.entries(values).map(([key, value]) => `${key}="${value}"`),
  ];
  const temporary = `${settingsFile}.tmp`;
  try {
    fs.writeFileSync(temporary, lines.join("\n") + "\n");
    fs.renameSync(temporary, settingsFile);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** The local branches table, as linking needs it. */
export type LocalBranches = {
  list(): Promise<Array<{ id: string }>>;
  /** Inserts the branch, or renames it when this PC already holds it. */
  save(branch: { id: string; name: string }): Promise<void>;
};

/**
 * Links this PC to its branch (plan Phase 9, D12): online first, then the
 * branch row, then the settings that point to it. A crash between the last two
 * leaves the branch row alone, and linking again with that branch's code
 * finishes the job.
 */
export async function linkDesktop({
  settingsFile,
  code,
  appVersion,
  branches,
  fetch,
}: {
  settingsFile: string;
  code: string;
  appVersion: string;
  branches: LocalBranches;
  fetch?: typeof globalThis.fetch;
}) {
  const source = readSettings(settingsFile);
  if (source.BRANCH_ID?.trim()) throw new Error(ALREADY_LINKED);
  const apiUrl = onlineApiUrl(source);
  const existing = await branches.list();
  // Checked before asking online, so a code is never spent on a PC that
  // cannot take it.
  if (existing.length > 1) throw new Error(OTHER_BRANCH);
  const { deviceToken, branch } = await requestLink({
    apiUrl,
    code,
    appVersion,
    // Told online before it spends the code, so a code this PC cannot take
    // never reaches the target branch. An online build too old to know the
    // field answers as before, and this check still catches that.
    ...(existing.length === 1 ? { expectedBranchId: existing[0].id } : {}),
    fetch,
  });
  if (existing.length === 1 && existing[0].id !== branch.id)
    throw new Error(OTHER_BRANCH);
  await branches.save(branch);
  saveLink(settingsFile, { branchId: branch.id, deviceToken });
  return branch;
}

/** This PC's branches table. Online issues codes for open branches only. */
export function databaseBranches(db: Db): LocalBranches {
  return {
    list: () => db.select({ id: branches.id }).from(branches),
    save: async (branch) => {
      await db
        .insert(branches)
        .values(branch)
        .onDuplicateKeyUpdate({ set: { name: branch.name } });
    },
  };
}
