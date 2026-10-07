globalThis.fetch = async () => {
  throw new TypeError(
    "External network disabled for desktop runtime smoke test",
  );
};
