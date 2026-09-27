# Branch workspaces

Each branch has an independent main warehouse/cafe workspace. Admins can manage every branch; a cashier works in exactly one assigned branch.

## Using branches

1. Open **الفروع** as an admin to add or rename a branch, archive it, or restore it.
2. Select **الفرع الحالي** in the application header, or choose **فتح الفرع** in the branch list. The workspace opens on Home; forms/carts/page state reset on a switch.
3. Open Employees in that workspace, create an employee, and grant cashier access. The account inherits the employee's branch. A person moving branches gets a new employee/account record so the old branch retains its history.

New workspaces start empty apart from cached backend catalog data when a successful catalog cache is available. Ingredient mappings, modifier stock effects, stock, staff, and transactions are not copied. Admin configures each branch's catalog stock setup independently.

Archive preserves records. Admin can select an archived branch to read history; operational writes and cashier login are blocked. Close its shifts before archiving. Keep at least one active branch.

## API contract

| Request                                        | Behavior                                           |
| ---------------------------------------------- | -------------------------------------------------- |
| `GET /api/branches`                            | Admin: every branch; cashier: assigned branch only |
| `POST /api/branches` `{ "name": "…" }`         | Admin creates an active workspace                  |
| `PUT /api/branches/:id` `{ "name": "…" }`      | Admin renames it                                   |
| `DELETE /api/branches/:id`                     | Admin archives it and revokes its cashier sessions |
| `PUT /api/branches/:id` `{ "isActive": true }` | Admin restores it                                  |

Business endpoints select the workspace through `X-Branch-Id`. Admin defaults to Main Branch when no header is supplied. Cashier defaults to its assigned branch and receives 403 if attempting another branch. Invalid IDs receive 400; missing branches receive 404; writes into archived workspaces receive 409. Global auth and branch management endpoints do not depend on workspace selection.

All existing operational APIs, parent/child lookups, stock effects, payroll queries, reports, catalog mappings, and background caches are scoped. Internal IDs remain globally unique; local item codes, request keys, and external catalog/order IDs can repeat in different branches. Composite foreign keys protect owned-record references. Global admin identities can appear as actors in each branch.

Browser preference is stored per account. Server authorization always reads the actual account's assignment. Responses arriving after a branch/account switch are rejected before page callbacks continue.

## Migration and rollout

- `0039_branch_workspaces` creates **الفرع الرئيسي**, preserves existing cashier assignment, and seeds the branch before adding its user references.
- `0040_branch_owned_data` assigns all existing operational rows to branch 1 without changing their IDs, quantities, amounts, or history. It introduces scoped uniqueness, catalog/cache keys, and owned-record references.
- Take the normal database backup and stop the old API/worker before migration. Old application versions use unscoped queries and must not keep running against the new multi-branch schema. Apply migrations before starting the updated API/worker/web together; see the Docker runbook.
- MySQL DDL is not transactional. On migration failure, inspect the failing statement and partial schema before retrying; do not blindly rerun already completed DDL or remove the production volume.

## Verification and remaining modules

Database tests exercise lifecycle, assignment, cross-branch reads/writes/references, independent item numbering, inventory/transfers/preparation, catalog setup, archive access, and active-branch worker state/leases. Client tests cover admin/cashier request scope, direct management-page access, and stale responses after switching.

This module isolates the existing flows. Full cashier CRUD/permission changes (AUTH-1/CRUD-1), immediate online stock deduction (ONLINE-1/2/3), reusable live recipe links (RECIPE-1), and multiple concurrent cashiers in the same branch (W1) remain separate audit items. Each branch currently has its own single open drawer slot.
