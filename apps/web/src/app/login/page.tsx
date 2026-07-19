"use client";

import { useState, type FormEvent } from "react";
import { Coffee, LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      await login(String(data.get("username")), String(data.get("password")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول");
      setLoading(false);
    }
  }

  return (
    <div className="login-stage grid min-h-screen lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="steam-lines" aria-hidden="true" />
        <div className="relative flex items-center gap-3 text-accent">
          <Coffee className="size-7" />
          <span className="text-xl font-bold text-white">الكافيه</span>
        </div>
        <div className="relative max-w-md pb-10">
          <p className="mb-4 text-sm font-medium text-accent">بداية الوردية</p>
          <h1 className="text-4xl font-bold leading-tight">كل شيء جاهز،<br />ابدأ من هنا.</h1>
          <p className="mt-5 max-w-sm leading-7 text-sidebar-ink">
            سجّل الدخول للوصول إلى نقطة البيع وإدارة المخزون والورديات حسب صلاحيتك.
          </p>
        </div>
      </section>

      <section className="grid place-items-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-sidebar text-accent"><Coffee /></span>
            <span className="text-xl font-bold">نظام الكافيه</span>
          </div>
          <div className="receipt-card rounded-2xl border border-line bg-surface p-7 shadow-[0_18px_50px_rgba(43,33,24,0.08)] sm:p-9">
            <div className="mb-7">
              <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="size-5" /></div>
              <h2 className="text-2xl font-bold">تسجيل الدخول</h2>
              <p className="mt-2 text-sm text-muted">أدخل بيانات حسابك للمتابعة.</p>
            </div>
            <form className="space-y-5" onSubmit={submit}>
              <Field label="اسم المستخدم" name="username" autoComplete="username" required autoFocus />
              <Field label="كلمة المرور" name="password" type="password" autoComplete="current-password" required />
              {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full justify-center py-2.5">
                {loading ? "جاري الدخول…" : "دخول"}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
