import type { Category } from "@cashier/shared";

export function categoryUpdateBody(
  name: string,
  parentId: string,
  currentParentId: string | null,
) {
  const selectedParentId = parentId ? parentId : null;
  return {
    name: name.trim(),
    ...(selectedParentId !== currentParentId
      ? { parentId: selectedParentId }
      : {}),
  };
}

export function categoryParentOptions(
  categories: Category[],
  editingId: string,
  currentParentId?: string | null,
) {
  return categories.filter(
    (category) =>
      category.parentId === null &&
      category.id !== editingId &&
      (category.isActive || category.id === currentParentId),
  );
}
