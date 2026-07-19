import { PageHeader } from "@/components/ui/page-header";

export default function Home() {
  return (
    <div>
      <PageHeader title="الرئيسية" />
      <p className="text-muted">
        مرحباً بك في نظام الكاشير والمخازن. اختر القسم المطلوب من القائمة لبدء العمل.
      </p>
    </div>
  );
}
