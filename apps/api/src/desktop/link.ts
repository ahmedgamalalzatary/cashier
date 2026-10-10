import fs from "node:fs";
import path from "node:path";
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
// Online cannot say why it refused a code, so this stays honest: it may be
// wrong, expired, or already spent by an attempt whose answer was lost.
const NEW_CODE =
  "اطلب كود ربط جديدًا من المدير الرئيسي، لأن الكود المستعمل قد يكون انتهى أو استُهلك من محاولة سابقة.";

/** The link online answered with, held on disk until this PC finishes it. */
const pendingLink = z.object({
  branchId: z.string().uuid(),
  branchName: z.string().min(1),
  deviceToken: z.string().min(32),
});
export type PendingLink = z.infer<typeof pendingLink>;

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
    const reason_text = reason.success
      ? reason.data.error
      : `تعذر ربط الجهاز (${response.status})`;
    // A refused code is the one failure a person can act on, and retrying the
    // same code is exactly what cannot work once it has been spent.
    throw new Error(
      response.status === 400 ? `${reason_text} ${NEW_CODE}` : reason_text,
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
  if (
    !kept.some(
      (line) => line.split("=", 1)[0]?.trim() === "DESKTOP_SYNC_ENABLED",
    )
  )
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

/**
 * Removes the device token online has revoked, keeping BRANCH_ID and every
 * other line, so the next start shows the link screen for this same branch.
 * A token that a newer link already saved is left alone.
 */
export function forgetLink(settingsFile: string, revokedToken: string) {
  const text = fs.readFileSync(settingsFile, "utf8");
  if (parse(text).DEVICE_TOKEN?.trim() !== revokedToken) return;
  const kept = text
    .split(/\r?\n/)
    .filter((line) => line.split("=", 1)[0]?.trim() !== "DEVICE_TOKEN");
  const temporary = `${settingsFile}.tmp`;
  try {
    fs.writeFileSync(temporary, kept.join("\n"));
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
 * The local files a link touches. Separated so the interruption between each
 * step can be exercised without pretending the disk is real.
 */
export type LinkFiles = {
  read(): Record<string, string | undefined>;
  writeLink(link: { branchId: string; deviceToken: string }): void;
  /** The answer online gave, before this PC acted on it. */
  readPending(): PendingLink | null;
  writePending(pending: PendingLink): void;
  clearPending(): void;
};

/**
 * The settings file, and the record of a link that online accepted but this PC
 * has not finished writing. The record holds a device token, so it is created
 * readable only by this user, exactly like the other local secrets.
 */
export function fileLink(settingsFile: string): LinkFiles {
  const record = path.join(path.dirname(settingsFile), "pending-link.json");
  return {
    read: () => readSettings(settingsFile),
    writeLink: (link) => saveLink(settingsFile, link),
    readPending: () => {
      // Absent is the ordinary case: nothing was ever accepted. A file that is
      // there but unusable proves nothing, so it is treated the same way.
      try {
        const parsed = pendingLink.safeParse(
          JSON.parse(fs.readFileSync(record, "utf8")),
        );
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    writePending: (pending) => {
      const temporary = `${record}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(pending), { mode: 0o600 });
        fs.renameSync(temporary, record);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    },
    clearPending: () => fs.rmSync(record, { force: true }),
  };
}

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
  files = fileLink(settingsFile),
}: {
  settingsFile: string;
  code: string;
  appVersion: string;
  branches: LocalBranches;
  fetch?: typeof globalThis.fetch;
  files?: LinkFiles;
}) {
  const source = files.read();
  const existing = await branches.list();
  // Checked before anything else, so a code is never spent on a PC that
  // cannot take it.
  if (existing.length > 1) throw new Error(OTHER_BRANCH);
  const configuredBranch = source.BRANCH_ID?.trim() || undefined;
  if (
    configuredBranch &&
    !z.string().uuid().safeParse(configuredBranch).success
  )
    throw new Error("BRANCH_ID must be the UUID of this PC's branch");
  if (
    configuredBranch &&
    existing.length === 1 &&
    existing[0].id !== configuredBranch
  )
    throw new Error(OTHER_BRANCH);
  const pending = files.readPending();
  // The settings already carry this link: the last step finished and only the
  // removal of the record was lost.
  if (
    pending &&
    source.BRANCH_ID?.trim() === pending.branchId &&
    source.DEVICE_TOKEN?.trim() === pending.deviceToken
  ) {
    files.clearPending();
    throw new Error(ALREADY_LINKED);
  }
  if (pending) {
    if (configuredBranch && configuredBranch !== pending.branchId)
      throw new Error(OTHER_BRANCH);
    // Finished earlier and only half applied. Applied now without spending
    // another code, and only where it cannot contradict this PC's own data.
    if (existing.length === 1 && existing[0].id !== pending.branchId)
      throw new Error(OTHER_BRANCH);
    await branches.save({
      id: pending.branchId,
      name: pending.branchName,
    });
    files.writeLink({
      branchId: pending.branchId,
      deviceToken: pending.deviceToken,
    });
    files.clearPending();
    return {
      id: pending.branchId,
      name: pending.branchName,
    };
  }
  if (configuredBranch && (source.DEVICE_TOKEN?.trim().length ?? 0) >= 32)
    throw new Error(ALREADY_LINKED);
  const expectedBranchId = existing[0]?.id ?? configuredBranch;
  const apiUrl = onlineApiUrl(source);
  const { deviceToken, branch } = await requestLink({
    apiUrl,
    code,
    appVersion,
    // Told online before it spends the code, so a code this PC cannot take
    // never reaches the target branch. An online build too old to know the
    // field answers as before, and this check still catches that.
    ...(expectedBranchId ? { expectedBranchId } : {}),
    fetch,
  });
  if (expectedBranchId && expectedBranchId !== branch.id)
    throw new Error(OTHER_BRANCH);
  // Online has already committed and will not give this answer again, so it is
  // written down before anything local can fail.
  files.writePending({
    branchId: branch.id,
    branchName: branch.name,
    deviceToken,
  });
  await branches.save(branch);
  files.writeLink({ branchId: branch.id, deviceToken });
  files.clearPending();
  return branch;
}

/** This PC's branches table. Online issues codes for open branches only. */
/**
 * Finishes a link that a previous start accepted from online but did not
 * complete. The shell runs this before deciding whether to ask for a code,
 * so a PC whose answer was already recorded is never asked to spend another
 * one. Answers null when there is nothing to finish.
 */
export async function resumePendingLink({
  settingsFile,
  branches,
  fetch,
  files = fileLink(settingsFile),
}: {
  settingsFile: string;
  branches: LocalBranches;
  fetch?: typeof globalThis.fetch;
  files?: LinkFiles;
}) {
  const pending = files.readPending();
  if (!pending) return null;
  const source = files.read();
  // The settings already carry this link, so the last step finished and only
  // the removal of the record was lost: tidy up and report nothing to do.
  if (
    source.BRANCH_ID?.trim() === pending.branchId &&
    source.DEVICE_TOKEN?.trim() === pending.deviceToken
  ) {
    files.clearPending();
    return null;
  }
  return linkDesktop({
    settingsFile,
    code: "",
    appVersion: "",
    branches,
    fetch,
    files,
  });
}

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
