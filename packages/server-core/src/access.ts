/**
 * How much of the system one API may reach.
 *
 * A shop PC pins every session to its own branch by passing that branch id, so
 * it may be written as a plain string. The online deployment serves every
 * branch and refuses cashiers altogether (plan decision D4), which is the
 * explicit `{ online: true }` form.
 */
export type AccessOptions = {
  /** The PC's own branch. Set means every request is pinned to it. */
  branchId?: string;
  /** The online deployment: no cashier may log in or keep a session. */
  online?: boolean;
};

export type Access = string | AccessOptions;

export function resolveAccess(access?: Access): Required<
  Pick<AccessOptions, "online">
> & { branchId?: string } {
  if (typeof access === "string") return { branchId: access, online: false };
  return { branchId: access?.branchId, online: access?.online ?? false };
}