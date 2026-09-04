import Image from "next/image";
import { Boxes, CircleCheck, CircleX, Settings2 } from "lucide-react";
import type { ExternalProduct } from "@cashier/shared";
import { formatMoney } from "../../lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export function ExternalProductCard({
  product,
  categoryName,
  onStockSetup,
}: {
  product: ExternalProduct;
  categoryName: string;
  onStockSetup: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex gap-4 border-b border-line bg-paper/45 p-4">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.nameAr}
            width={72}
            height={72}
            unoptimized
            className="size-18 rounded-xl object-cover"
          />
        ) : (
          <span className="flex size-18 shrink-0 items-center justify-center rounded-xl bg-line/50 text-muted">
            <Boxes className="size-7" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-bold">{product.nameAr}</h2>
              <p className="text-sm text-muted" dir="ltr">
                {product.nameEn}
              </p>
            </div>
            <Badge tone={product.sellable ? "success" : "danger"}>
              {product.sellable
                ? "جاهز للبيع"
                : product.modifierNamesMissing
                  ? "موقوف عن البيع"
                  : "غير مكتمل"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{categoryName}</p>
          {product.modifierNamesMissing && (
            <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">
              أسماء الإضافات مفقودة في الكتالوج الخارجي، لذلك لا يمكن بيع هذا
              المنتج حتى تُدخل الأسماء في لوحة التحكم الخارجية.
            </p>
          )}
          {(product.descriptionAr || product.descriptionEn) && (
            <p className="mt-2 line-clamp-2 text-xs text-muted">
              {[product.descriptionAr, product.descriptionEn]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <span>السعر: {formatMoney(product.price)}</span>
          <span>السعرات: {product.calories}</span>
          <span>النقاط: {product.pointsReward}</span>
          {product.discountPercentage && (
            <span>خصم: {product.discountPercentage}%</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span>{product.isAvailable ? "متاح" : "غير متاح"}</span>
          <span>{product.isVisible ? "ظاهر" : "مخفي"}</span>
          {product.discountPercentage &&
            product.discountStart &&
            product.discountEnd && (
              <span>
                فترة الخصم: {formatCatalogDate(product.discountStart)} — {formatCatalogDate(product.discountEnd)}
              </span>
            )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <CatalogCount
            label="المقاسات"
            value={product.sizes.length || 1}
            complete={
              product.sizes.length > 0
                ? product.sizes.every((size) => size.ingredients.length > 0)
                : product.ingredients.length > 0
            }
          />
          <CatalogCount
            label="خيارات الإضافات"
            value={product.modifierGroups.reduce(
              (sum, group) => sum + group.options.length,
              0,
            )}
            complete={product.modifierGroups.every((group) =>
              group.options.every(
                (option) => option.stockEffect !== "incomplete",
              ),
            )}
          />
        </div>
        {product.sizes.length > 0 && (
          <section className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-xs font-semibold">المقاسات والأسعار</h3>
            <ul className="space-y-1 text-xs text-muted">
              {product.sizes.map((size) => (
                <li key={size.externalId} className="flex justify-between gap-3">
                  <span>
                    {size.nameAr} / <span dir="ltr">{size.nameEn}</span>
                    {size.isDefault ? " · افتراضي" : ""}
                  </span>
                  <span className="tnum shrink-0">{formatMoney(size.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {product.modifierGroups.map((group) => (
          <section key={group.externalId} className="rounded-xl border border-line p-3">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs">
              <h3 className="font-semibold">
                {group.nameAr === null || group.nameEn === null ? (
                  <span className="text-danger">مجموعة إضافات بدون اسم</span>
                ) : (
                  <>
                    {group.nameAr} / <span dir="ltr">{group.nameEn}</span>
                  </>
                )}
              </h3>
              <span className="text-muted">
                {group.isRequired ? "مطلوبة" : "اختيارية"} · الحد الأقصى {group.maxSelections}
              </span>
            </div>
            <ul className="space-y-1 text-xs text-muted">
              {group.options.map((option) => (
                <li key={option.externalId} className="flex justify-between gap-3">
                  <span>
                    {option.nameAr === null || option.nameEn === null ? (
                      <span className="text-danger">إضافة بدون اسم</span>
                    ) : (
                      <>
                        {option.nameAr} / <span dir="ltr">{option.nameEn}</span>
                      </>
                    )}
                  </span>
                  <span className="tnum shrink-0">+{formatMoney(option.extraPrice)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Button className="w-full justify-center" onClick={onStockSetup}>
          <Settings2 className="size-4" /> إعداد المخزون
        </Button>
      </div>
    </article>
  );
}

function formatCatalogDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("ar-EG");
}

function CatalogCount({
  label,
  value,
  complete,
}: {
  label: string;
  value: number;
  complete: boolean;
}) {
  const Icon = complete ? CircleCheck : CircleX;
  return (
    <span className="flex items-center justify-between rounded-lg bg-paper px-3 py-2">
      <span>{label}</span>
      <span className={complete ? "text-success" : "text-danger"}>
        <Icon className="me-1 inline size-4" /> {value}
      </span>
    </span>
  );
}
