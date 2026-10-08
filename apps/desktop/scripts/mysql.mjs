import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * The MySQL server shipped inside the installer. Oracle publishes only an MD5
 * for this ZIP, so the SHA-256 below was computed once from a download whose
 * size and MD5 (2e833921898a9a030ea6bfe81bd811bc) matched the official
 * https://dev.mysql.com/downloads/mysql/8.4.html page. Upgrading MySQL means
 * repeating that check and changing every field together.
 * Oracle moves older releases to the archive URL, so both are listed.
 */
export const MYSQL_PIN = Object.freeze({
  version: "8.4.11",
  archive: "mysql-8.4.11-winx64.zip",
  folder: "mysql-8.4.11-winx64",
  urls: Object.freeze([
    "https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11-winx64.zip",
    "https://cdn.mysql.com/archives/mysql-8.4/mysql-8.4.11-winx64.zip",
  ]),
  size: 281_191_914,
  sha256: "a492371d687d2bab088b0062581144a0044b8964baefdf4faa579292b423d25c",
});

/** Server, shutdown, backup and restore. */
export const MYSQL_PROGRAMS = Object.freeze([
  "mysqld.exe",
  "mysqladmin.exe",
  "mysqldump.exe",
  "mysql.exe",
]);
// what the programs above load (checked with `dumpbin /dependents`)
const MYSQL_LIBRARIES = [
  "libssl-3-x64.dll",
  "libcrypto-3-x64.dll",
  "libprotobuf-lite.dll",
  "abseil_dll.dll",
];
// the Visual C++ runtime is not in the ZIP and not on a clean Windows,
// so it ships next to the programs (Microsoft's app-local deployment)
const VC_RUNTIME = ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"];
const REQUIRED = [
  "LICENSE",
  ...[...MYSQL_PROGRAMS, ...MYSQL_LIBRARIES].map((file) => `bin/${file}`),
  "share/english/errmsg.sys",
];

async function matchesPin(file, pin) {
  if (!fs.existsSync(file) || fs.statSync(file).size !== pin.size) return false;
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex") === pin.sha256;
}

/**
 * Returns the cached archive, downloading it when it is absent or does not
 * match the pin. A finished download that does not match is refused outright.
 */
export async function ensureMysqlArchive({
  directory,
  pin = MYSQL_PIN,
  fetch = globalThis.fetch,
}) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, pin.archive);
  if (await matchesPin(file, pin)) return file;
  fs.rmSync(file, { force: true });
  const partial = `${file}.partial`;
  for (const url of pin.urls) {
    fs.rmSync(partial, { force: true });
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30 * 60_000),
      });
      if (!response.ok || !response.body) continue;
      await pipeline(
        Readable.fromWeb(response.body),
        fs.createWriteStream(partial),
      );
    } catch {
      continue;
    }
    if (!(await matchesPin(partial, pin))) {
      fs.rmSync(partial, { force: true });
      throw new Error(
        `The downloaded ${pin.archive} does not match its pinned size and checksum. It was deleted; do not bundle it.`,
      );
    }
    fs.renameSync(partial, file);
    return file;
  }
  fs.rmSync(partial, { force: true });
  throw new Error(
    `Cannot download MySQL ${pin.version}; retry runtime preparation when online.`,
  );
}

function listFiles(directory) {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .replaceAll("\\", "/"),
    )
    .sort();
}

/**
 * Unpacks the kept files into `destination`, replacing an older bundle. The
 * work happens in a sibling folder, so a failure never leaves a partial bundle.
 */
export function extractMysql({
  archive,
  pin = MYSQL_PIN,
  destination,
  vcRuntime,
  tar = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "tar.exe",
  ),
}) {
  const staging = `${destination}.partial`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    const members = [
      "LICENSE",
      ...[...MYSQL_PROGRAMS, ...MYSQL_LIBRARIES].map((file) => `bin/${file}`),
      "share",
    ].map((member) => `${pin.folder}/${member}`);
    const result = spawnSync(tar, ["-xf", archive, "-C", staging, ...members], {
      encoding: "utf8",
    });
    const unpacked = path.join(staging, pin.folder);
    for (const file of REQUIRED)
      if (!fs.existsSync(path.join(unpacked, file)))
        throw new Error(`The MySQL archive ${pin.archive} is missing ${file}.`);
    if (result.status !== 0)
      throw new Error(
        `Cannot extract ${pin.archive}: ${result.error?.message ?? result.stderr.trim()}`,
      );
    for (const file of VC_RUNTIME) {
      const source = path.join(vcRuntime, file);
      if (!fs.existsSync(source))
        throw new Error(
          `The Visual C++ runtime file ${file} was not found in ${vcRuntime}.`,
        );
      fs.copyFileSync(source, path.join(unpacked, "bin", file));
    }
    const files = Object.fromEntries(
      listFiles(unpacked).map((file) => [
        file,
        fs.statSync(path.join(unpacked, file)).size,
      ]),
    );
    fs.writeFileSync(
      path.join(unpacked, "bundle.json"),
      JSON.stringify(
        { version: pin.version, sha256: pin.sha256, files },
        null,
        2,
      ) + "\n",
    );
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(unpacked, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** True when `destination` holds a complete bundle of exactly this pin. */
export function mysqlBundleReady(destination, pin = MYSQL_PIN) {
  try {
    const bundle = JSON.parse(
      fs.readFileSync(path.join(destination, "bundle.json"), "utf8"),
    );
    if (bundle.version !== pin.version || bundle.sha256 !== pin.sha256)
      return false;
    return Object.entries(bundle.files).every(([file, size]) => {
      const target = path.join(destination, file);
      return fs.existsSync(target) && fs.statSync(target).size === size;
    });
  } catch {
    return false;
  }
}

/** Runs every bundled program, proving its libraries load on this machine. */
export function verifyMysqlTools(destination, pin = MYSQL_PIN) {
  for (const program of MYSQL_PROGRAMS) {
    const result = spawnSync(
      path.join(destination, "bin", program),
      ["--version"],
      { encoding: "utf8", timeout: 30_000, windowsHide: true },
    );
    if (result.status !== 0 || !result.stdout.includes(`Ver ${pin.version}`))
      throw new Error(
        `The bundled ${program} did not run: ${result.error?.message ?? (result.stderr || result.stdout).trim()}`,
      );
  }
}

/** Folder holding the Visual C++ runtime DLLs Microsoft allows apps to ship. */
export function findVcRuntime() {
  const vswhere = path.join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio/Installer/vswhere.exe",
  );
  const found = spawnSync(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    { encoding: "utf8" },
  );
  const installation = found.status === 0 ? found.stdout.trim() : "";
  const versionFile = path.join(
    installation,
    "VC/Auxiliary/Build/Microsoft.VCRedistVersion.default.txt",
  );
  if (!installation || !fs.existsSync(versionFile))
    throw new Error(
      "Cannot find the Visual C++ runtime to bundle with MySQL. Install the Visual Studio C++ build tools (already required by Rust).",
    );
  const redist = path.join(
    installation,
    "VC/Redist/MSVC",
    fs.readFileSync(versionFile, "utf8").trim(),
    "x64",
  );
  const crt = fs.existsSync(redist)
    ? fs
        .readdirSync(redist)
        .find((name) => /^Microsoft\.VC\d+\.CRT$/.test(name))
    : undefined;
  if (!crt)
    throw new Error(`Cannot find the Visual C++ runtime folder in ${redist}.`);
  return path.join(redist, crt);
}

/** Makes `destination` hold the verified, trimmed, runnable pinned MySQL. */
export async function prepareMysql({ cacheDirectory, destination }) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error(
      "The bundled MySQL is Windows x64 only; prepare the desktop app on Windows x64.",
    );
  if (!mysqlBundleReady(destination)) {
    const archive = await ensureMysqlArchive({ directory: cacheDirectory });
    extractMysql({ archive, destination, vcRuntime: findVcRuntime() });
  }
  verifyMysqlTools(destination);
}
