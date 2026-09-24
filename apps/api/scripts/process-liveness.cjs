"use strict";

const fs = require("fs");

function hasLivingProcess(marker, io = {}) {
  const pid = String(io.pid ?? process.pid);
  const readdirSync = io.readdirSync ?? ((dir) => fs.readdirSync(dir));
  const readFileSync =
    io.readFileSync ?? ((path, encoding) => fs.readFileSync(path, encoding));
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d) || d === pid) continue;
    try {
      const args = String(readFileSync(`/proc/${d}/cmdline`, "utf8")).split(
        "\0",
      );
      if (args.includes("-e")) continue;
      if (args.some((arg) => arg.includes(marker))) return true;
    } catch {
      /* process vanished */
    }
  }
  return false;
}

module.exports = { hasLivingProcess };

if (require.main === module) {
  const marker = process.argv[2];
  process.exit(marker && hasLivingProcess(marker) ? 0 : 1);
}
