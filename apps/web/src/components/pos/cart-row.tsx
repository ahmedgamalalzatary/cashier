import { Minus, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@cashier/web-core/lib/format";
import { cartLineTotal, type PosCartLine } from "@/models/pos-model";

export function CartRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: PosCartLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium">{line.productName}</p>
          <p className="text-xs text-muted">
            {[
              line.sizeName,
              ...line.modifiers.map(
                (modifier) => `${modifier.name} × ${modifier.quantity}`,
              ),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex items-start gap-1">
          <span className="tnum font-bold">
            {formatMoney(cartLineTotal(line))}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`حذف ${line.productName}`}
            title="حذف الصنف"
            className="rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onQuantity(line.quantity - 1)}
          className="rounded-md border border-line p-1.5"
        >
          <Minus className="size-4" />
        </button>
        <span className="tnum">{line.quantity}</span>
        <button
          type="button"
          onClick={() => onQuantity(line.quantity + 1)}
          className="rounded-md border border-line p-1.5"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
