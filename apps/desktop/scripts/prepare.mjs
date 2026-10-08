import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { collectDependencyLicenses } from "./licenses.mjs";
import { MYSQL_PIN, prepareMysql } from "./mysql.mjs";

const desktop = path.resolve(import.meta.dirname, "..");
const root = path.resolve(desktop, "../..");
const native = path.join(desktop, "src-tauri");
const runtime = path.join(native, "runtime");
const binaryDirectory = path.join(native, "binaries");
const rust = spawnSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
});
if (rust.status !== 0)
  throw new Error(
    "Rust must be available on PATH before preparing the desktop runtime.",
  );
const target = rust.stdout.trim();
if (process.platform === "win32" && process.arch !== "x64")
  throw new Error("This Windows installer currently targets x64.");
fs.mkdirSync(runtime, { recursive: true });
fs.mkdirSync(binaryDirectory, { recursive: true });
await prepareMysql({
  cacheDirectory: path.join(desktop, ".cache/mysql"),
  destination: path.join(runtime, "mysql"),
});
const binary = path.join(
  binaryDirectory,
  `cashier-node-${target}${process.platform === "win32" ? ".exe" : ""}`,
);
fs.copyFileSync(process.execPath, binary);
const licenseFile = path.join(runtime, "node-LICENSE.txt");
const existingManifest = path.join(runtime, "manifest.json");
const sameNode =
  fs.existsSync(existingManifest) &&
  JSON.parse(fs.readFileSync(existingManifest, "utf8")).nodeVersion ===
    process.version;
if (!sameNode || !fs.existsSync(licenseFile)) {
  const response = await fetch(
    `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok)
    throw new Error(
      "Cannot download the bundled Node license; retry runtime preparation when online.",
    );
  fs.writeFileSync(licenseFile, await response.text());
}
const bundled = await build({
  absWorkingDir: root,
  metafile: true,
  entryPoints: [path.join(root, "apps/api/src/desktop/main.ts")],
  outfile: path.join(runtime, "api.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  banner: {
    js: "import { createRequire as __cashierCreateRequire } from 'node:module'; const require = __cashierCreateRequire(import.meta.url);",
  },
  logLevel: "warning",
});
const packages = collectDependencyLicenses(
  root,
  Object.keys(bundled.metafile.inputs),
);
fs.writeFileSync(
  path.join(runtime, "dependency-LICENSES.txt"),
  [...packages].map(([name, text]) => `--- ${name} ---\n${text}`).join("\n\n"),
);
// The app applies these itself on start (plan 5.3).
const migrations = path.join(runtime, "migrations");
fs.rmSync(migrations, { recursive: true, force: true });
fs.cpSync(path.join(root, "packages/db/drizzle"), migrations, {
  recursive: true,
});
const journal = JSON.parse(
  fs.readFileSync(
    path.join(root, "packages/db/drizzle/meta/_journal.json"),
    "utf8",
  ),
);
const version = JSON.parse(
  fs.readFileSync(path.join(desktop, "package.json"), "utf8"),
).version;
fs.writeFileSync(
  path.join(runtime, "manifest.json"),
  JSON.stringify(
    {
      version,
      nodeVersion: process.version,
      target,
      schemaCreatedAt: journal.entries.at(-1).when,
      schemaMigration: journal.entries.at(-1).tag,
    },
    null,
    2,
  ) + "\n",
);
fs.copyFileSync(
  path.join(desktop, "settings.example.env"),
  path.join(runtime, "settings.example.env"),
);
console.log(
  `Prepared desktop API, Node ${process.version} and MySQL ${MYSQL_PIN.version} for ${target}. No local credentials included.`,
);
