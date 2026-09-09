import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const legacyFile = resolve(process.env.DATA_FILE || join(existsSync('/data') ? '/data' : join(root,'data'),'state.json'));
const app = await createApp({
  legacyFile,
  databaseFile:resolve(process.env.DATABASE_FILE || join(dirname(legacyFile),'chore-fridge.sqlite')),
  staticRoot:join(root,'apps/web/dist'),
  legacyWrites:process.env.LEGACY_STATE_WRITES !== 'false',
  logger:true,
});
await app.listen({host:process.env.HOST || '0.0.0.0',port:Number(process.env.PORT || 8080)});
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async () => { await app.close(); process.exit(0); });
