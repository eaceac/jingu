import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import twilio from 'twilio';
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
await seed(pool, cfg.timezone);
const tutor = cfg.aiMode === 'openai' ? new OpenAITutor(cfg.apiKey, cfg.model) : new FakeTutor();
const service = new PracticeService(pool, tutor, cfg);
const runtime = new Runtime(pool, service, cfg);
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const path = req.url ?? '/';
  const send = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    if (path === '/health' && req.method === 'GET') { await pool.query('SELECT 1'); return send(200, { ok: true }); }
    if (path.startsWith('/webhooks/sms/') && req.method === 'POST' && cfg.transport === 'twilio') {
      if (path !== '/webhooks/sms/inbound' && path !== '/webhooks/sms/status') return send(404, { error: 'Not found' });
      if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return send(415, { error: 'Expected form data' });
      const params = Object.fromEntries(new URLSearchParams(await body(req)));
      const signature = req.headers['x-twilio-signature'];
      if (typeof signature !== 'string' || !twilio.validateRequest(cfg.authToken, signature, `${cfg.publicUrl}${path}`, params) || params.AccountSid !== cfg.accountSid) return send(403, { error: 'Invalid signature' });
      if (path.endsWith('/status')) {
        if (['failed', 'undelivered'].includes(params.MessageStatus)) await pool.query("UPDATE outbox SET status='failed',last_error=$2 WHERE provider_message_id=$1", [params.MessageSid, `Delivery failed: ${params.ErrorCode ?? params.MessageStatus}`]);
      } else if (params.From === cfg.phone && params.To === cfg.from && params.MessageSid && params.Body?.trim() && params.Body.length <= 2000) {
        await service.enqueue('twilio', params.MessageSid, params.Body, new Date().toISOString(), params.OptOutType);
      }
      res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end('<Response/>');
    }
    const auth = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${cfg.token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'Unauthorized' });
    if (path === '/api/progress' && req.method === 'GET') return send(200, await readProgress(pool, new Date().toISOString()));
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
server.listen(cfg.port, '0.0.0.0', () => console.log(`Jingu ready on port ${cfg.port}; transport=${cfg.transport}; AI=${cfg.aiMode}`));
let stopping = false;
async function loop() {
  while (!stopping) {
    try { await runtime.tick(); } catch { console.error('Worker tick failed; pending work remains durable.'); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
const running = loop();
async function shutdown() { stopping = true; server.close(); await running; await pool.end(); }
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
