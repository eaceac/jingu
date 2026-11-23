import twilio from 'twilio';
import { config } from '../apps/api/config.ts';
const cfg = config();
if (cfg.transport !== 'twilio') throw new Error('Configure Twilio first');
const client = twilio(cfg.accountSid, cfg.authToken, { timeout: 15_000, autoRetry: false });
try {
  const account = await client.api.accounts(cfg.accountSid).fetch();
  console.log(`Twilio account: ${account.status}; type: ${account.type}`);
  if (account.type === 'Trial' || account.status !== 'active') { console.log('BLOCKER: Paid active account required for this flow.'); process.exitCode = 1; }
  const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
  if (!numbers.length) { console.log('BLOCKER: No owned Twilio phone number. Finish number purchase and sender registration.'); process.exitCode = 1; }
  for (const number of numbers) console.log(JSON.stringify({ number: number.phoneNumber, sms: number.capabilities.sms,
    configuredSender: number.phoneNumber === cfg.from, inboundWebhookConfigured: Boolean(number.smsUrl), messagingService: Boolean(number.smsApplicationSid) }));
  if (!numbers.some(n => n.phoneNumber === cfg.from && n.capabilities.sms)) { console.log('BLOCKER: TWILIO_FROM_NUMBER is not an owned SMS-capable number.'); process.exitCode = 1; }
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(cfg.model)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) process.exitCode = 1;
  console.log(`OpenAI model access: ${response.ok ? 'OK' : `HTTP ${response.status}`}; model: ${cfg.model}`);
  console.log('This check does not send SMS, call AI inference, or prove carrier registration approval.');
} catch (error) {
  const e = error as { code?: number; status?: number };
  console.error(`Provider check failed (status=${e.status ?? 'unknown'}, code=${e.code ?? 'unknown'}). No credentials printed.`);
  process.exitCode = 1;
}
