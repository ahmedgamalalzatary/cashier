import { PageHeader } from "@/components/ui/page-header";
import { PurchaseInvoiceForm } from "@/components/purchases/purchase-invoice-form";

export default function NewPurchasePage() {
  return (
    <div>
      <PageHeader
        back={{ href: "/purchases", label: "رجوع إلى المشتريات" }}
        title="فاتورة شراء جديدة"
        description="سجّل المورد والأصناف هنا؛ تُضاف الكميات فوراً إلى المخزن الرئيسي."
      />
      <PurchaseInvoiceForm />
    </div>
  );
}
