export type UserFormState = {
  name: string;
  username: string;
  role?: "admin";
  password: string;
};

export function userRequestBody(form: UserFormState, editing: boolean) {
  const password = form.password;
  return {
    name: form.name.trim(),
    username: form.username.trim(),
    ...(!editing ? { role: form.role ?? "admin" } : {}),
    ...(!editing || password ? { password } : {}),
  };
}
