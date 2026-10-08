import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  MYSQL_PIN,
  MYSQL_PROGRAMS,
  ensureMysqlArchive,
  extractMysql,
  mysqlBundleReady,
  verifyMysqlTools,
} from "../scripts/mysql.mjs";

const windowsTar = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "tar.exe",
);

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-mysql-"));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), "cashier-mysql-")));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (relative, contents = relative) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  };
  return { root, write };
}

const KEPT = [
  "LICENSE",
  "bin/mysqld.exe",
  "bin/mysqladmin.exe",
  "bin/mysqldump.exe",
  "bin/mysql.exe",
  "bin/libssl-3-x64.dll",
  "bin/libcrypto-3-x64.dll",
  "bin/libprotobuf-lite.dll",
  "bin/abseil_dll.dll",
  "share/english/errmsg.sys",
  "share/charsets/Index.xml",
  "share/messages_to_clients.txt",
];
const DROPPED = [
  "README",
  "bin/mysqld.pdb",
  "bin/mysqlbinlog.exe",
  "bin/libprotobuf.dll",
  "bin/sasl2/saslSCRAM.dll",
  "lib/plugin/auth.dll",
  "include/mysql.h",
];
const VC_RUNTIME = ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"];

/** Builds a small ZIP shaped like the official one, plus its pin. */
function fixtureArchive(t, { omit = [] } = {}) {
  const { root, write } = scratch(t);
  const folder = "mysql-9.9.9-winx64";
  for (const file of [...KEPT, ...DROPPED].filter((f) => !omit.includes(f)))
    write(path.join("source", folder, file));
  for (const file of VC_RUNTIME) write(path.join("vc", file));
  const archive = path.join(root, `${folder}.zip`);
  const zipped = spawnSync(
    windowsTar,
    ["-a", "-cf", archive, "-C", path.join(root, "source"), folder],
    { encoding: "utf8" },
  );
  assert.equal(zipped.status, 0, zipped.stderr);
  const bytes = fs.readFileSync(archive);
  const pin = {
    version: "9.9.9",
    archive: path.basename(archive),
    folder,
    urls: ["https://primary.test/a.zip", "https://archive.test/a.zip"],
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return { root, archive, bytes, pin, vcRuntime: path.join(root, "vc") };
}

function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const next = responses[url];
    if (!next) return new Response("missing", { status: 404 });
    return new Response(next, { status: 200 });
  };
  return { fetch, calls };
}

const listFiles = (directory) =>
  fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .replaceAll("\\", "/"),
    )
    .sort();

test("pins the official MySQL 8.4 LTS Windows x64 noinstall ZIP", () => {
  assert.equal(MYSQL_PIN.version, "8.4.11");
  assert.equal(MYSQL_PIN.archive, "mysql-8.4.11-winx64.zip");
  assert.match(MYSQL_PIN.sha256, /^[0-9a-f]{64}$/);
  for (const url of MYSQL_PIN.urls)
    assert.match(
      url,
      /^https:\/\/cdn\.mysql\.com\/.+\/mysql-8\.4\.11-winx64\.zip$/,
    );
  assert.deepEqual(MYSQL_PROGRAMS, [
    "mysqld.exe",
    "mysqladmin.exe",
    "mysqldump.exe",
    "mysql.exe",
  ]);
});

test("downloads, verifies and caches the archive", async (t) => {
  const { bytes, pin } = fixtureArchive(t);
  const { root } = scratch(t);
  const { fetch, calls } = fakeFetch({ [pin.urls[0]]: bytes });

  const file = await ensureMysqlArchive({ directory: root, pin, fetch });

  assert.equal(file, path.join(root, pin.archive));
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.deepEqual(calls, [pin.urls[0]]);
  assert.deepEqual(fs.readdirSync(root), [pin.archive]);
});

test("reuses a verified cached archive without downloading", async (t) => {
  const { bytes, pin } = fixtureArchive(t);
  const { root } = scratch(t);
  fs.writeFileSync(path.join(root, pin.archive), bytes);
  const { fetch, calls } = fakeFetch({});

  await ensureMysqlArchive({ directory: root, pin, fetch });

  assert.deepEqual(calls, []);
});

test("replaces an incomplete or corrupt cached archive", async (t) => {
  const { bytes, pin } = fixtureArchive(t);
  const { root } = scratch(t);
  fs.writeFileSync(path.join(root, pin.archive), bytes.subarray(0, 10));
  const { fetch, calls } = fakeFetch({ [pin.urls[0]]: bytes });

  const file = await ensureMysqlArchive({ directory: root, pin, fetch });

  assert.deepEqual(calls, [pin.urls[0]]);
  assert.deepEqual(fs.readFileSync(file), bytes);
});

test("rejects a download whose checksum does not match the pin", async (t) => {
  const { bytes, pin } = fixtureArchive(t);
  const { root } = scratch(t);
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 1] ^= 0xff;
  const { fetch, calls } = fakeFetch({
    [pin.urls[0]]: tampered,
    [pin.urls[1]]: bytes,
  });

  await assert.rejects(
    ensureMysqlArchive({ directory: root, pin, fetch }),
    /checksum/i,
  );
  // a tampered file is suspicious: never fall back to another source
  assert.deepEqual(calls, [pin.urls[0]]);
  assert.deepEqual(fs.readdirSync(root), []);
});

test("falls back to the archive URL once the version leaves the main page", async (t) => {
  const { bytes, pin } = fixtureArchive(t);
  const { root } = scratch(t);
  const { fetch, calls } = fakeFetch({ [pin.urls[1]]: bytes });

  await ensureMysqlArchive({ directory: root, pin, fetch });

  assert.deepEqual(calls, pin.urls);
});

test("fails plainly when no source has the archive", async (t) => {
  const { pin } = fixtureArchive(t);
  const { root } = scratch(t);
  const { fetch } = fakeFetch({});

  await assert.rejects(
    ensureMysqlArchive({ directory: root, pin, fetch }),
    /cannot download mysql/i,
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test("extracts only the server, the three tools, their libraries and share/", (t) => {
  const { archive, pin, vcRuntime } = fixtureArchive(t);
  const { root } = scratch(t);
  const destination = path.join(root, "mysql");

  extractMysql({ archive, pin, destination, vcRuntime });

  const expected = [
    ...KEPT,
    ...VC_RUNTIME.map((file) => `bin/${file}`),
    "bundle.json",
  ].sort();
  assert.deepEqual(listFiles(destination), expected);
  assert.deepEqual(fs.readdirSync(root), ["mysql"]);
  assert.ok(mysqlBundleReady(destination, pin));
});

test("replaces an older bundle completely", (t) => {
  const { archive, pin, vcRuntime } = fixtureArchive(t);
  const { root, write } = scratch(t);
  const destination = path.join(root, "mysql");
  write("mysql/bin/stale.exe");

  extractMysql({ archive, pin, destination, vcRuntime });

  assert.ok(!fs.existsSync(path.join(destination, "bin/stale.exe")));
});

test("refuses an archive that lacks a required file", (t) => {
  const { archive, pin, vcRuntime } = fixtureArchive(t, {
    omit: ["bin/mysql.exe"],
  });
  const { root } = scratch(t);
  const destination = path.join(root, "mysql");

  assert.throws(
    () => extractMysql({ archive, pin, destination, vcRuntime }),
    /bin\/mysql\.exe/,
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test("refuses to build a bundle without the Visual C++ runtime", (t) => {
  const { archive, pin, vcRuntime } = fixtureArchive(t);
  const { root } = scratch(t);
  fs.rmSync(path.join(vcRuntime, "vcruntime140_1.dll"));

  assert.throws(
    () =>
      extractMysql({
        archive,
        pin,
        destination: path.join(root, "mysql"),
        vcRuntime,
      }),
    /vcruntime140_1\.dll/,
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test("a bundle with a missing file or another pin is not ready", (t) => {
  const { archive, pin, vcRuntime } = fixtureArchive(t);
  const { root } = scratch(t);
  const destination = path.join(root, "mysql");
  extractMysql({ archive, pin, destination, vcRuntime });

  assert.equal(mysqlBundleReady(destination, { ...pin, sha256: "0" }), false);
  fs.rmSync(path.join(destination, "bin/mysqldump.exe"));
  assert.equal(mysqlBundleReady(destination, pin), false);
  assert.equal(mysqlBundleReady(path.join(root, "absent"), pin), false);
});

const prepared = path.resolve(
  import.meta.dirname,
  "../src-tauri/runtime/mysql",
);
test(
  "the prepared bundle is the pinned MySQL and every tool runs",
  {
    skip:
      !fs.existsSync(prepared) &&
      "run `pnpm --filter @cashier/desktop prepare:desktop` first",
  },
  () => {
    assert.ok(mysqlBundleReady(prepared, MYSQL_PIN));
    assert.doesNotThrow(() => verifyMysqlTools(prepared, MYSQL_PIN));
  },
);

test("tool verification fails when a program cannot run", (t) => {
  const { archive, pin, vcRuntime } = fixtureArchive(t);
  const { root } = scratch(t);
  const destination = path.join(root, "mysql");
  extractMysql({ archive, pin, destination, vcRuntime });

  // fixture programs are text files, so Windows refuses to start them
  assert.throws(() => verifyMysqlTools(destination, pin), /mysqld\.exe/);
});
