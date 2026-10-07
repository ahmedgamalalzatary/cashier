import fs from "node:fs";
import path from "node:path";
import { format } from "prettier";

export async function bumpDesktopVersion(directory, bump) {
  if (!["patch", "minor", "major"].includes(bump)) {
    throw new Error("Choose patch, minor, or major.");
  }
  const filenames = [
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
  ];
  const files = filenames.map((name) => path.join(directory, name));
  const original = files.map((filename) => fs.readFileSync(filename, "utf8"));
  const pkg = JSON.parse(original[0]);
  const config = JSON.parse(original[1]);
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version))
    throw new Error("Desktop version must be major.minor.patch.");
  const packageBlock = original[2].match(
    /^\[package\]([\s\S]*?)(?=^\[|(?![\s\S]))/m,
  )?.[0];
  const cargoName = packageBlock?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const cargoVersion = packageBlock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (
    !cargoName ||
    config.version !== pkg.version ||
    cargoVersion !== pkg.version
  ) {
    throw new Error(
      "Desktop manifests disagree; align their versions before releasing.",
    );
  }
  const parts = pkg.version.split(".").map(Number);
  const index = { major: 0, minor: 1, patch: 2 }[bump];
  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  if (!parts.every(Number.isSafeInteger))
    throw new Error("Version is too large.");
  const version = parts.join(".");
  pkg.version = config.version = version;
  const manifest = original[2].replace(
    packageBlock,
    packageBlock.replace(
      /^(version\s*=\s*")[^"]+(".*)$/m,
      (_line, prefix, suffix) => prefix + version + suffix,
    ),
  );
  let found = false;
  const lock = original[3].replace(
    /^\[\[package\]\]([\s\S]*?)(?=^\[\[package\]\]|$(?![\s\S]))/gm,
    (block) => {
      if (block.match(/^name\s*=\s*"([^"]+)"/m)?.[1] !== cargoName)
        return block;
      if (block.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== cargoVersion)
        throw new Error("Cargo lockfile version disagrees.");
      found = true;
      return block.replace(
        /^(version\s*=\s*")[^"]+(".*)$/m,
        (_line, prefix, suffix) => prefix + version + suffix,
      );
    },
  );
  if (!found) throw new Error("Desktop package is missing from Cargo.lock.");
  const updated = [
    await format(JSON.stringify(pkg), { parser: "json" }),
    await format(JSON.stringify(config), { parser: "json" }),
    manifest,
    lock,
  ];
  const temporary = files.map((filename) => `${filename}.version-tmp`);
  let committed = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      if (fs.readFileSync(files[i], "utf8") !== original[i])
        throw new Error("A manifest changed during versioning; retry.");
      fs.writeFileSync(temporary[i], updated[i], { flag: "wx" });
    }
    for (let i = 0; i < files.length; i++) {
      fs.renameSync(temporary[i], files[i]);
      committed++;
    }
  } catch (error) {
    for (let i = 0; i < committed; i++) fs.writeFileSync(files[i], original[i]);
    throw error;
  } finally {
    for (const filename of temporary)
      if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
  return version;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  try {
    const directoryFlag = process.argv.indexOf("--directory");
    const directory =
      directoryFlag === -1
        ? path.resolve(import.meta.dirname, "..")
        : path.resolve(process.argv[directoryFlag + 1]);
    console.log(
      `Desktop release version: ${await bumpDesktopVersion(directory, process.argv[2] ?? "patch")}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
