import fs from "node:fs";
import path from "node:path";

// Tauri's build script makes Cargo watch every bundled file, so rewriting one
// with the same contents still recompiles the app. These only touch a file
// when its contents actually change.

const sameContents = (file, contents) => {
  try {
    return fs.readFileSync(file).equals(Buffer.from(contents));
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};

/** Writes `contents` to `file` unless it already holds exactly that. */
export function writeIfChanged(file, contents) {
  if (sameContents(file, contents)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/** Copies `source` over `destination` unless they already match. */
export function copyIfChanged(source, destination) {
  writeIfChanged(destination, fs.readFileSync(source));
}

/** Makes `destination` an exact copy of `source`, rewriting only what differs. */
export function syncDirectory(source, destination) {
  const wanted = new Set(
    fs
      .readdirSync(source, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path.relative(
          source,
          path.join(entry.parentPath ?? entry.path, entry.name),
        ),
      ),
  );
  for (const relative of wanted)
    copyIfChanged(
      path.join(source, relative),
      path.join(destination, relative),
    );
  if (!fs.existsSync(destination)) return;
  // deepest first, so a folder is checked after everything inside it
  const existing = fs
    .readdirSync(destination, { recursive: true, withFileTypes: true })
    .map((entry) => ({
      relative: path.relative(
        destination,
        path.join(entry.parentPath ?? entry.path, entry.name),
      ),
      folder: entry.isDirectory(),
    }))
    .sort((a, b) => b.relative.length - a.relative.length);
  for (const { relative, folder } of existing) {
    const full = path.join(destination, relative);
    if (folder) {
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    } else if (!wanted.has(relative)) fs.rmSync(full);
  }
}
