import { LoginPage } from "@cashier/web-core/features/login-page";

// Online refuses cashiers (plan D4), so the screen asks for an admin only.
export default function Page() {
  return <LoginPage adminsOnly />;
}