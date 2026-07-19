import { HttpError } from '../../middleware/error.js';
import type { SuppliersRepository } from './suppliers.repository.js';
import type { PaymentInput, SupplierInput, SupplierUpdateInput } from './suppliers.schemas.js';

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
    const ok = await this.repo.update(id, data);
    if (!ok) throw new HttpError(404, 'المورد غير موجود');
  }

  async deactivate(id: number) {
    const ok = await this.repo.deactivate(id);
    if (!ok) throw new HttpError(404, 'المورد غير موجود');
  }

  async addPayment(supplierId: number, data: PaymentInput) {
    await this.getOrFail(supplierId);
    return this.repo.createPayment(supplierId, data);
  }

  async statement(supplierId: number) {
    const supplier = await this.getOrFail(supplierId);
    const payments = await this.repo.listPayments(supplierId);
    return { supplier, payments };
  }
}
