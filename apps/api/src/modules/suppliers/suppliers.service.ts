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
      if (changesOpeningBalance && (await repo.hasPayments(id))) {
        throw new HttpError(
          409,
          'لا يمكن تعديل الرصيد الافتتاحي بعد تسجيل دفعة',
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
    const payments = await this.repo.listPayments(supplierId);
    return { supplier, payments };
  }
}
