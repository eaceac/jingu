import twilio from 'twilio';
import type { Pool } from 'pg';
import type { Config } from './config.ts';
import { PracticeService, readProgress, USER } from './service.ts';
import { localDate } from '../../packages/learning/progress.ts';

export function reminderWindow(now: string, timezone: string, time: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const hour = Number(parts.find(p => p.type === 'hour')!.value), minute = Number(parts.find(p => p.type === 'minute')!.value);
  const [h, m] = time.split(':').map(Number);
  const delta = hour * 60 + minute - (h * 60 + m);
  return delta >= 0 && delta < 10;
}
export class Runtime {
  private sending: ReturnType<typeof twilio> | undefined;
  constructor(private pool: Pool, private service: PracticeService, private cfg: Config,
    private deliver?: (text: string) => Promise<{ sid: string }>) {
    if (cfg.transport === 'twilio') this.sending = twilio(cfg.accountSid, cfg.authToken, { timeout: 15_000, autoRetry: false });
  }
  async tick(now = new Date().toISOString()) {
    const lock = await this.pool.connect();
    try {
      if (!(await lock.query('SELECT pg_try_advisory_lock(191887,3) AS locked')).rows[0].locked) return;
      // The prior leader cannot still be sending while this lock is held. Never blindly retry uncertain sends.
      await lock.query("UPDATE outbox SET status='ambiguous',last_error='Interrupted during provider send; inspect before retry' WHERE status='sending'");
      await this.service.processNext(now);
      const user = (await lock.query('SELECT * FROM users WHERE id=$1', [USER])).rows[0];
      const today = localDate(now, user.timezone);
      if (user.sms_opted_in && user.reminders_enabled && reminderWindow(now, user.timezone, user.reminder_local_time)) {
        const p = await readProgress(lock, now);
        if (p.today?.status !== 'complete') {
          await lock.query(`INSERT INTO outbox(id,user_id,operation_key,payload) VALUES($1,$2,$1,$3) ON CONFLICT(operation_key) DO NOTHING`,
            [`reminder:${today}`, USER, { kind: 'reminder', date: today, text: 'Jingu: time for your daily Korean practice. Text PRACTICE to begin. Reply STOP to unsubscribe.' }]);
        }
      }
      const item = (await lock.query("SELECT * FROM outbox WHERE status='pending' ORDER BY created_at,id LIMIT 1")).rows[0];
      if (!item) return;
      const current = (await lock.query('SELECT * FROM users WHERE id=$1', [USER])).rows[0];
      const isReminder = item.payload.kind === 'reminder';
      if (!current.sms_opted_in || (isReminder && (!current.reminders_enabled || item.payload.date !== today ||
        !reminderWindow(now, current.timezone, current.reminder_local_time) || (await readProgress(lock, now)).today?.status === 'complete'))) {
        await lock.query("UPDATE outbox SET status='cancelled' WHERE id=$1", [item.id]); return;
      }
      // Suppress stale replies after outages, rather than sending yesterday's questions today.
      if (!isReminder && new Date(now).getTime() - item.created_at.getTime() > 30 * 60_000) {
        await lock.query("UPDATE outbox SET status='cancelled',last_error='Reply expired after 30 minutes' WHERE id=$1", [item.id]); return;
      }
      const sent = (await lock.query(`SELECT count(*)::int AS count FROM outbox WHERE user_id=$1 AND status IN ('sent','ambiguous','sending')
        AND to_char(created_at AT TIME ZONE $2,'YYYY-MM-DD')=$3`, [USER, user.timezone, today])).rows[0].count;
      if (sent >= this.cfg.maxSMS) {
        await lock.query("UPDATE outbox SET status='cancelled',last_error='Daily message cap reached' WHERE id=$1", [item.id]); return;
      }
      await lock.query("UPDATE outbox SET status='sending',attempts=attempts+1 WHERE id=$1", [item.id]);
      try {
        const result = this.deliver ? await this.deliver(item.payload.text) : this.sending ? await this.sending.messages.create({ to: this.cfg.phone, from: this.cfg.from, body: item.payload.text,
          statusCallback: `${this.cfg.publicUrl}/webhooks/sms/status` }) : { sid: `console:${item.id}` };
        await lock.query("UPDATE outbox SET status='sent',provider_message_id=$2 WHERE id=$1", [item.id, result.sid]);
        if (!this.sending) console.log(`[simulator] ${item.payload.text}`);
      } catch (error) {
        const e = error as { status?: number; code?: number };
        const knownRejected = e.status !== undefined && e.status >= 400 && e.status < 500;
        await lock.query('UPDATE outbox SET status=$2,last_error=$3 WHERE id=$1',
          [item.id, knownRejected ? 'failed' : 'ambiguous', knownRejected ? `Provider rejected: ${e.code ?? e.status}` : 'Provider outcome unknown; inspect before retry']);
        if (e.code === 21610) await lock.query('UPDATE users SET sms_opted_in=false,reminders_enabled=false WHERE id=$1', [USER]);
      }
    } finally {
      await lock.query('SELECT pg_advisory_unlock(191887,3)'); lock.release();
    }
  }
}
