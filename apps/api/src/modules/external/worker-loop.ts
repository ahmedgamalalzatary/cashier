export async function runRefreshLoop(
  refresh: () => Promise<unknown>,
  signal: AbortSignal,
  reportError: (error: unknown) => void = (error) =>
    console.error("Cache refresh failed", error),
) {
  while (!signal.aborted) {
    try {
      await refresh();
    } catch (error) {
      if (!signal.aborted) reportError(error);
    }
    if (signal.aborted) break;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, 5_000);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
