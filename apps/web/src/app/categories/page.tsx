"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Pencil, Ban, CornerDownLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryFormModal, type Category } from "./category-modal";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{ editing: Category | null; parent: Category | null } | null>(
    null,
  );

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    api<Category[]>("/api/categories")
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
    const warning = c.parentId
      ? `إيقاف التصنيف "${c.name}"؟`
      : `إيقاف التصنيف "${c.name}" وجميع فروعه؟`;
    if (!confirm(warning)) return;
    try {
      await api(`/api/categories/${c.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إيقاف التصنيف");
    }
  }

  const mains = categories.filter((c) => c.parentId === null);
  const subsOf = (id: number) => categories.filter((c) => c.parentId === id);

  return (
    <div>
      <PageHeader
        title="التصنيفات"
        actions={
          <Button onClick={() => setModal({ editing: null, parent: null })}>
            <Plus className="size-4" /> تصنيف رئيسي جديد
          </Button>
        }
      />

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-muted">جارِ التحميل…</p>
      ) : mains.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد تصنيفات بعد — أضف أول تصنيف بزر «تصنيف رئيسي جديد».
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {mains.map((main) => (
            <section
              key={main.id}
              className={`rounded-xl border border-line bg-surface ${main.isActive ? "" : "opacity-50"}`}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
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
                  <IconBtn title="تعديل" onClick={() => setModal({ editing: main, parent: null })}>
                    <Pencil className="size-4" />
                  </IconBtn>
                  {main.isActive && (
                    <IconBtn title="إيقاف" onClick={() => deactivate(main)} danger>
                      <Ban className="size-4" />
                    </IconBtn>
                  )}
                </div>
              </div>
              <ul className="px-4 py-2">
                {subsOf(main.id).length === 0 && (
                  <li className="py-2 text-sm text-muted">لا توجد تصنيفات فرعية</li>
                )}
                {subsOf(main.id).map((sub) => (
                  <li
                    key={sub.id}
                    className={`flex items-center justify-between py-1.5 ${sub.isActive ? "" : "opacity-50"}`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <CornerDownLeft className="size-3.5 text-muted" />
                      {sub.name}
                      {!sub.isActive && <Badge tone="neutral">موقوف</Badge>}
                    </span>
                    <span className="flex items-center gap-1">
                      <IconBtn
                        title="تعديل"
                        onClick={() => setModal({ editing: sub, parent: main })}
                      >
                        <Pencil className="size-4" />
                      </IconBtn>
                      {sub.isActive && (
                        <IconBtn title="إيقاف" onClick={() => deactivate(sub)} danger>
                          <Ban className="size-4" />
                        </IconBtn>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {modal && (
        <CategoryFormModal
          key={modal.editing?.id ?? `new-${modal.parent?.id ?? "main"}`}
          editing={modal.editing}
          parent={modal.parent}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick?: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
