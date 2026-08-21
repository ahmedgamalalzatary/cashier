import type { ExternalProductCatalog } from "@cashier/shared";

export function CatalogSyncStatus({
  catalog,
}: {
  catalog: ExternalProductCatalog;
}) {
  return (
    <p
      className={`mb-4 rounded-lg p-3 text-sm ${
        catalog.stale ? "bg-warning/10 text-warning" : "bg-paper text-muted"
      }`}
    >
      {catalog.stale
        ? `نعرض آخر نسخة محفوظة لأن التحديث الخارجي تعذر${
            catalog.syncError ? ` (${catalog.syncError})` : ""
          }. `
        : ""}
      آخر تحديث ناجح:{" "}
      {catalog.lastSuccessfulSyncAt
        ? new Date(catalog.lastSuccessfulSyncAt).toLocaleString("ar-EG")
        : "لم تتم مزامنة الكتالوج بنجاح بعد"}
    </p>
  );
}
