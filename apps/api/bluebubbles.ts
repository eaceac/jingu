import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { BlueBubblesLearner } from './config.ts';
import type { PracticeService } from './service.ts';

export interface BBMessage {
  guid: string; text: string | null; dateCreated: number; isFromMe: boolean;
  handle?: { address: string }; associatedMessageGuid?: string | null; itemType?: number;
}
// Prefix is mandatory, even during sessions: personal conversations never reach the tutor.
export function practiceText(message: BBMessage, learner: BlueBubblesLearner): string | null {
  if (typeof message.guid !== 'string' || !Number.isFinite(message.dateCreated) || message.associatedMessageGuid || (message.itemType ?? 0) !== 0) return null;
  if (message.isFromMe ? !learner.selfChat : message.handle?.address?.toLowerCase() !== learner.sender.toLowerCase()) return null;
  if (typeof message.text !== 'string' || message.text.length > 2000) return null;
  const match = /^jingu\s+(.+)$/is.exec(message.text.trim());
  return match?.[1].trim() || null;
}
export class BlueBubbles {
  constructor(private url: string, private password: string, private request: typeof fetch = fetch) {}
  private async api(path: string, query: Record<string, string> = {}, body?: unknown) {
    const url = new URL(`/api/v1${path}`, this.url);
    url.search = new URLSearchParams({ ...query, password: this.password }).toString();
    const response = await this.request(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw Object.assign(new Error('BlueBubbles request failed'), { status: response.status });
    const result = await response.json() as { status?: number; data: unknown };
    if (result.status && result.status !== 200) throw new Error('BlueBubbles response failed');
    return result.data;
  }
  async messages(chatGuid: string, after: number, before: number, offset: number) {
    const data = await this.api(`/chat/${encodeURIComponent(chatGuid)}/message`, {
      after: String(after), before: String(before), sort: 'ASC', limit: '100', offset: String(offset), with: 'message.attributedBody',
    });
    if (!Array.isArray(data)) throw new Error('Invalid BlueBubbles messages');
    return data as BBMessage[];
  }
  async send(chatGuid: string, text: string) {
    const data = await this.api('/message/text', {}, { chatGuid, tempGuid: randomUUID(), method: 'apple-script',
      message: `🌱 ${text}\n\nReply with “jingu ” before your answer or command.` }) as { guid?: string };
    if (!data?.guid) throw new Error('Unknown BlueBubbles delivery result');
    return { sid: data.guid };
  }
}
export async function pollBlueBubbles(pool: Pool, api: BlueBubbles, learner: BlueBubblesLearner, service: PracticeService, now = Date.now()) {
  // Fresh installs start now, never import old personal history. Persist checkpoint across restarts.
  await pool.query('INSERT INTO bluebubbles_cursors(user_id,chat_guid,after_ms) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [learner.id, learner.chatGuid, now]);
  const cursor = (await pool.query('SELECT * FROM bluebubbles_cursors WHERE user_id=$1', [learner.id])).rows[0];
  if (cursor.chat_guid !== learner.chatGuid) throw new Error('Chat identity changed; explicit cursor reset required');
  const after = Math.max(Number(cursor.after_ms) - 1000, now - 30 * 60_000);
  for (let offset = 0; offset < 1000; offset += 100) {
    const messages = await api.messages(learner.chatGuid, after, now, offset);
    for (const message of messages) {
      if (message.dateCreated < Number(cursor.after_ms) - 1000 || message.dateCreated > now) continue;
      const text = practiceText(message, learner);
      if (text) await service.enqueue('bluebubbles', `${learner.id}:${message.guid}`, text, new Date(message.dateCreated).toISOString());
    }
    if (messages.length < 100) {
      await pool.query('UPDATE bluebubbles_cursors SET after_ms=$2 WHERE user_id=$1', [learner.id, now]);
      return;
    }
  }
  // Do not advance if pagination was incomplete. Dedupe makes a retry safe.
}
