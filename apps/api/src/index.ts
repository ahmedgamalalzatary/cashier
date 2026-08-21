import { loadRuntimeEnv } from './env.js';
import { createApp } from './app.js';
import { createDb } from './db/index.js';

const environment = loadRuntimeEnv();

createApp(createDb(environment.DATABASE_URL), {
  jwtSecret: environment.JWT_SECRET,
  corsOrigin: environment.CORS_ORIGIN,
  trustProxy: environment.TRUST_PROXY,
}).listen(environment.PORT, () => {
  console.log(`API listening on http://localhost:${environment.PORT}`);
});
