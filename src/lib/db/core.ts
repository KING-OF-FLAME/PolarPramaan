// Driver-agnostic database access used by the app, scripts and tests.
// - 'postgres': postgres.js against DATABASE_URL (Supabase or any Postgres 15+).
// - 'pglite-file': embedded PGlite for local development/tests (never used on Vercel).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  mode: 'postgres' | 'pglite-file' | 'pglite-memory' | 'pglite-snapshot';
  /** Run fn in a transaction. Do not call tx() again inside fn; pass the Queryable down. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run fn in a read-only transaction under the restricted pp_public role. */
  asPublic<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sqlText: string): Promise<void>;
  /** Run a multi-statement script atomically (used by migrations; poolers reject raw begin/commit). */
  execTx(sqlText: string): Promise<void>;
  close(): Promise<void>;
}

export class DbUnavailableError extends Error {
  constructor(message = 'Database is not configured. Set DATABASE_URL (see docs/SETUP.md).') {
    super(message);
    this.name = 'DbUnavailableError';
  }
}

export async function createDb(mode: string, url?: string, opts: { migrate?: boolean } = {}): Promise<Db> {
  let db: Db;
  if (mode === 'postgres' && url) db = await createPostgres(url);
  else if (mode === 'pglite-file') db = await createPglite(url && url.startsWith('pglite:') ? url.slice(7) : join(process.cwd(), '.data', 'pglite'));
  else if (mode === 'pglite-memory') db = await createPglite(null);
  else if (mode === 'pglite-snapshot' && url?.startsWith('snapshot:')) db = await createPglite(null, url.slice(9));
  else throw new DbUnavailableError();
  if (opts.migrate ?? db.mode !== 'postgres') await migrate(db);
  return db;
}

const jsonParam = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));

async function createPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX || 3),
    prepare: false, // compatible with transaction-mode poolers (Supabase :6543)
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    // Callers pass JSON.stringify(...) for json/jsonb parameters (PGlite semantics). postgres.js
    // would JSON-encode such a string again and store a JSON string, so pass strings through.
    types: {
      jsonb: { to: 3802, from: [3802], serialize: jsonParam, parse: (x: string) => JSON.parse(x) },
      json: { to: 114, from: [114], serialize: jsonParam, parse: (x: string) => JSON.parse(x) },
    },
  });
  type Tx = { unsafe: (q: string, p?: unknown[]) => Promise<unknown> };
  const wrap = (t: Tx): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await t.unsafe(text, params as never[])) as unknown as T[];
    },
  });
  const root = wrap(sql as unknown as Tx);
  const db: Db = {
    mode: 'postgres',
    query: root.query,
    async tx(fn) {
      return (await sql.begin((t) => fn(wrap(t as unknown as Tx)))) as never;
    },
    async asPublic(fn) {
      return (await sql.begin(async (t) => {
        await t.unsafe('set local transaction read only');
        await t.unsafe('set local role pp_public');
        return fn(wrap(t as unknown as Tx));
      })) as never;
    },
    async exec(text) {
      await sql.unsafe(text);
    },
    async execTx(text) {
      await sql.begin((t) => t.unsafe(text));
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
  return db;
}

async function createPglite(dataDir: string | null, snapshotTar?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  let pg;
  if (snapshotTar) {
    const { readFile } = await import('node:fs/promises');
    pg = await PGlite.create({ loadDataDir: new Blob([new Uint8Array(await readFile(snapshotTar))]) });
  } else pg = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  // PGlite is single-connection: serialize transactions so they do not interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  type PgTx = { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (t: PgTx): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await t.query(text, params)).rows as T[];
    },
  });
  const db: Db = {
    mode: snapshotTar ? 'pglite-snapshot' : dataDir ? 'pglite-file' : 'pglite-memory',
    query: (text, params) => serial(() => wrap(pg as unknown as PgTx).query(text, params)),
    tx: (fn) => serial(() => pg.transaction((t) => fn(wrap(t as unknown as PgTx)))),
    asPublic: (fn) =>
      serial(() =>
        pg.transaction(async (t) => {
          await t.query('set local transaction read only');
          await t.query('set local role pp_public');
          return fn(wrap(t as unknown as PgTx));
        }),
      ),
    exec: (text) => serial(async () => void (await pg.exec(text))),
    execTx: (text) => serial(async () => void (await pg.transaction((t) => t.exec(text)))),
    close: () => pg.close(),
    dump: () => pg.dumpDataDir('gzip'),
  } as Db & { dump: () => Promise<Blob> };
  return db;
}

export async function migrate(db: Db, dir = join(process.cwd(), 'db', 'migrations')): Promise<string[]> {
  await db.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());' +
      ' alter table schema_migrations enable row level security;',
  );
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const text = await readFile(join(dir, f), 'utf8');
    await db.execTx(`${text}\n;insert into schema_migrations(name) values ('${f.replace(/'/g, "''")}');`);
    applied.push(f);
  }
  return applied;
}
