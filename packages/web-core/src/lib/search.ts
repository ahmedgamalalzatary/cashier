const DIACRITICS = /[ً-ْـ]/g;

export function normalizeArabic(value: string): string {
  return value
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesQuery(
  query: string,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const needle = normalizeArabic(query);
  if (!needle) return true;
  return fields.some((field) =>
    normalizeArabic(field === null || field === undefined ? "" : String(field)).includes(
      needle
    )
  );
}
