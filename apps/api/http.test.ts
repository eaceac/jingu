import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { createServer } from 'node:net';

test('HTTP service starts, protects progress, persists a queued practice turn and rejects fake webhook access',
  { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL for HTTP smoke test', timeout: 20_000 }, async () => {
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = `jingu_http_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const finder = createServer();
    await new Promise<void>(resolve => finder.listen(0, '127.0.0.1', resolve));
    const port = (finder.address() as { port: number }).port;
    await new Promise<void>(resolve => finder.close(() => resolve()));
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const token = 'test-only-admin-token'.repeat(3);
    const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/server.ts'], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port),
        ADMIN_TOKEN: token, TRANSPORT: 'console', AI_MODE: 'fake' }, stdio: 'pipe',
    });
    let errors = ''; child.stderr.on('data', data => { errors += data.toString(); });
    child.stdout.resume();
    const base = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let n = 0; n < 50; n++) {
        try { ready = (await fetch(`${base}/health`)).ok; } catch { /* wait for startup */ }
        if (ready) break;
        if (child.exitCode !== null) throw new Error(`Server exited: ${errors}`);
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(ready, errors);
      assert.equal((await fetch(`${base}/api/progress`)).status, 401);
      assert.equal((await fetch(`${base}/webhooks/sms/inbound`, { method: 'POST', body: 'Body=practice' })).status, 401);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      for (const text of ['START', 'PRACTICE']) {
        assert.equal((await fetch(`${base}/api/simulate`, { method: 'POST', headers, body: JSON.stringify({ text }) })).status, 202);
      }
      const db = new Pool({ connectionString: url.toString() });
      try {
        let count = 0;
        for (let n = 0; n < 40; n++) {
          count = (await db.query('SELECT count(*)::int AS n FROM review_opportunities')).rows[0].n;
          if (count) break;
          await new Promise(r => setTimeout(r, 100));
        }
        assert.equal(count, 1);
        assert.equal((await fetch(`${base}/api/progress`, { headers })).status, 200);
      } finally { await db.end(); }
    } finally {
      child.kill('SIGTERM');
      if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
      await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    }
  });
