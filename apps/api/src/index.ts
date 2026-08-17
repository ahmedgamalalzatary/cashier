import { loadRuntimeEnv } from './env.js';
import { createApp } from './app.js';
import { createDb } from './db/index.js';

const environment = loadRuntimeEnv();

createApp(createDb(environment.DATABASE_URL), {
  jwtSecret: environment.JWT_SECRET,
  corsOrigin: environment.CORS_ORIGIN,
  trustProxy: environment.TRUST_PROXY,
  externalOrders: {
    baseUrl: environment.EXTERNAL_ORDERS_BASE_URL,
    phoneNumber: environment.EXTERNAL_ORDERS_PHONE_NUMBER,
    password: environment.EXTERNAL_ORDERS_PASSWORD,
  },
}).listen(environment.PORT, () => {
  console.log(`API listening on http://localhost:${environment.PORT}`);
});
