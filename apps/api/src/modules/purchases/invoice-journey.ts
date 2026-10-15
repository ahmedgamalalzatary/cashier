/**
 * Follows a purchase invoice's stock batches forward through every place the
 * stock went: transfers, preparations, sales (and their refunds), waste,
 * stocktake shortages, and what is still in stock.
 *
 * Work is done on "packets": a packet says how much of the invoice each unit
 * of one batch carries (`quantity` in the invoice item's unit, `cost`, and
 * `share` of the batch's own cost). Every effect is linear in a packet, so a
 * batch reached by several paths simply gets several packets whose results
 * add up. All math is exact; rounding happens once, when formatting.
 */

export type JourneyBatch = {
  id: string;
  itemId: string;
  itemName: string;
  warehouse: "main" | "cafe";
  initialQuantity: string;
  remainingQuantity: string;
  unitCost: string;
};

export type JourneyOutflows = {
  transfers: Array<{
    sourceBatchId: string | null;
    cafeBatchId: string;
    quantity: string;
  }>;
  preparations: Array<{
    sourceBatchId: string | null;
    preparationId: string;
    quantity: string;
  }>;
  /** Includes sales made before stock arrived and later settled by the batch. */
  sales: Array<{ batchId: string; allocationId: string; quantity: string }>;
  /** Includes stocktake shortages made before stock arrived and later settled. */
  losses: Array<{ batchId: string; kind: "waste" | "shortage"; quantity: string }>;
};

export type JourneyPreparation = {
  id: string;
  outputBatchId: string;
  producedQuantity: string;
  inputs: Array<{ quantity: string; unitCost: string }>;
};

export type JourneySaleAllocation = {
  allocationId: string;
  quantity: string;
  line: {
    id: string;
    productName: string;
    sizeName: string | null;
    lineSubtotal: string;
    orderSubtotal: string;
    orderTotal: string;
    /** Sum of every allocation quantity on the line. */
    quantity: string;
    /** Known cost of the line: batch allocations and settled deficit parts. */
    costParts: Array<{ quantity: string; unitCost: string }>;
  };
};

export type JourneyRefund = {
  allocationId: string;
  quantity: string;
  stockAction: "return_to_stock" | "not_returnable";
  returnedBatchId: string | null;
};

export interface JourneySource {
  batches(ids: string[]): Promise<JourneyBatch[]>;
  outflows(batchIds: string[]): Promise<JourneyOutflows>;
  preparations(ids: string[]): Promise<JourneyPreparation[]>;
  saleAllocations(ids: string[]): Promise<JourneySaleAllocation[]>;
  refunds(allocationIds: string[]): Promise<JourneyRefund[]>;
}

export type JourneyMoney = {
  boughtCost: string;
  soldCost: string;
  salesAmount: string;
  refundedAmount: string;
  profit: string;
  wastedCost: string;
  shortageCost: string;
  mainStockCost: string;
  cafeStockCost: string;
  preparedStockCost: string;
};

export type JourneyLineFigures = JourneyMoney & {
  itemId: string;
  itemName: string;
  boughtQuantity: string;
  soldQuantity: string;
  wastedQuantity: string;
  shortageQuantity: string;
  mainStockQuantity: string;
  cafeStockQuantity: string;
  preparedStockQuantity: string;
};

export type JourneyProductFigures = {
  itemId: string;
  productName: string;
  sizeName: string | null;
  /** The prepared item the ingredient was sold inside, if any. */
  viaItemName: string | null;
  quantity: string;
  cost: string;
  salesAmount: string;
  refundedAmount: string;
  profit: string;
};

const MAX_PACKETS = 200_000;

class Fraction {
  private constructor(
    readonly n: bigint,
    readonly d: bigint,
  ) {}

  static readonly zero = new Fraction(0n, 1n);
  static readonly one = new Fraction(1n, 1n);

  static of(n: bigint, d = 1n): Fraction {
    if (d === 0n) throw new Error("division by zero");
    if (d < 0n) return Fraction.of(-n, -d);
    const g = gcd(n < 0n ? -n : n, d);
    return new Fraction(n / g, d / g);
  }

  /** Exact value of a DECIMAL string such as "12.345" or "-0.5". */
  static decimal(value: string): Fraction {
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
    const scale = 10n ** BigInt(fraction.length);
    const n = BigInt(whole || "0") * scale + BigInt(fraction || "0");
    return Fraction.of(negative ? -n : n, scale);
  }

  add(other: Fraction) {
    return Fraction.of(this.n * other.d + other.n * this.d, this.d * other.d);
  }

  sub(other: Fraction) {
    return this.add(Fraction.of(-other.n, other.d));
  }

  mul(other: Fraction) {
    return Fraction.of(this.n * other.n, this.d * other.d);
  }

  div(other: Fraction) {
    return Fraction.of(this.n * other.d, this.d * other.n);
  }

  isZero() {
    return this.n === 0n;
  }

  /** Rounded half away from zero to `scale` decimals. */
  format(scale: number) {
    const factor = 10n ** BigInt(scale);
    const negative = this.n < 0n;
    const absolute = negative ? -this.n : this.n;
    const scaled = (absolute * factor * 2n + this.d) / (this.d * 2n);
    if (scaled === 0n) return (0).toFixed(scale);
    const whole = scaled / factor;
    const fraction = (scaled % factor).toString().padStart(scale, "0");
    return `${negative ? "-" : ""}${whole}${scale > 0 ? `.${fraction}` : ""}`;
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

type Packet = {
  batchId: string;
  itemId: string;
  /** Invoice-item quantity per unit of the batch. */
  quantity: Fraction;
  /** Invoice cost per unit of the batch. */
  cost: Fraction;
  /** Share of each batch unit's own cost that belongs to the invoice. */
  share: Fraction;
};

type Bucket = { quantity: Fraction; cost: Fraction };

const bucket = (): Bucket => ({ quantity: Fraction.zero, cost: Fraction.zero });

type LineState = {
  itemId: string;
  itemName: string;
  bought: Bucket;
  sold: Bucket;
  sales: Fraction;
  refunded: Fraction;
  wasted: Bucket;
  shortage: Bucket;
  mainStock: Bucket;
  cafeStock: Bucket;
  preparedStock: Bucket;
};

type ProductState = Omit<JourneyProductFigures, "quantity" | "cost" | "salesAmount" | "refundedAmount" | "profit"> & {
  sold: Bucket;
  sales: Fraction;
  refunded: Fraction;
};

function addTo(target: Bucket, quantity: Fraction, cost: Fraction) {
  target.quantity = target.quantity.add(quantity);
  target.cost = target.cost.add(cost);
}

export async function traceInvoice(roots: JourneyBatch[], source: JourneySource) {
  const lines = new Map<string, LineState>();
  const products = new Map<string, ProductState>();
  const batches = new Map<string, JourneyBatch>();
  const outflows = new Map<string, JourneyOutflows>();
  const preparations = new Map<string, JourneyPreparation>();
  const sales = new Map<string, JourneySaleAllocation>();
  const refunds = new Map<string, JourneyRefund[]>();

  let queue: Packet[] = [];
  for (const root of roots) {
    batches.set(root.id, root);
    let line = lines.get(root.itemId);
    if (!line) {
      line = {
        itemId: root.itemId,
        itemName: root.itemName,
        bought: bucket(),
        sold: bucket(),
        sales: Fraction.zero,
        refunded: Fraction.zero,
        wasted: bucket(),
        shortage: bucket(),
        mainStock: bucket(),
        cafeStock: bucket(),
        preparedStock: bucket(),
      };
      lines.set(root.itemId, line);
    }
    const unitCost = Fraction.decimal(root.unitCost);
    const initial = Fraction.decimal(root.initialQuantity);
    addTo(line.bought, initial, initial.mul(unitCost));
    queue.push({
      batchId: root.id,
      itemId: root.itemId,
      quantity: Fraction.one,
      cost: unitCost,
      share: Fraction.one,
    });
  }

  let processed = 0;
  while (queue.length > 0) {
    await load(queue);
    const next: Packet[] = [];
    for (const packet of queue) {
      if (++processed > MAX_PACKETS) {
        throw new Error("invoice journey is too large to trace");
      }
      next.push(...walk(packet));
    }
    queue = next;
  }

  /** Fetches, in bulk, everything the packets' batches need. */
  async function load(packets: Packet[]) {
    const unknownBatches = unique(packets.map((p) => p.batchId)).filter(
      (id) => !batches.has(id),
    );
    for (const row of await nonEmpty(unknownBatches, (ids) => source.batches(ids))) {
      batches.set(row.id, row);
    }
    const unknownOutflows = unique(packets.map((p) => p.batchId)).filter(
      (id) => !outflows.has(id),
    );
    if (unknownOutflows.length === 0) return;
    const rows = await source.outflows(unknownOutflows);
    for (const id of unknownOutflows) {
      outflows.set(id, {
        transfers: rows.transfers.filter((row) => row.sourceBatchId === id),
        preparations: rows.preparations.filter((row) => row.sourceBatchId === id),
        sales: rows.sales.filter((row) => row.batchId === id),
        losses: rows.losses.filter((row) => row.batchId === id),
      });
    }
    const preparationIds = unique(rows.preparations.map((row) => row.preparationId)).filter(
      (id) => !preparations.has(id),
    );
    for (const row of await nonEmpty(preparationIds, (ids) => source.preparations(ids))) {
      preparations.set(row.id, row);
    }
    const allocationIds = unique(rows.sales.map((row) => row.allocationId)).filter(
      (id) => !sales.has(id),
    );
    for (const row of await nonEmpty(allocationIds, (ids) => source.saleAllocations(ids))) {
      sales.set(row.allocationId, row);
    }
    const refundRows = await nonEmpty(allocationIds, (ids) => source.refunds(ids));
    for (const id of allocationIds) {
      refunds.set(id, refundRows.filter((row) => row.allocationId === id));
    }
    const childBatchIds = [
      ...rows.transfers.map((row) => row.cafeBatchId),
      ...[...preparations.values()].map((row) => row.outputBatchId),
      ...refundRows.flatMap((row) => (row.returnedBatchId ? [row.returnedBatchId] : [])),
    ];
    const unknownChildren = unique(childBatchIds).filter((id) => !batches.has(id));
    for (const row of await nonEmpty(unknownChildren, (ids) => source.batches(ids))) {
      batches.set(row.id, row);
    }
  }

  function walk(packet: Packet): Packet[] {
    const batch = batches.get(packet.batchId);
    const flows = outflows.get(packet.batchId);
    const line = lines.get(packet.itemId)!;
    if (!batch || !flows) throw new Error(`stock batch ${packet.batchId} not found`);
    const children: Packet[] = [];
    const amount = (quantity: string) => {
      const units = Fraction.decimal(quantity);
      return { units, quantity: units.mul(packet.quantity), cost: units.mul(packet.cost) };
    };

    const remaining = amount(batch.remainingQuantity);
    addTo(
      batch.warehouse === "main"
        ? line.mainStock
        : batch.itemId === packet.itemId
          ? line.cafeStock
          : line.preparedStock,
      remaining.quantity,
      remaining.cost,
    );

    for (const transfer of flows.transfers) {
      // A transfer fills its cafe batch with exactly `quantity` units, so that
      // fraction of the packet rides along. It is the whole packet for a normal
      // transfer, but only the settled share when this batch settled a transfer
      // shortage that the cafe had already been given.
      const cafeBatch = batches.get(transfer.cafeBatchId);
      if (!cafeBatch) throw new Error(`stock batch ${transfer.cafeBatchId} not found`);
      const portion = Fraction.decimal(transfer.quantity).div(
        Fraction.decimal(cafeBatch.initialQuantity),
      );
      children.push({
        batchId: transfer.cafeBatchId,
        itemId: packet.itemId,
        quantity: packet.quantity.mul(portion),
        cost: packet.cost.mul(portion),
        share: packet.share.mul(portion),
      });
    }

    for (const used of flows.preparations) {
      const preparation = preparations.get(used.preparationId);
      if (!preparation) throw new Error(`preparation ${used.preparationId} not found`);
      const produced = Fraction.decimal(preparation.producedQuantity);
      const units = Fraction.decimal(used.quantity);
      const inputCost = preparation.inputs.reduce(
        (sum, input) =>
          sum.add(Fraction.decimal(input.quantity).mul(Fraction.decimal(input.unitCost))),
        Fraction.zero,
      );
      const inputQuantity = preparation.inputs.reduce(
        (sum, input) => sum.add(Fraction.decimal(input.quantity)),
        Fraction.zero,
      );
      children.push({
        batchId: preparation.outputBatchId,
        itemId: packet.itemId,
        quantity: units.mul(packet.quantity).div(produced),
        cost: units.mul(packet.cost).div(produced),
        share: inputCost.isZero()
          ? units.mul(packet.share).div(inputQuantity)
          : units.mul(packet.cost).div(inputCost),
      });
    }

    for (const loss of flows.losses) {
      const lost = amount(loss.quantity);
      addTo(loss.kind === "waste" ? line.wasted : line.shortage, lost.quantity, lost.cost);
    }

    for (const sale of flows.sales) {
      const allocation = sales.get(sale.allocationId);
      if (!allocation) throw new Error(`sale allocation ${sale.allocationId} not found`);
      const sold = amount(sale.quantity);
      // The invoice's part of the line's price is its share of the line's
      // *recorded* cost, so both sides of the ratio use the same basis: the
      // batch's own cost (the estimate a settled shortage kept), never the
      // later receipt's actual cost.
      const recordedCost = sold.units
        .mul(Fraction.decimal(batch.unitCost))
        .mul(packet.share);
      const revenue = saleShare(
        allocation,
        recordedCost,
        sold.units.mul(packet.share),
      );
      const product = productFor(packet, batch, allocation);
      addTo(line.sold, sold.quantity, sold.cost);
      addTo(product.sold, sold.quantity, sold.cost);
      line.sales = line.sales.add(revenue);
      product.sales = product.sales.add(revenue);

      const allocated = Fraction.decimal(allocation.quantity);
      for (const refund of refunds.get(sale.allocationId) ?? []) {
        const portion = Fraction.decimal(refund.quantity).div(allocated);
        const back = { quantity: sold.quantity.mul(portion), cost: sold.cost.mul(portion) };
        const minus = (target: Bucket) =>
          addTo(target, Fraction.zero.sub(back.quantity), Fraction.zero.sub(back.cost));
        minus(line.sold);
        minus(product.sold);
        line.refunded = line.refunded.add(revenue.mul(portion));
        product.refunded = product.refunded.add(revenue.mul(portion));
        if (refund.stockAction === "return_to_stock" && refund.returnedBatchId) {
          children.push({
            batchId: refund.returnedBatchId,
            itemId: packet.itemId,
            quantity: sold.quantity.div(allocated),
            cost: sold.cost.div(allocated),
            share: sold.units.mul(packet.share).div(allocated),
          });
        } else {
          addTo(line.wasted, back.quantity, back.cost);
        }
      }
    }
    return children;
  }

  function productFor(packet: Packet, batch: JourneyBatch, allocation: JourneySaleAllocation) {
    const viaItemName = batch.itemId === packet.itemId ? null : batch.itemName;
    const key = JSON.stringify([
      packet.itemId,
      allocation.line.productName,
      allocation.line.sizeName,
      viaItemName,
    ]);
    let product = products.get(key);
    if (!product) {
      product = {
        itemId: packet.itemId,
        productName: allocation.line.productName,
        sizeName: allocation.line.sizeName,
        viaItemName,
        sold: bucket(),
        sales: Fraction.zero,
        refunded: Fraction.zero,
      };
      products.set(key, product);
    }
    return product;
  }

  const lineFigures = new Map<string, JourneyLineFigures>();
  for (const line of lines.values()) {
    lineFigures.set(line.itemId, {
      itemId: line.itemId,
      itemName: line.itemName,
      boughtQuantity: line.bought.quantity.format(3),
      soldQuantity: line.sold.quantity.format(3),
      wastedQuantity: line.wasted.quantity.format(3),
      shortageQuantity: line.shortage.quantity.format(3),
      mainStockQuantity: line.mainStock.quantity.format(3),
      cafeStockQuantity: line.cafeStock.quantity.format(3),
      preparedStockQuantity: line.preparedStock.quantity.format(3),
      ...money([line]),
    });
  }
  return {
    lines: lineFigures,
    totals: money([...lines.values()]),
    products: [...products.values()].map((product) => ({
      itemId: product.itemId,
      productName: product.productName,
      sizeName: product.sizeName,
      viaItemName: product.viaItemName,
      quantity: product.sold.quantity.format(3),
      cost: product.sold.cost.format(2),
      salesAmount: product.sales.format(2),
      refundedAmount: product.refunded.format(2),
      profit: product.sales.sub(product.refunded).sub(product.sold.cost).format(2),
    })),
  };
}

/**
 * The invoice's part of a sale line's price: its share of the line's *recorded*
 * cost (the batch's own cost, so an estimate a settled shortage kept stays on
 * the same basis), or its quantity share when the line has no cost at all.
 */
function saleShare(
  allocation: JourneySaleAllocation,
  invoiceCost: Fraction,
  invoiceUnits: Fraction,
) {
  const { line } = allocation;
  const orderSubtotal = Fraction.decimal(line.orderSubtotal);
  if (orderSubtotal.isZero()) return Fraction.zero;
  const revenue = Fraction.decimal(line.lineSubtotal)
    .mul(Fraction.decimal(line.orderTotal))
    .div(orderSubtotal);
  const lineCost = line.costParts.reduce(
    (sum, part) => sum.add(Fraction.decimal(part.quantity).mul(Fraction.decimal(part.unitCost))),
    Fraction.zero,
  );
  if (!lineCost.isZero()) return revenue.mul(invoiceCost).div(lineCost);
  const lineQuantity = Fraction.decimal(line.quantity);
  return lineQuantity.isZero() ? Fraction.zero : revenue.mul(invoiceUnits).div(lineQuantity);
}

function money(lines: LineState[]): JourneyMoney {
  const sum = (pick: (line: LineState) => Fraction) =>
    lines.reduce((total, line) => total.add(pick(line)), Fraction.zero);
  const sales = sum((line) => line.sales);
  const refunded = sum((line) => line.refunded);
  const soldCost = sum((line) => line.sold.cost);
  return {
    boughtCost: sum((line) => line.bought.cost).format(2),
    soldCost: soldCost.format(2),
    salesAmount: sales.format(2),
    refundedAmount: refunded.format(2),
    profit: sales.sub(refunded).sub(soldCost).format(2),
    wastedCost: sum((line) => line.wasted.cost).format(2),
    shortageCost: sum((line) => line.shortage.cost).format(2),
    mainStockCost: sum((line) => line.mainStock.cost).format(2),
    cafeStockCost: sum((line) => line.cafeStock.cost).format(2),
    preparedStockCost: sum((line) => line.preparedStock.cost).format(2),
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

async function nonEmpty<T>(ids: string[], fetch: (ids: string[]) => Promise<T[]>) {
  return ids.length === 0 ? [] : fetch(ids);
}
