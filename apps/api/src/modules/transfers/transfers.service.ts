import { HttpError } from '../../middleware/error.js';
import type { TransfersRepository } from './transfers.repository.js';
import type {
  TransferApprovalInput,
  TransferRequestInput,
} from './transfers.schemas.js';

const quantityText = (quantity: number) => quantity.toFixed(3);

export class TransfersService {
  constructor(private repo: TransfersRepository) {}

  createRequest(data: TransferRequestInput, requestedBy: number) {
    return this.repo.transaction(async (repo) => {
      await this.validateItems(repo, data.lines);
      const requestId = await repo.createRequest({
        requestedBy,
        notes: data.notes ?? null,
      });
      for (const line of data.lines) {
        await repo.createRequestLine({
          requestId,
          itemId: line.itemId,
          quantity: quantityText(line.quantity),
        });
      }
      return requestId;
    });
  }

  listRequests() {
    return this.repo.listRequests();
  }

  async getRequest(id: number) {
    const row = await this.repo.findRequestById(id);
    if (!row) throw new HttpError(404, 'طلب التحويل غير موجود');
    return { ...row, lines: await this.repo.listRequestLines(id) };
  }

  approveRequest(id: number, data: TransferApprovalInput, approvedBy: number) {
    return this.repo.transaction(async (repo, inventory) => {
      const request = await repo.lockRequest(id);
      if (!request) throw new HttpError(404, 'طلب التحويل غير موجود');
      if (request.status !== 'pending')
        throw new HttpError(409, 'تمت مراجعة طلب التحويل من قبل');

      const requestedLines = await repo.listRequestLines(id);
      const requestedItemIds = new Set(
        requestedLines.map((line) => line.itemId),
      );
      if (
        data.lines.length !== requestedItemIds.size ||
        data.lines.some((line) => !requestedItemIds.has(line.itemId))
      ) {
        throw new HttpError(
          400,
          'يجب اعتماد جميع أصناف الطلب دون إضافة أو حذف أصناف',
        );
      }
      await this.validateItems(repo, data.lines);
      const transferId = await this.moveStock(
        repo,
        inventory,
        {
          requestId: id,
          createdBy: request.requestedBy,
          approvedBy,
          notes: request.notes,
        },
        data.lines,
      );
      await repo.approveRequest(id, approvedBy);
      return transferId;
    });
  }

  rejectRequest(id: number, reason: string, reviewedBy: number) {
    return this.repo.transaction(async (repo) => {
      const request = await repo.lockRequest(id);
      if (!request) throw new HttpError(404, 'طلب التحويل غير موجود');
      if (request.status !== 'pending')
        throw new HttpError(409, 'تمت مراجعة طلب التحويل من قبل');
      await repo.rejectRequest(id, reviewedBy, reason);
    });
  }

  createDirect(data: TransferRequestInput, adminId: number) {
    return this.repo.transaction(async (repo, inventory) => {
      await this.validateItems(repo, data.lines);
      return this.moveStock(
        repo,
        inventory,
        {
          requestId: null,
          createdBy: adminId,
          approvedBy: adminId,
          notes: data.notes ?? null,
        },
        data.lines,
      );
    });
  }

  listTransfers() {
    return this.repo.listTransfers();
  }

  async getTransfer(id: number) {
    const row = await this.repo.findTransferById(id);
    if (!row) throw new HttpError(404, 'التحويل غير موجود');
    return { ...row, lines: await this.repo.listTransferLines(id) };
  }

  private async validateItems(
    repo: TransfersRepository,
    lines: Array<{ itemId: number }>,
  ) {
    const rows = await repo.lockItems(lines.map((line) => line.itemId));
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    for (const line of lines) {
      const item = rowsById.get(line.itemId);
      if (!item) throw new HttpError(404, 'أحد الأصناف غير موجود');
      if (!item.isActive)
        throw new HttpError(409, `الصنف "${item.name}" موقوف`);
    }
  }

  private async moveStock(
    repo: TransfersRepository,
    inventory: Parameters<
      Parameters<TransfersRepository['transaction']>[0]
    >[1],
    header: {
      requestId: number | null;
      createdBy: number;
      approvedBy: number;
      notes: string | null;
    },
    lines: Array<{ itemId: number; quantity: number }>,
  ) {
    const transferId = await repo.createTransfer(header);
    const occurredAt = new Date();
    const orderedLines = [...lines].sort((a, b) => a.itemId - b.itemId);
    for (const line of orderedLines) {
      const consumed = await inventory.consume({
        itemId: line.itemId,
        warehouse: 'main',
        quantity: line.quantity,
        movementType: 'transfer_out',
        referenceType: 'transfer',
        referenceId: transferId,
        occurredAt,
      });
      for (const allocation of consumed.allocations) {
        if (allocation.batchId === null) {
          throw new HttpError(409, 'الرصيد المتاح لا يكفي');
        }
        const received = await inventory.receive({
          itemId: line.itemId,
          warehouse: 'cafe',
          quantity: Number(allocation.quantity),
          unitCost: allocation.unitCost,
          movementType: 'transfer_in',
          referenceType: 'transfer',
          referenceId: transferId,
          occurredAt,
        });
        await repo.createTransferLine({
          transferId,
          itemId: line.itemId,
          quantity: allocation.quantity,
          unitCost: allocation.unitCost,
          sourceBatchId: allocation.batchId,
          cafeBatchId: received.batchId,
        });
      }
    }
    return transferId;
  }
}
