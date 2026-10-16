"use client";

import { ReportsPage } from "@cashier/web-core/features/reports-page";
import type { DocumentHref } from "@cashier/web-core/models/reports-model";

/** The desktop's document pages that a report reference opens. */
const documentHref: DocumentHref = (document, id) => {
  const query = encodeURIComponent(id);
  if (document === "order") return `/orders/detail?id=${query}`;
  if (document === "refund") return `/refunds?refund=${query}`;
  if (document === "purchase") return `/purchases/detail?id=${query}`;
  if (document === "transfer") return `/transfers/detail?id=${query}`;
  return `/recipes/preparations/detail?id=${query}`;
};

export default function Page() {
  return <ReportsPage documentHref={documentHref} />;
}
