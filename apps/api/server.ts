import { readFile } from 'node:fs/promises';
import { communityGarden } from './community.ts';
import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual, randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { config } from './config.ts';
import { migrate } from '../../packages/db/src/migrate.ts';
import { FakeTutor, OpenAITutor } from '../../packages/ai/index.ts';
import { PracticeService, readProgress, seed } from './service.ts';
import { Runtime } from './runtime.ts';

export async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length; if (size > 16_384) throw new Error('Request too large'); chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
const cfg = config();
const pool = new Pool({ connectionString: cfg.databaseUrl, max: 10, connectionTimeoutMillis: 5000 });
await migrate(pool);
const roster = [{ id: 'personal-learner', nickname: cfg.gardenNickname, timezone: cfg.timezone }];
for (const learner of roster) await seed(pool, learner.timezone ?? cfg.timezone, learner.id, learner.nickname);
const tutor = cfg.aiMode === 'openai' ? new OpenAITutor(cfg.apiKey, cfg.model) : new FakeTutor();
const service = new PracticeService(pool, tutor, cfg, roster[0].id);
const runtime = new Runtime(pool, service, cfg);
const assets = new Map<string, { type: string; body: Buffer }>();
for (const [url, file, type] of [['/', 'index.html', 'text/html'], ['/practice', 'practice.html', 'text/html'], ['/practice.js', 'practice.js', 'text/javascript'], ['/practice.css', 'practice.css', 'text/css'], ['/garden.css', 'garden.css', 'text/css'], ['/garden.js', 'garden.js', 'text/javascript'], ['/landscape.svg', 'landscape.svg', 'image/svg+xml'], ['/garden-oil-v1.png', 'garden-oil-v1.png', 'image/png']]) {
  assets.set(url, { type, body: await readFile(new URL(`../dashboard/${file}`, import.meta.url)) });
}
let loginFailures = 0, loginWindow = Date.now();
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const path = req.url ?? '/';
  const send = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    if (cfg.transport === 'web') {
      if (Date.now() - loginWindow > 60_000) { loginFailures = 0; loginWindow = Date.now(); }
      const authorization = req.headers.authorization ?? '';
      const credentials = authorization.startsWith('Basic ') ? Buffer.from(authorization.slice(6), 'base64').toString() : '';
      const password = credentials.startsWith('jingu:') ? credentials.slice(6) : '';
      const valid = timingSafeEqual(createHash('sha256').update(password).digest(), Buffer.from(process.env.WEB_PASSWORD_HASH!, 'hex'));
      if (!valid) {
        if (authorization && ++loginFailures > 30) return send(429, { error: 'Too many login attempts. Try again in a minute.' });
        res.setHeader('WWW-Authenticate', 'Basic realm="Jingu", charset="UTF-8"');
        return send(401, { error: 'Sign in to your private garden.' });
      }
      if (path === '/api/chat' && req.method === 'GET') {
        const result = await pool.query(`SELECT * FROM (
          SELECT id, 'you' AS role, body AS text, received_at AS at, processing_status AS status FROM messages WHERE user_id=$1 AND provider='web'
          UNION ALL SELECT id, 'jingu' AS role, payload->>'text' AS text, created_at AS at, status FROM outbox WHERE user_id=$1 AND status='sent'
        ) history ORDER BY at DESC,id DESC LIMIT 100`, [service.userId]);
        return send(200, { messages: result.rows.reverse() });
      }
      if (path === '/api/chat' && req.method === 'POST') {
        if (req.headers['x-jingu-request'] !== 'practice' || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: 'Invalid request' });
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return send(403, { error: 'Invalid origin' });
        const input = JSON.parse(await body(req));
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000 || !/^[a-f0-9-]{36}$/.test(input.id ?? '')) return send(400, { error: 'Provide a message of 1–2000 characters.' });
        const pending = await pool.query("SELECT 1 FROM messages WHERE user_id=$1 AND processing_status='pending' LIMIT 1", [service.userId]);
        if (pending.rowCount) return send(409, { error: 'Wait for Jingu to finish your last message.' });
        await service.enqueue('web', input.id, input.text.trim(), new Date().toISOString());
        return send(202, { queued: true });
      }
    }
    if (req.method === 'GET' && assets.has(path)) {
      const asset = assets.get(path)!; res.writeHead(200, { 'Content-Type': `${asset.type}; charset=utf-8` }); return res.end(asset.body);
    }
    if (path === '/api/garden' && req.method === 'GET') return send(200, { ...await communityGarden(pool, roster.map(l => l.id)), webPractice: cfg.transport === 'web', practiceCommand: 'PRACTICE' });
    if (path === '/privacy' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Jingu stores practice messages, vocabulary progress and garden state in your local database. Practice answers are sent to OpenAI for grading. Your API key stays on the server. Access requires your website password.'); }
    if (path === '/health' && req.method === 'GET') { await pool.query('SELECT 1'); return send(200, { ok: true }); }
    const auth = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${cfg.token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'Unauthorized' });
    if (path === '/api/progress' && req.method === 'GET') return send(200, await readProgress(pool, new Date().toISOString(), roster[0].id));
    if (path === '/api/operations' && req.method === 'GET') {
      const pending = await pool.query('SELECT processing_status,count(*)::int FROM messages GROUP BY processing_status');
      const delivery = await pool.query('SELECT status,count(*)::int FROM outbox GROUP BY status');
      return send(200, { messages: pending.rows, delivery: delivery.rows });
    }
    if (path === '/api/simulate' && req.method === 'POST' && cfg.transport === 'console') {
      const input = JSON.parse(await body(req));
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000) return send(400, { error: 'Provide text (1–2000 characters)' });
      await service.enqueue('simulator', randomUUID(), input.text, new Date().toISOString());
      return send(202, { queued: true });
    }
    return send(404, { error: 'Not found' });
  } catch { return send(500, { error: 'Request failed; no details exposed' }); }
});
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.listen(cfg.port, cfg.bindHost, () => console.log(`Jingu ready on port ${cfg.port}; transport=${cfg.transport}; AI=${cfg.aiMode}`));
let stopping = false;
async function loop() {
  while (!stopping) {
    try {
      await runtime.tick();
    } catch { console.error('Worker tick failed; pending work remains durable.'); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
const running = loop();
async function shutdown() { stopping = true; server.close(); await running; await pool.end(); }
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
