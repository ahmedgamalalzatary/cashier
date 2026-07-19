import { PageHeader } from "@/components/ui/page-header";

export default function Home() {
  return (
    <div>
      <PageHeader title="الرئيسية" />
      <p className="text-muted">
        مرحباً بك في نظام الكاشير والمخازن. ابدأ من قائمة الموردين — باقي الأقسام قيد الإنشاء.
      </p>
    </div>
  );
}
