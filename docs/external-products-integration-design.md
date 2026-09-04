# External Products Integration Design

Status: approved for implementation.

## Work checkpoint — 2026-08-18

The code is complete, reviewed, and fully green. The POS-blocking `503` is fixed and the live catalog now syncs successfully. What remains is **data entry, not development** — split between this side and the external backend's owner. See "Current blockers" below for who does what.

### Live state at this checkpoint (verified against the deployed backend, 2026-08-18)

```text
catalog refresh: SUCCESS   last_error: null
134 products cached, 21 categories
 |
 +--  77  "غير مكتمل"       stock not mapped yet      -> OUR side, in-app
 +--  57  "موقوف عن البيع"  modifier names missing    -> EXTERNAL side, dashboard
 +--   0  "جاهز للبيع"      hence the POS grid is empty
```

The POS shows no product cards because a product is only sellable once its ingredients are mapped locally. That is the designed rule, not a defect: the system must never sell a drink it cannot deduct stock for. The Products tab still lists all 134, which is why the tab looks populated while the POS looks empty.

### Implemented

- Generalized the existing external authentication into one shared server-side client for orders and products. Credentials and tokens remain in our API only; the browser never calls Biscofa directly.
- Added strict catalog synchronization from `GET /api/admin/categories` and `GET /api/admin/products`, including unique category resolution, duplicate-ID rejection, database-safe money/ID validation, omitted-null normalization, per-product quarantine of unnamed modifiers, token refresh recovery, timeout handling, and request coalescing.
- Removed the temporary per-product modifier GET workaround. Once modifier names are repaired, the main admin-products response supplies both `nameAr` and `nameEn`, so a refresh requires only the categories and products requests.
- Added normalized local cache tables and transactional reconciliation for external categories, products, sizes, modifier groups, and modifier options. Missing upstream records become non-current while local stock mappings and historical records remain preserved.
- Added local stock setup for unsized products, every size of sized products, and every modifier option. Modifiers must be mapped or explicitly marked as having no stock effect.
- Replaced local sellable-product management with the read-only synchronized Products tab. It displays bilingual details, images, category, availability/visibility, prices, discount period, sizes, modifier rules/options, stock completeness, sync time, stale-cache state, the reason a refresh failed, manual refresh, and stock setup.
- Removed local sellable-product creation from the recipes API, shared types, frontend form/model, and POS. Prepared recipes and preparation history remain local and editable.
- Rebuilt POS selection around external products, explicit/default sizes, required/max modifier groups, modifier quantities, local discount calculation, server-side ownership validation, and external-only order payloads. Ambiguous/missing default sizes require an explicit selection rather than guessing.
- Added FIFO consumption for base/size and modifier ingredients, combined item consumption, exact cost snapshots, negative-stock allocations/flags, product/size/modifier name snapshots, and idempotent checkout.
- Added external-product refund allocation tracking based on the original sale allocations rather than the current catalog. These records do not restore consumed drink ingredients to stock.
- Added external-product waste targets that consume the configured base or size ingredients through FIFO. External online orders remain display-only.
- Added order/receipt modifier display, refund compatibility, external-product waste UI, external catalog image-host configuration, `.env` credentials, and Docker API environment forwarding.
- Updated this document with the verified modifier-name data-loss cause and the existing PUT-based dashboard repair path. `apps/temp-backend` remains unchanged/read-only.

### Review findings addressed

A strict sub-agent review of the complete change set produced the following fixes:

- **Discount clock.** The external backend evaluates discount windows against a fixed UTC+3 (`DateTime.UtcNow.AddHours(3)`), which does not follow Egypt's daylight saving. Our API and POS compared against real `Africa/Cairo` time, so every discount boundary was off by one hour for the whole winter. Both sides now share `isExternalDiscountActive` in `@cashier/shared`, which converts external timestamps to real instants and handles `Z`/offset suffixes instead of comparing strings.
- **Checkout query scope.** `loadExternalProducts` read the whole modifier-option and ingredient tables on every sale while holding product locks. All follow-up reads are now scoped to the ids of the rows already loaded.
- **Refresh/checkout lock ordering.** `applyCatalog` now marks `external_products` non-current first, so a refresh blocks on the checkout's product lock instead of changing sizes or modifier prices mid-sale.
- **Duplicated catalog endpoint.** `GET /api/orders/catalog` re-implemented the sellability rule already owned by the products module and was no longer called; it was removed along with its controller and service methods.
- **Unused required field.** `discountedPrice` was mandatory in the catalog schema but never consumed, so an upstream omission would have rejected an otherwise valid refresh. It was dropped from the schema.
- **Error classification.** The online-orders client identified failures by matching Arabic message text. `ExternalBackendClient` now throws `ExternalBackendError` with a stable `kind`, and callers branch on that.
- **Sync failure reason.** The specific upstream reason a refresh failed now reaches the Products tab instead of being computed and discarded.
- **POS tile price.** Catalog tiles showed the undiscounted price and fell back to an arbitrary size; they now show the discounted default size, or the cheapest size when no default exists.
- Removed a leftover duplicate import in `apps/api/src/app.ts`.

### Verification completed at this checkpoint

- `pnpm build` — passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: API unit tests **143**, web tests **162**.
- `pnpm --filter @cashier/api test:integration` — the complete database integration suite passed: **16 files, 151 tests**.
- A live catalog refresh against the deployed backend succeeded: 21 categories and 134 products cached, `last_error` null.
- No skipped tests remain.
- No commit was created. Migration `0029` has been applied to the local development database.

One flake to be aware of: `tests/integration/inventory` once failed on "returns ordered per-batch allocations and rolls back an outer session" during a full run, then passed in isolation and on every rerun. It is a concurrency/timing test and is unrelated to this feature, but it is worth watching rather than assuming it is stable.

## Current blockers — who fixes what

Three parts. The first is finished; the other two are data entry by two different people.

| # | What | Owner | Scope | Blocking? |
|---|------|-------|-------|-----------|
| 1 | Integration code | **Done** | Catalog no longer rejected wholesale; POS `503` resolved | No |
| 2 | Local stock setup | **Us** | Configure from the `/recipes` page | Yes — application-side data entry |
| 3 | Modifier names | **Client / external backend owner** | Separate modifier dashboard, or Excel supplied to the other developer for seeding | Yes — external data entry |

### Blocker A — local stock setup (our side, 77 products)

The **`/recipes` page** -> **Stock setup** maps inventory ingredients and quantities for the base product or each size, and marks every modifier option as either mapped or explicitly "no stock effect". Each product flips to "جاهز للبيع" and appears in the POS immediately.

No code change and no external dependency. This can start now and is the fastest way to prove the whole integration end to end: configure one product, then confirm it sells in the POS.

### Blocker B — missing modifier names (external side, 57 products)

The client will enter the Arabic and English modifier **group** and **option** names through the separate modifier-management dashboard, or provide an Excel sheet for the other developer to seed. The already-deployed endpoints are:

### Search and pagination

The external backend exposes server-side search and pagination:

- `GET /api/admin/products/search?search=...&page=1&pageSize=10`
- `GET /api/AdminOrders/search?search=...&page=1&pageSize=10`

Our API proxies paginated external orders through `GET /api/orders/external`, preserving `{ data, pagination }`. Full product synchronization continues to use `GET /api/admin/products` so the local cache can reconcile the complete catalog; product screens may paginate or filter the synchronized cache locally.

### Cache and refresh architecture

POS, `/recipes`, and other catalog reads use the local MySQL catalog cache and do not wait for the external backend. A separate worker container refreshes the catalog every 12 hours; the admin hard-refresh action uses the same refresh operation immediately. The refresh is validated and applied transactionally, preserving the previous valid cache on failure. External order caching follows the same pattern, inserting new orders without deleting local history; product reconciliation treats the external backend as authoritative for additions, updates, and removals.

- `PUT /api/admin/products/{productId}/modifier-groups/{groupId}`
- `PUT /api/admin/modifier-groups/{groupId}/options/{optionId}`

No code change is required on their side either — the write endpoints exist and work. The names cannot be recovered automatically because the migration dropped the source column (see "Verified root cause"), and an ID such as `721` carries no business meaning, so a person who knows the menu must retype each one.

Live counts at this checkpoint: **112 of 117 modifier groups** and **665 options** still have no name, affecting **57 products**. Our POS picks up each repaired record on its next refresh with no code change and no redeploy.

**These 57 need both blockers cleared.** Stock setup works on quarantined products, so their local mapping can be prepared in advance; they go live the moment the names are entered.

### Open question for the catalog owner

Confirm whether any real modifier group carries `maxSelections: 0`. The upstream backend never enforces that field, and a required group with a maximum of zero would make its product permanently unsellable with a misleading error. No live product currently uses it.

This document is the handoff for replacing locally managed sellable products with a read-only product catalog synchronized from the Biscofa backend. The current database is disposable, so implementation may replace the existing product-side schema without migrating current product data.

## External category resolution

The deployed `GET /api/admin/products` response includes `categoryName` but not `categoryId`. The external developer will not change that response, so synchronization combines it with `GET /api/admin/categories`.

For each product, the synchronizer matches `categoryName` exactly against the category's `nameAr` or `nameEn`. Exactly one category must match. A missing or ambiguous match rejects the complete refresh and preserves the previous valid cache; the system must never guess or assign the wrong category.

The deployed data was checked on 2026-08-18: all 134 admin products matched exactly one of the 21 admin categories, with no missing or ambiguous matches. The public `GET /api/products/menu` endpoint is not used because both tested language variants returned HTTP 500 and its query excludes some non-public products.

## Upstream modifier-name data loss (technical detail for Blocker B)

Product `1259` is **Ice Chocolate Dark**. It has required modifier group `146` with options `721` through `725`, but the deployed backend stores/returns no names for that group or its options.

The following deployed requests were verified on 2026-08-18 and all returned HTTP 200 with empty `name` values:

- `GET /api/admin/products/1259/modifier-groups?lang=ar`
- `GET /api/admin/products/1259/modifier-groups?lang=en`
- `GET /api/admin/modifier-groups/146/options?lang=ar`
- `GET /api/admin/modifier-groups/146/options?lang=en`

The main admin-products response also omits `nameAr` and `nameEn` for these modifier records. The alternate endpoints cannot recover the names because they read the same null database columns. An ID such as `721` contains no business meaning, so neither the mobile app nor this POS can determine whether it means extra cream, extra sugar, or another choice.

This affects the mobile product screen, cart, checkout, receipts, and order history. The correct external fix is to populate Arabic/English modifier group and option names, backfill existing records, reject blank names on create/update, and return the names consistently.

### Verified root cause (confirmed in the backend source, `apps/temp-backend`)

The blocker was traced to a data-destroying migration, not to the API code.

Migration `Foodics/Migrations/20260605090700_AddModelstLocalization.cs` localizes the schema. For `OrderItems` it uses `RenameColumn` (`ProductName` -> `ProductNameEn`), so data survives. For modifiers it instead does:

1. `DropColumn("Name", "ModifierOptions")` and `DropColumn("Name", "ModifierGroups")`
2. `AddColumn("NameAr"/"NameEn", ...)` as new nullable columns

No backfill copies the old `Name` into either new column, so every modifier group and option that existed before that migration lost its name permanently.

Supporting facts from the source:

- `Models/ModifierGroup.cs` and `Models/ModifierOption.cs` declare `NameAr`/`NameEn` as nullable with no DB constraint.
- `ExtensionMethod/LocalizationExtensions.Localize` falls back to `string.Empty` when both languages are null, which is why the API returns `""` rather than `null`.
- The read paths are correct: `Controllers/Userss/ProductsController.cs` (product listing), `Controllers/Admin/ModifierGroupsController.cs`, and `Controllers/Admin/ModifierOptionsController.cs` all map `NameAr`/`NameEn` through `Localize`. Changing client or endpoint choice cannot help.
- Create endpoints do mark `NameAr`/`NameEn` as `[Required]`, but the update endpoints (`UpdateModifierGroupDto`, `UpdateModifierOptionDto`) accept blanks, and nothing rejects whitespace-only names.

So the fix is data repair on the external side (re-enter the lost names, since the source column is dropped and unrecoverable from the current schema), plus non-blank validation on update.

No safe client-side mapping exists while the names are missing, so an unnamed modifier is never displayed as a bare ID.

### Quarantine rule (implemented 2026-08-18)

Rejecting the whole catalog when any modifier is unnamed proved unworkable against live data: **112 of 117 modifier groups and 665 options** come back without names, so every refresh failed, no cache was ever written, and the POS blocked all sales with "لا توجد نسخة صالحة من المنتجات الخارجية متاحة للبيع" — including the products that were perfectly healthy.

The integration now picks the good records instead of rejecting everything:

- Missing or blank modifier group/option names are accepted as `null` and cached. The local `external_modifier_groups` and `external_modifier_options` name columns are nullable (migration `0029`).
- A product with any unnamed group or option is **quarantined**: it syncs, appears in the Products tab, and can have its stock mapped, but `sellable` is false and the POS never offers it. `calculateExternalOrderLine` rejects such a sale server-side, so a receipt can never snapshot a nameless modifier.
- The Products tab labels these products "موقوف عن البيع" and explains that the names are missing upstream. Unnamed records read "مجموعة إضافات بدون اسم" / "إضافة بدون اسم" — never a raw external ID.
- Genuinely malformed data (bad money, IDs, dates, duplicate IDs, ambiguous categories) still rejects the entire refresh and preserves the previous valid cache. Only the missing-name case is quarantined per product.

Verified against the deployed backend on 2026-08-18: the refresh now succeeds, caching 21 categories and 134 products, of which 57 are quarantined for unnamed modifiers and 77 are available for stock setup. Each repaired product becomes sellable on the next refresh with no code change.

### Operational repair path (no external code change required)

The deployed backend already exposes authenticated update endpoints that write the missing `NameAr` and `NameEn` columns:

- `PUT /api/admin/products/{productId}/modifier-groups/{groupId}`
- `PUT /api/admin/modifier-groups/{groupId}/options/{optionId}`

An authorized product-management dashboard can re-enter both names for every affected group and option. After a successful update, `GET /api/admin/products` includes `nameAr` and `nameEn`, and the language-specific modifier GET endpoints return the selected `name`. The POS sees the repaired names on its next catalog refresh. A browser-hosted dashboard must still be added to the external backend's CORS allowlist; the server-to-server POS integration does not require browser CORS.

The original names cannot be inferred from the IDs, so a person who knows the menu must verify each meaning before saving it. Updating an option also changes how that option appears in the external backend's past orders because that backend reads modifier names through the live option relationship. Our POS continues to snapshot names on each local sale, so later external renames do not rewrite our receipts.

Separately, the deployed server suppresses null JSON properties. The integration client must accept omitted nullable descriptions, images, discounts, and discount dates and normalize them to `null`; this part can be fixed locally.

## Goal

The external backend becomes the only source of sellable product catalog data. Our system mirrors that data locally for reliable POS use while continuing to own stock, ingredient quantities, FIFO costing, and operational preparation data.

```text
External backend (read-only catalog)
  categories
  products
  sizes
  modifier groups/options
            │
            │ refresh on use or manual refresh
            ▼
Our normalized product cache
            │
            ├── external-owned fields: read-only
            │
            └── local stock setup: editable
                  base product/size -> inventory ingredients + quantities
                  modifier option   -> inventory ingredients + quantities
                  modifier option   -> explicit "no stock effect"
```

## Ownership rules

External-owned, read-only fields:

- External IDs and category relationship.
- Arabic and English product names.
- Arabic and English descriptions.
- Image URL.
- Base price.
- Discount percentage, start, and end.
- Calories and reward points.
- Availability and visibility.
- Sizes, including localized names, prices, and default selection.
- Modifier groups, including localized names, required state, and maximum selections.
- Modifier options, including localized names and extra prices.

Locally owned, editable fields:

- Ingredient mappings and quantities for a base product or each size.
- Ingredient mappings and quantities for each modifier option.
- An explicit "no stock effect" setting for modifiers such as "no sugar" or "no ice."
- Inventory quantities, purchases, transfers, FIFO batches, costs, minimum levels, and stock movements.
- Prepared recipes and preparation history.

Our API must never send product create, update, delete, toggle, size, or modifier writes to the external backend.

## Local data model

Use normalized tables rather than storing unvalidated product JSON. The model must represent:

- External categories.
- External products.
- External product sizes.
- External modifier groups.
- External modifier options.
- Base-product ingredient mappings for products with no sizes.
- Per-size ingredient mappings for products with sizes.
- Per-modifier-option ingredient mappings.
- Modifier stock-configuration state so "not configured" is distinct from "configured with no stock effect."
- Catalog sync metadata, including the last successful sync time.

External IDs are the stable identifiers from the source backend. Local inventory item IDs remain the identifiers used by FIFO stock tables.

The existing product-recipe schema may be replaced because the current database will be wiped. Local prepared recipes and their preparation history remain supported. Local warehouse items must not become directly sellable POS products; they are stock ingredients/components only.

## Synchronization

Use the existing server-side external authentication flow, generalized into a shared external-backend client. The browser calls our API, and our API calls the Biscofa API. Credentials, access tokens, and refresh tokens remain server-only; browser CORS does not participate in this server-to-server flow.

A sync performs authenticated reads from:

- `GET /api/admin/categories`
- `GET /api/admin/products`

The complete responses must be schema-validated before any database mutation. A successful sync applies categories, products, sizes, groups, and options in one database transaction. Existing local ingredient mappings are preserved for external records that still exist. Records missing from a successful full response become unavailable in the current catalog; historical order snapshots remain unchanged.

Synchronization is triggered in two ways:

1. Refresh on use when the products screen or POS catalog is opened.
2. A manual admin refresh button on the Products tab.

Concurrent refreshes must be coalesced so only one external request is active. The manual action bypasses any short request-deduplication window.

If a refresh fails and a previous successful cache exists, serve the cached catalog and expose its last-sync time and stale state. If no successful cache exists, show an explicit error and prevent product sales. A failed or malformed response must never partially erase or overwrite the last valid cache.

## Products tab

Keep the existing Products tab; do not add another tab.

Remove all local product CRUD controls, including create, edit, delete, activate, and deactivate. Product details are read-only and display the synchronized bilingual text, image, category, pricing, discount, availability, calories, points, sizes, and modifier structure.

The tab retains one local action: **Stock setup**. An admin uses it to map local inventory ingredients and quantities to:

- The base product when the external product has no sizes.
- Every sellable external size when sizes exist.
- Every external modifier option that consumes stock.

Each modifier option must be either mapped to at least one ingredient or explicitly marked as having no stock effect. Untouched options are incomplete, not zero-stock options. The screen shows configuration completeness and the last successful external refresh time.

Prepared Recipes and Preparation History remain separate, editable local tabs and keep their existing operational purpose.

## POS behavior

POS displays only synchronized external products. Locally created warehouse items, including resale items, never appear directly in the POS catalog.

A product is sellable only when all of the following are true:

- It is available and visible in the external catalog.
- Every modifier group and option it offers has a name in the external catalog.
- Its base product or selected size has a complete local ingredient mapping.
- Every offered modifier option is either mapped or explicitly marked as having no stock effect.

Products without sizes use their external base price and base stock recipe. Products with sizes use the selected size's full price and stock recipe.

Product selection must support:

- A default or explicitly selected size.
- Required modifier groups.
- Maximum selections per group.
- Modifier-option quantities.
- Validation that every size and modifier belongs to the selected product.

The selected size or base price is reduced by an active product discount percentage, then selected modifier prices are added. Discount activity is calculated locally from the source percentage and start/end timestamps so it remains correct between syncs.

Example: selling two large matcha drinks, each with two extra-cream portions, deducts twice the large-matcha ingredient recipe and four times the extra-cream ingredient recipe.

Sales continue to allow negative computed stock and flag the deficit, matching the current system rule.

## Orders, refunds, waste, and reporting

New local order lines reference the external product and optional size while snapshotting product, size, modifier names, IDs, quantities, and prices. Later external edits must not alter historical receipts.

Each sale consumes all mapped base/size and modifier ingredients through the existing FIFO inventory engine. Resulting allocations and costs remain attached to the local order line so profit reporting, deficit flags, refunds, and audit history remain accurate.

Refund processing uses the recorded allocation snapshots rather than the current product catalog. Waste can consume the configured base-product or size recipe; individual ingredients remain available as direct waste targets.

Online orders read from the external backend remain display-only and do not change our local inventory.

## Validation and safety requirements

Our API must reject or exclude selections when:

- The product, size, group, or option is unknown or no longer current.
- A size does not belong to the selected product.
- A modifier option does not belong to a group on the selected product.
- A required modifier group is missing.
- A group's maximum selection count is exceeded.
- Modifier quantities are invalid.
- Local stock setup is incomplete.
- External money, dates, URLs, IDs, or nested records are malformed.

The source backend's cart code does not perform all of these ownership and selection checks and does not deduct inventory on checkout. Those behaviors must not be copied.

## Testing and acceptance criteria

Implementation is complete when automated tests demonstrate:

- Strict validation and safe mapping of external categories and products.
- Authentication, refresh-token recovery, timeout handling, and concurrent-request coalescing.
- Transactional upsert/reconciliation without loss of local stock mappings.
- Cached fallback on upstream failure and blocking behavior when no cache exists.
- Manual refresh and refresh-on-use behavior.
- Read-only Products tab with stock setup as its only edit path.
- Product-without-size and product-with-sizes flows.
- Required/max modifier validation, ownership checks, and modifier quantities.
- Explicit no-stock-effect modifiers versus incomplete modifiers.
- Discount and total-price calculations.
- FIFO deductions for base/size and modifier ingredients.
- Negative-stock flags, refunds, waste, order history, and reports.
- POS exclusion of local resale items and incomplete/unavailable external products.
- Online orders do not affect local inventory.

Run the repository's full applicable build, lint, typecheck, and test suites before and after implementation, following the repository review workflow.

## Resume instructions

When returning to this task:

0. Read "Work checkpoint" and "Current blockers" first — the code is done and green; what remains is data entry described there. Re-run `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm --filter @cashier/api test:integration` to confirm the baseline before changing anything.
1. Provide this document to the implementing agent.
2. Use the authenticated admin products and admin categories endpoints with strict unique category-name matching.
3. Keep the existing server-side proxy pattern used by external orders; never expose external credentials or tokens to the browser.
4. Keep `apps/temp-backend` read-only.
5. Implement the approved design with test-driven development and the repository's required review workflow.
