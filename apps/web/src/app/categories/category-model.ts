import type { Category } from "@cashier/shared";

export function categoryUpdateBody(name: string, parentId: string) {
  return {
    name: name.trim(),
    parentId: parentId ? Number(parentId) : null,
  };
}

export function categoryParentOptions(
  categories: Category[],
  editingId: number,
  currentParentId?: number | null,
) {
  return categories.filter(
    (category) =>
      category.parentId === null &&
      category.id !== editingId &&
      (category.isActive || category.id === currentParentId),
  );
}
