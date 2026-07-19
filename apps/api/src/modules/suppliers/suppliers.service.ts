import { HttpError } from '../../middleware/error.js';
import type { SuppliersRepository } from './suppliers.repository.js';
import type {
  PaymentInput,
  SupplierInput,
  SupplierUpdateInput,
} from './suppliers.schemas.js';

export class SuppliersService {
  constructor(private repo: SuppliersRepository) {}

  list() {
    return this.repo.list();
  }

  async getOrFail(id: number) {
    const supplier = await this.repo.findById(id);
    if (!supplier) throw new HttpError(404, 'المورد غير موجود');
    return supplier;
  }

  create(data: SupplierInput) {
    return this.repo.create(data);
  }

  async update(id: number, data: SupplierUpdateInput) {
    return this.repo.transaction(async (repo) => {
      const supplier = await repo.findByIdForUpdate(id);
      if (!supplier) throw new HttpError(404, 'المورد غير موجود');
      const changesOpeningBalance =
        data.openingBalance !== undefined &&
        data.openingBalance.toFixed(2) !== supplier.openingBalance;
      if (
        changesOpeningBalance &&
        ((await repo.hasPayments(id)) || (await repo.hasPurchases(id)))
      ) {
        throw new HttpError(
          409,
          'لا يمكن تعديل الرصيد الافتتاحي بعد تسجيل حركة مالية',
        );
      }
      await repo.update(id, data);
    });
  }

  async deactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const supplier = await repo.findByIdForUpdate(id);
      if (!supplier) throw new HttpError(404, 'المورد غير موجود');
      if (!supplier.isActive) return;
      if (Number(supplier.balance) !== 0) {
        throw new HttpError(409, 'لا يمكن إيقاف مورد لديه رصيد مستحق');
      }
      await repo.deactivate(id);
    });
  }

  async addPayment(supplierId: number, data: PaymentInput) {
    return this.repo.transaction(async (repo) => {
      const supplier = await repo.findByIdForUpdate(supplierId);
      if (!supplier) throw new HttpError(404, 'المورد غير موجود');
      if (!supplier.isActive) throw new HttpError(409, 'المورد موقوف');
      return repo.createPayment(supplierId, data);
    });
  }

  async statement(supplierId: number) {
    const supplier = await this.getOrFail(supplierId);
    const [payments, purchases] = await Promise.all([
      this.repo.listPayments(supplierId),
      this.repo.listPurchases(supplierId),
    ]);
    const datedMovements = [
      ...purchases.map((purchase) => ({
        id: `purchase-${purchase.id}`,
        type: 'purchase' as const,
        referenceId: purchase.id,
        date: purchase.purchasedAt,
        description: purchase.invoiceNumber
          ? `فاتورة شراء رقم ${purchase.invoiceNumber}`
          : `فاتورة شراء #${purchase.id}`,
        amount: purchase.totalAmount,
        order: 0,
        numericId: purchase.id,
      })),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: 'payment' as const,
        referenceId: payment.id,
        date: payment.paidAt,
        description: payment.notes || 'دفعة للمورد',
        amount: `-${payment.amount}`,
        order: 1,
        numericId: payment.id,
      })),
    ].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.order - b.order ||
        a.numericId - b.numericId,
    );
    let running = BigInt(supplier.openingBalance.replace('.', ''));
    const movements = datedMovements.map(
      ({ order: _order, numericId: _id, ...movement }) => {
        running += BigInt(movement.amount.replace('.', ''));
        return { ...movement, balanceAfter: formatCents(running) };
      },
    );
    return { supplier, payments, movements };
  }
}

function formatCents(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n)
    .toString()
    .padStart(2, '0')}`;
}
