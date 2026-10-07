import { Suspense } from "react";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { PurchaseInvoiceForm } from "@/components/purchases/purchase-invoice-form";
import { LoadingState } from "@cashier/web-core/components/ui/states";

export default function NewPurchasePage() {
  return (
    <div>
      <PageHeader
        back={{ href: "/purchases", label: "رجوع إلى المشتريات" }}
        title="فاتورة شراء جديدة"
        description="سجّل المورد والأصناف هنا؛ تُضاف الكميات فوراً إلى المخزن الرئيسي."
      />
      <Suspense fallback={<LoadingState label="جارِ تجهيز الفاتورة…" />}>
        <PurchaseInvoiceForm />
      </Suspense>
    </div>
  );
}
