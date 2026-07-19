import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PurchaseInvoiceForm } from "@/components/purchases/purchase-invoice-form";

export default function NewPurchasePage() {
  return (
    <div>
      <Link
        href="/purchases"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" /> رجوع إلى المشتريات
      </Link>
      <PageHeader title="فاتورة شراء جديدة" />
      <PurchaseInvoiceForm />
    </div>
  );
}
