import { HttpError } from '@cashier/server-core';
import type { PurchaseInvoiceJourney } from '@cashier/shared';
import { traceInvoice } from './invoice-journey.js';
import type { InvoiceJourneyRepository } from './invoice-journey.repository.js';
import type { PurchasesRepository } from './purchases.repository.js';

/** Where a purchase invoice's stock went, and what it earned. */
export class InvoiceJourneyService {
  constructor(
    private purchases: Pick<PurchasesRepository, 'findById'>,
    private journey: InvoiceJourneyRepository,
  ) {}

  async get(invoiceId: string): Promise<PurchaseInvoiceJourney> {
    if (!(await this.purchases.findById(invoiceId))) {
      throw new HttpError(404, 'فاتورة الشراء غير موجودة');
    }
    const roots = await this.journey.invoiceBatches(invoiceId);
    const result = await traceInvoice(roots, this.journey);
    const itemIds = [...result.lines.keys()];
    const [details, unmatched] =
      itemIds.length === 0
        ? [[], new Map<string, string>()]
        : await Promise.all([
            this.journey.itemDetails(itemIds),
            this.journey.unmatchedSales(itemIds),
          ]);
    const detailById = new Map(details.map((item) => [item.id, item]));
    return {
      invoiceId,
      totals: result.totals,
      lines: [...result.lines.values()].map((line) => {
        const item = detailById.get(line.itemId);
        if (!item) throw new Error(`item ${line.itemId} not found`);
        return {
          ...line,
          itemCode: item.code,
          stockUnit: item.stockUnit,
          unmatchedSaleQuantity: unmatched.get(line.itemId) ?? '0.000',
        };
      }),
      products: result.products,
    };
  }
}
