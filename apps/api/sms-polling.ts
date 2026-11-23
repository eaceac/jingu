import twilio from 'twilio';
import type { Pool } from 'pg';
import type { Config } from './config.ts';
import type { PracticeService } from './service.ts';

export interface PollMessage {
  sid: string; accountSid: string; from: string; to: string; body: string;
  direction: string; dateCreated: Date; status: string; errorCode: number | null;
}
export interface SMSReader {
  list(options: { from: string; to: string; dateSentAfter: Date; limit: number }): Promise<PollMessage[]>;
  fetch(sid: string): Promise<PollMessage>;
}
export class SMSPoller {
  private reader: SMSReader;
  constructor(private pool: Pool, private cfg: Config, private service: PracticeService, reader?: SMSReader) {
    const client = reader ? undefined : twilio(cfg.accountSid, cfg.authToken, { timeout: 15_000, autoRetry: false });
    this.reader = reader ?? { list: options => client!.messages.list(options), fetch: sid => client!.messages(sid).fetch() };
  }
  async poll(now = new Date()) {
    await this.pool.query(`INSERT INTO sms_poll_cursors(user_id,account_sid,sender_number,learner_number,started_at)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [this.service.userId, this.cfg.accountSid, this.cfg.from, this.cfg.phone, now]);
    const cursor = (await this.pool.query('SELECT * FROM sms_poll_cursors WHERE user_id=$1', [this.service.userId])).rows[0];
    if (cursor.account_sid !== this.cfg.accountSid || cursor.sender_number !== this.cfg.from || cursor.learner_number !== this.cfg.phone) {
      throw new Error('SMS identity changed; explicitly reset polling cursor before proceeding');
    }
    const since = Math.max(cursor.started_at.getTime(), now.getTime() - 30 * 60_000);
    // Twilio date filters use UTC calendar dates. Filter precisely after fetching.
    const messages = await this.reader.list({ from: this.cfg.phone, to: this.cfg.from,
      dateSentAfter: new Date(since - 24 * 60 * 60_000), limit: 1000 });
    for (const message of messages.sort((a, b) => a.dateCreated.getTime() - b.dateCreated.getTime() || a.sid.localeCompare(b.sid))) {
      if (message.accountSid !== this.cfg.accountSid || message.from !== this.cfg.phone || message.to !== this.cfg.from
        || message.direction !== 'inbound' || message.dateCreated.getTime() < since || message.dateCreated > now
        || !message.body?.trim() || message.body.length > 2000) continue;
      await this.service.enqueue('twilio', message.sid, message.body, message.dateCreated.toISOString());
    }
    // Poll delivery receipts as well: provider acceptance is not handset delivery.
    const outstanding = await this.pool.query(`SELECT id,provider_message_id FROM outbox WHERE user_id=$1 AND status='sent'
      AND provider_message_id LIKE 'SM%' AND created_at > $2::timestamptz - interval '1 day'
      AND (provider_status IS NULL OR provider_status NOT IN ('delivered','read')) ORDER BY created_at DESC LIMIT 10`, [this.service.userId, now]);
    for (const item of outstanding.rows) {
      const status = await this.reader.fetch(item.provider_message_id);
      if (status.accountSid !== this.cfg.accountSid || status.to !== this.cfg.phone || status.from !== this.cfg.from) continue;
      if (['failed', 'undelivered', 'canceled'].includes(status.status)) {
        await this.pool.query("UPDATE outbox SET status='failed',last_error=$2,provider_status=$3 WHERE id=$1", [item.id, `Delivery failed: ${status.errorCode ?? status.status}`, status.status]);
      } else if (['delivered', 'read'].includes(status.status)) {
        await this.pool.query('UPDATE outbox SET provider_status=$2 WHERE id=$1', [item.id, status.status]);
      }
    }
  }
}
