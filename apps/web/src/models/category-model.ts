import type { Category } from "@cashier/shared";

export function categoryUpdateBody(
  name: string,
  parentId: string,
  currentParentId: number | null,
) {
  const selectedParentId = parentId ? Number(parentId) : null;
  return {
    name: name.trim(),
    ...(selectedParentId !== currentParentId
      ? { parentId: selectedParentId }
      : {}),
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
