// Process due publication outbox items (for environments without cron).
import { processOutbox } from '../src/lib/publish/service';
import { scriptDb } from './lib';

const db = await scriptDb();
const out = await processOutbox((fn) => db.tx(fn), 50);
console.log(JSON.stringify(out, null, 2));
await db.close();
