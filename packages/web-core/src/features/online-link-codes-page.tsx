"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "../components/auth/auth-provider";
import { useBranch } from "../components/branches/branch-provider";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
import { Section } from "../components/ui/section";
import { SelectField } from "../components/ui/select-field";
import { ErrorBanner } from "../components/ui/states";
import { generateLinkCode } from "../services/link-codes-service";

/**
 * One-time link codes for shop PCs (plan Phase 8.3). Only the super-admin may
 * mint one, and only for a branch that is not archived: a PC is linked to the
 * branch it will serve, so a stale code for a closed branch must be impossible.
 */
export function OnlineLinkCodesPage() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const [branchId, setBranchId] = useState("");
  const [issued, setIssued] = useState<{
    code: string;
    branchId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user?.isSuperAdmin)
    return <ErrorBanner>لا تملك صلاحية إنشاء أكواد الربط</ErrorBanner>;

  const openBranches = branches.filter((branch) => branch.isActive);
  const branchName = (id: string) =>
    openBranches.find((branch) => branch.id === id)?.name ?? "";

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const { code } = await generateLinkCode(branchId);
      setIssued({ code, branchId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء الكود");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="أكواد ربط الأجهزة"
        description="كود يُكتب مرة واحدة على جهاز الكاشير ليربطه بهذا الفرع."
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Section title="كود جديد">
        <SelectField
          label="الفرع"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          disabled={busy}
        >
          <option value="">اختر الفرع</option>
          {openBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </SelectField>
        <Button
          onClick={() => {
            void generate();
          }}
          disabled={busy || !branchId}
        >
          <KeyRound className="size-4" />
          إنشاء كود ربط
        </Button>
        <p className="text-sm text-muted">
          إنشاء كود جديد يُلغي أي كود سابق لم يُستخدم لنفس الفرع.
        </p>
      </Section>
      {issued && (
        <Section title="الكود">
          <div className="space-y-2">
            <p className="text-sm text-muted">
              كود ربط فرع {branchName(issued.branchId)} — ينتهي خلال 24 ساعة
            </p>
            <p className="font-mono text-2xl tracking-[0.3em] select-all">
              {issued.code}
            </p>
            <p className="text-sm text-danger">
              لن يظهر هذا الكود مرة أخرى. انسخه الآن قبل إغلاق الصفحة.
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}
