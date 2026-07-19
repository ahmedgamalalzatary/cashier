import './env.js';
import { createApp } from './app.js';
import { createDb } from './db/index.js';

const port = Number(process.env.PORT) || 4000;

createApp(createDb()).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
