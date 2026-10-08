"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Ban,
  CornerDownLeft,
  RotateCcw,
  Tags,
} from "lucide-react";
import type { Category } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { ConfirmDialog } from "@cashier/web-core/components/ui/confirm-dialog";
import { IconButton as IconBtn } from "@cashier/web-core/components/ui/icon-button";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Section } from "@cashier/web-core/components/ui/section";
import { EmptyState, ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { CategoryFormModal } from "@/components/categories/category-form-modal";
import {
  deactivateCategory,
  listCategories,
  reactivateCategory,
} from "@/services/categories-service";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{
    editing: Category | null;
    parent: Category | null;
  } | null>(null);
  const [confirming, setConfirming] = useState<Category | null>(null);
  const [confirmingBusy, setConfirmingBusy] = useState(false);
  const [confirmingError, setConfirmingError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((rows) => {
        if (cancelled) return;
        setCategories(rows);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "تعذر تحميل التصنيفات");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function deactivate(c: Category) {
    setConfirmingBusy(true);
    setConfirmingError("");
    try {
      await deactivateCategory(c.id);
      setConfirming(null);
      reload();
    } catch (e) {
      setConfirmingError(
        e instanceof Error ? e.message : "تعذر إيقاف التصنيف",
      );
    } finally {
      setConfirmingBusy(false);
    }
  }

  async function reactivate(c: Category) {
    try {
      await reactivateCategory(c.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إعادة تفعيل التصنيف");
    }
  }

  const mains = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories],
  );
  const subsOf = (id: string) => categories.filter((c) => c.parentId === id);

  return (
    <div>
      <PageHeader
        title="تصنيفات الأصناف"
        description="تصنيفات المخزن التي تُبنى عليها الأصناف وتقارير المبيعات."
        actions={
          <Button onClick={() => setModal({ editing: null, parent: null })}>
            <Plus className="size-4" /> تصنيف رئيسي جديد
          </Button>
        }
      />

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {loading ? (
        <LoadingState />
      ) : mains.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-8" />}
          title="لا توجد تصنيفات بعد"
          description="أضف أول تصنيف رئيسي، ثم أضف التصنيفات الفرعية تحته."
        />
      ) : (
        <Section bodyClassName="p-0">
          <div className="ledger">
            {mains.map((main) => {
              const subs = subsOf(main.id);
              return (
                <div key={main.id}>
                  <div
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${main.isActive ? "" : "opacity-55"}`}
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold">{main.name}</h2>
                      {!main.isActive && <Badge tone="neutral">موقوف</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <IconBtn
                        title="إضافة فرعي"
                        onClick={() => setModal({ editing: null, parent: main })}
                      >
                        <Plus className="size-4" />
                      </IconBtn>
                      <IconBtn
                        title="تعديل"
                        onClick={() => setModal({ editing: main, parent: null })}
                      >
                        <Pencil className="size-4" />
                      </IconBtn>
                      {main.isActive ? (
                        <IconBtn
                          title="إيقاف"
                          danger
                          onClick={() => {
                            setConfirmingError("");
                            setConfirming(main);
                          }}
                        >
                          <Ban className="size-4" />
                        </IconBtn>
                      ) : (
                        <IconBtn
                          title="إعادة التفعيل"
                          onClick={() => reactivate(main)}
                        >
                          <RotateCcw className="size-4" />
                        </IconBtn>
                      )}
                    </div>
                  </div>
                  {subs.length === 0 ? (
                    <p className="px-4 pb-3 ps-10 text-xs text-muted">
                      لا توجد تصنيفات فرعية — أضف واحداً بزر «+».
                    </p>
                  ) : (
                    <ul className="border-t border-line bg-paper/30">
                      {subs.map((sub) => (
                        <li
                          key={sub.id}
                          className={`flex items-center justify-between gap-3 px-4 py-2 ps-10 ${sub.isActive ? "" : "opacity-55"}`}
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <CornerDownLeft className="size-3.5 text-muted" />
                            {sub.name}
                            {!sub.isActive && (
                              <Badge tone="neutral">موقوف</Badge>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <IconBtn
                              title="تعديل"
                              onClick={() =>
                                setModal({ editing: sub, parent: main })
                              }
                            >
                              <Pencil className="size-4" />
                            </IconBtn>
                            {sub.isActive ? (
                              <IconBtn
                                title="إيقاف"
                                danger
                                onClick={() => {
                                  setConfirmingError("");
                                  setConfirming(sub);
                                }}
                              >
                                <Ban className="size-4" />
                              </IconBtn>
                            ) : (
                              <IconBtn
                                title="إعادة التفعيل"
                                onClick={() => reactivate(sub)}
                              >
                                <RotateCcw className="size-4" />
                              </IconBtn>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {modal && (
        <CategoryFormModal
          key={modal.editing?.id ?? `new-${modal.parent?.id ?? "main"}`}
          editing={modal.editing}
          parent={modal.parent}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={confirming !== null}
        title="إيقاف التصنيف"
        description={
          confirming
            ? confirming.parentId
              ? `سيُوقف التصنيف "${confirming.name}".`
              : `سيُوقف التصنيف "${confirming.name}" وجميع فروعه.`
            : undefined
        }
        tone="danger"
        confirmLabel="إيقاف التصنيف"
        busy={confirmingBusy}
        error={confirmingError}
        onConfirm={() => confirming && void deactivate(confirming)}
        onCancel={() => {
          setConfirming(null);
          setConfirmingError("");
        }}
      />
    </div>
  );
}
