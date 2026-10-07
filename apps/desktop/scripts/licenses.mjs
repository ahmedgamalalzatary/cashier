import fs from "node:fs";
import path from "node:path";

/**
 * Reads the license of every bundled dependency so the installer ships the
 * third-party notices it is required to ship. Some packages leave a
 * package.json without a name inside a subfolder, so the search only stops at
 * a package.json that actually declares one.
 */
export function collectDependencyLicenses(root, inputs) {
  const packages = new Map();
  for (const input of inputs) {
    let directory = path.dirname(path.resolve(root, input));
    if (!directory.split(path.sep).includes("node_modules")) continue;
    while (path.dirname(directory) !== directory) {
      const packageFile = path.join(directory, "package.json");
      if (fs.existsSync(packageFile)) {
        const info = JSON.parse(fs.readFileSync(packageFile, "utf8"));
        if (info.name) {
          const license = fs
            .readdirSync(directory)
            .find((name) => /^licen[sc]e(?:\.(?:md|txt))?$/i.test(name));
          if (license && fs.statSync(path.join(directory, license)).isFile()) {
            packages.set(
              `${info.name}@${info.version}`,
              fs.readFileSync(path.join(directory, license), "utf8"),
            );
          }
          break;
        }
      }
      directory = path.dirname(directory);
    }
  }
  return packages;
}
