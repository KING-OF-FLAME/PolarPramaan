// Fails if server-only secrets or their variable names appear in client bundles.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = '.next/static';
const forbidden = [/DATABASE_URL/, /LLM_API_KEY/, /CRON_SECRET/, /SUPABASE_SERVICE_ROLE_KEY/, /sk-ant-[a-z0-9-]{10,}/i, /postgres(ql)?:\/\/[^"'\s]+@/];
const hits = [];
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|json|html)$/.test(f)) {
      const t = readFileSync(p, 'utf8');
      for (const re of forbidden) if (re.test(t)) hits.push(`${p}: ${re}`);
    }
  }
}
walk(root);
if (hits.length) {
  console.error('Secret-like strings found in client bundle:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('client bundle scan: no secret names or credentials found');
