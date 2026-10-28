// Sync API for the Logbook PWA. Static files are served by the assets binding; only /api/* runs this code.
// Auth: a single shared secret (SYNC_KEY) sent as a Bearer token. Conflicts: newest `updated_at` wins per record.

interface D1Statement { bind(...v: unknown[]): D1Statement }
interface D1 {
  prepare(sql: string): D1Statement;
  batch(stmts: D1Statement[]): Promise<unknown[]>;
}
interface Env { DB: D1; ASSETS: { fetch(req: Request): Promise<Response> }; SYNC_KEY?: string }

interface Change { t: string; id: string; u: number; d: 0 | 1; data: string | null }

const TABLES = new Set(['exercises', 'routines', 'sessions', 'sets']);
const MAX_CHANGES = 50;
const MAX_DATA = 100_000;
const PAGE = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** Compare digests so the comparison time does not depend on how much of the key matched. */
async function keyOk(given: string, secret: string) {
  const [a, b] = await Promise.all([sha256(given), sha256(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const UPSERT = `
INSERT INTO records (tbl, id, data, deleted, updated_at, seq)
VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
ON CONFLICT (tbl, id) DO UPDATE SET
  data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
  seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM records)
WHERE excluded.updated_at > records.updated_at`;

function validChange(c: any): c is Change {
  return (
    c && TABLES.has(c.t) && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 100 &&
    Number.isFinite(c.u) && (c.d === 0 || c.d === 1) &&
    (c.d === 1 ? c.data === null || c.data === undefined : typeof c.data === 'string' && c.data.length <= MAX_DATA)
  );
}

async function sync(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const since = Number(body?.since ?? 0);
  const changes: unknown[] = Array.isArray(body?.changes) ? body.changes : [];
  if (!Number.isFinite(since) || since < 0) return json({ error: 'bad cursor' }, 400);
  if (changes.length > MAX_CHANGES) return json({ error: 'too many changes' }, 413);
  if (!changes.every(validChange)) return json({ error: 'bad change' }, 400);

  if (changes.length) {
    await env.DB.batch((changes as Change[]).map((c) => env.DB.prepare(UPSERT).bind(c.t, c.id, c.d ? null : c.data, c.d, Math.round(c.u))));
  }

  const rows = await (env.DB.prepare('SELECT tbl, id, data, deleted, updated_at, seq FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2').bind(since, PAGE) as any).all();
  const list = (rows.results ?? []) as { tbl: string; id: string; data: string | null; deleted: number; updated_at: number; seq: number }[];
  return json({
    records: list.map((r) => ({ t: r.tbl, id: r.id, data: r.data, d: r.deleted, u: r.updated_at })),
    cursor: list.length ? list[list.length - 1].seq : since,
    more: list.length === PAGE,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (!env.SYNC_KEY) return json({ error: 'SYNC_KEY is not configured on the server' }, 503);
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token || !(await keyOk(token, env.SYNC_KEY))) return json({ error: 'unauthorized' }, 401);

    if (url.pathname === '/api/sync' && req.method === 'POST') return sync(req, env);
    return json({ error: 'not found' }, 404);
  },
};
