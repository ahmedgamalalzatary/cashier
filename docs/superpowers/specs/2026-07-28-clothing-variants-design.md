# Clothing Product Variants Design

**Date:** 2026-07-28
**Status:** Approved for implementation

## Goal

Convert the café-oriented inventory and POS system into a clothing retail system. Remove the recipe and preparation domain completely. Replace café item types and recipe products with products whose independently managed variants are defined by category colors and sizes.

## Locked decisions

- The existing Arabic, RTL application remains the presentation foundation.
- The main warehouse remains. The café/sub-warehouse becomes the shop.
- A category defines free-text colors and sizes.
- Every sellable product requires both a color and a size.
- A product selects a subset of its category's active colors and sizes. The UI generates their Cartesian product, and the user can disable individual combinations before saving.
- A variant is the unit of purchase, FIFO stock, transfer, sale, pricing, activation, and reporting.
- Every variant has a unique automatically generated internal code and an optional manually entered or scanned unique barcode.
- Every variant has its own selling price.
- Purchase invoice lines select exact variants and give every line its own quantity and unit cost.
- A category color or size linked to a variant cannot be deleted. It can be deactivated so it is unavailable to new products while existing history remains valid.
- There is no deployed system or production data to preserve.

## Domain model

### Categories and options

Keep the two-level category tree. The exact category assigned to a product owns its option lists; options are not inherited.

- `category_colors`: `id`, `category_id`, `name`, `is_active`, timestamps
- `category_sizes`: `id`, `category_id`, `name`, `is_active`, timestamps
- Names are unique within their category, with trimmed, case-insensitive duplicate validation.
- Categories cannot be deactivated while active products depend on them.
- Linked options cannot be deleted. Deactivation preserves existing variants and prevents new use.

### Products

A product stores information shared by the merchandise family:

- `id`
- `name`
- `category_id`
- `is_active`
- timestamps

Example: `Nike Cotton T-Shirt`.

### Product variants

A product variant is one enabled color-size combination:

- `id`
- `product_id`
- `color_id`
- `size_id`
- unique generated internal `code`
- optional unique `barcode`
- `selling_price`
- `is_active`
- timestamps

The combination `(product_id, color_id, size_id)` is unique. A variant can only use active options belonging to the product's category when it is created. Existing variants remain valid if their color or size is later deactivated.

## Workflows

### Category management

The category form manages its name, parent, colors, and sizes. New free-text options are normalized and checked for duplicates. Existing linked options may be deactivated but not removed.

### Product management

The product form:

1. Selects a category.
2. Selects active colors and sizes from that category.
3. Displays the generated color-size grid.
4. Lets the admin exclude individual combinations.
5. Collects each enabled variant's selling price and optional barcode.
6. Generates a unique internal code for every enabled variant.

Edits may add variants. Variants with stock or transaction history are deactivated rather than deleted.

### Purchases

Purchase invoices select exact product variants. Each line independently records:

- variant
- quantity
- purchase unit cost

Confirmation creates FIFO stock batches for the selected variant in the main warehouse.

### Inventory and transfers

All batches, movements, balances, minimum-stock settings, and transfer lines reference variants. Transfers move an exact color-size variant from the main warehouse to the shop while carrying FIFO cost.

### POS and orders

The POS catalog contains active variants with their product, category, color, size, price, code, and barcode. A cashier may:

- scan a barcode to add the exact variant, or
- select a product and then its color-size variant manually.

Order lines snapshot the product name, color, size, code/barcode, unit price, quantity, and FIFO cost. A sale consumes the exact variant from shop FIFO stock.

## Recipe removal

Remove:

- recipe, recipe-size, ingredient, preparation, and preparation-allocation tables
- the API recipes module and route registration
- recipe frontend pages, components, models, and services
- recipe shared types
- recipe-aware order and inventory branches
- recipe navigation and category/item protection rules
- recipe-specific tests and documentation

Because no deployed data exists, the development schema and migration history may be cleaned without compatibility shims. Historical order recipe references are not retained.

## API boundaries

- Category create/update payloads include color and size option collections.
- Product endpoints replace the old café item-type behavior and expose variants.
- Purchase, inventory, transfer, and order endpoints use `variantId`.
- POS catalog lookup supports barcode and manual browsing.
- Validation rejects cross-category options, duplicate combinations, duplicate barcodes, inactive options for new variants, and invalid money/quantity values.

## Error handling and integrity

- Product and variant creation is transactional.
- Purchase confirmation, transfers, and sales preserve the existing atomic FIFO behavior.
- Unique database constraints back application validation for codes, barcodes, option names, and combinations.
- Conflicts return actionable Arabic messages.
- Existing immutable financial and inventory documents remain immutable.

## Testing

Use test-driven development for each behavior:

- category option validation and lifecycle
- product combination generation and variant validation
- generated code and barcode uniqueness
- per-variant purchase batches and FIFO balances
- per-variant transfers
- barcode/manual POS selection
- per-variant order stock deduction and snapshots
- absence of recipe routes, navigation, types, and source files

After focused red-green cycles, run the complete test, lint, typecheck, and build baseline. A separate reviewer must inspect the full diff against this design, then re-review after fixes.

## Out of scope

- Manufacturing, bills of materials, ingredients, recipes, or preparations
- Inherited category options
- Products with only a color or only a size
- Bulk editing of selling prices
- Preserving undeployed recipe data
