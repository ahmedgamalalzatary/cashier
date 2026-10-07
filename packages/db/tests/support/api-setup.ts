import { db } from "./database.js";

export { db };

// Fixtures shared by the API's MySQL tests, which live in this package.
export const appOptions = {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["http://localhost:3000"],
  externalOrders: {
    baseUrl: "https://orders.example.com",
    phoneNumber: "01234567890",
    password: "server-only-password",
  },
};

// items.code is system-assigned and unique; fixtures that insert straight into
// the table have to supply their own. A monotonic counter stays unique across
// the cleanup that runs before every test.
let itemCodeCounter = 0;
export const nextTestItemCode = () => (itemCodeCounter += 1);
