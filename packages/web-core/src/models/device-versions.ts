import type { DeviceStatus } from "@cashier/shared";

/** How many branches run one desktop version; null = linked but never reported. */
export type VersionInUse = { version: string | null; branches: number };

/** Numeric, part by part, so 0.2.10 sorts above 0.2.4. */
function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return left.localeCompare(right);
}

/** The desktop versions still in use, newest first, for deciding what to support. */
export function versionsInUse(devices: DeviceStatus[]): VersionInUse[] {
  const counts = new Map<string | null, number>();
  for (const device of devices)
    counts.set(device.appVersion, (counts.get(device.appVersion) ?? 0) + 1);
  return [...counts]
    .map(([version, branches]) => ({ version, branches }))
    .sort((left, right) =>
      left.version === null
        ? 1
        : right.version === null
          ? -1
          : compareVersions(right.version, left.version),
    );
}
