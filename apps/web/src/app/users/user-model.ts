import type { Role } from "@cashier/shared";

export type UserFormState = {
  name: string;
  username: string;
  role: Role;
  password: string;
};

export function userRequestBody(form: UserFormState, editing: boolean) {
  const password = form.password.trim();
  return {
    name: form.name.trim(),
    username: form.username.trim(),
    role: form.role,
    ...(!editing || password ? { password } : {}),
  };
}
