import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { createServer } from 'node:net';

test('Private web practice requires password, rejects cross-origin writes, and processes practice',
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
        ADMIN_TOKEN: token, TRANSPORT: 'web', AI_MODE: 'fake', WEB_PASSWORD_HASH: createHash('sha256').update('test-password').digest('hex') }, stdio: 'pipe',
    });
    let errors = ''; child.stderr.on('data', data => { errors += data.toString(); });
    child.stdout.resume();
    const login = { Authorization: 'Basic ' + Buffer.from('jingu:test-password').toString('base64') };
    const base = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let n = 0; n < 50; n++) {
        try { ready = (await fetch(`${base}/health`, {headers:login})).ok; } catch { /* wait for startup */ }
        if (ready) break;
        if (child.exitCode !== null) throw new Error(`Server exited: ${errors}`);
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(ready, errors);
      assert.equal((await fetch(`${base}/api/progress`)).status, 401);
      assert.equal((await fetch(base)).status, 401);
      assert.equal((await fetch(`${base}/api/chat`)).status, 401);
      const page = await fetch(`${base}/practice`, {headers:login}); assert.equal(page.status, 200);
      assert.match(await page.text(), /Korean practice/);
      assert.equal((await fetch(`${base}/api/chat`, {method:'POST',headers:login,body:'{}'})).status,403);
      const headers = {...login, 'Content-Type':'application/json', 'X-Jingu-Request':'practice'};
      assert.equal((await fetch(`${base}/api/chat`, {method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
      for (const [i,text] of ['START','PRACTICE'].entries()) {
        assert.equal((await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({text,id:`00000000-0000-4000-8000-00000000000${i}`})})).status,202);
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
        const chat=await (await fetch(`${base}/api/chat`,{headers:login})).json(); assert.ok(chat.messages.some((m:any)=>m.role==='you'&&m.text==='PRACTICE'));
        assert.equal((await fetch(`${base}/api/operations`, { headers:login })).status, 401);
      } finally { await db.end(); }
    } finally {
      child.kill('SIGTERM');
      if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
      await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    }
  });
