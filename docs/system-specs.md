# Clothing Store System — Specification

The system is an Arabic RTL clothing retail application with a main warehouse, a shop, supplier purchases, FIFO inventory, transfers, cashier shifts, and POS sales.

## Merchandise

- Categories may have two levels.
- The exact category assigned to a product owns free-text color and size options.
- Every product requires color and size variants.
- The admin chooses color and size subsets, reviews the generated Cartesian-product grid, and enables only combinations that exist.
- Every enabled variant has an independent generated code, optional unique barcode, selling price, active status, FIFO stock, and transaction history.
- Linked category options are deactivated rather than deleted.

## Purchases and inventory

- Purchase invoices contain exact product variants.
- Every invoice line has its own quantity and unit cost.
- Confirmation creates a FIFO batch in the main warehouse.
- Transfers carry exact variants and FIFO costs from the main warehouse to the shop.

## POS

- Cashiers can scan a variant barcode/code or browse by product, color, and size.
- Sales deduct the exact variant from shop FIFO stock.
- Order lines snapshot product, color, size, code, barcode, price, and cost.
- Existing shift, discount, cash, receipt, and idempotency behavior remains.

## Architecture

- Next.js/React/TypeScript frontend
- Express REST API
- MySQL with Drizzle ORM
- JWT authentication with admin and cashier roles

The implementation design and detailed integrity rules are in
[`docs/superpowers/specs/2026-07-28-clothing-variants-design.md`](superpowers/specs/2026-07-28-clothing-variants-design.md).
