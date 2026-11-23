export interface BlueBubblesLearner { id: string; chatGuid: string; sender: string; selfChat?: boolean; timezone?: string }
export function config(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string) => { const value = env[key]; if (!value) throw new Error(`Missing ${key}`); return value; };
  const transport = env.TRANSPORT ?? 'console';
  const aiMode = env.AI_MODE ?? 'fake';
  if (!['console', 'twilio', 'bluebubbles'].includes(transport) || !['fake', 'openai'].includes(aiMode)) throw new Error('Invalid provider mode');
  if (transport !== 'console' && aiMode !== 'openai') throw new Error('Live messaging requires real AI grading');
  const timezone = env.JINGU_TIMEZONE ?? 'America/Los_Angeles';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  const token = required('ADMIN_TOKEN');
  if (token.length < 32 || token.startsWith('replace-')) throw new Error('ADMIN_TOKEN must be at least 32 random characters');
  const positive = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > (key === 'PORT' ? 65535 : 10000)) throw new Error(`Invalid ${key}`); return n;
  };
  const smsReceiveMode = env.SMS_RECEIVE_MODE ?? 'webhook';
  if (!['webhook', 'poll'].includes(smsReceiveMode)) throw new Error('Invalid SMS_RECEIVE_MODE');
  const bindHost = env.BIND_HOST ?? (transport === 'bluebubbles' || smsReceiveMode === 'poll' ? '127.0.0.1' : '0.0.0.0');
  if (!['127.0.0.1', '0.0.0.0'].includes(bindHost)) throw new Error('Invalid BIND_HOST');
  const publicUrl = env.PUBLIC_URL?.replace(/\/$/, '') ?? '';
  const phone = env.LEARNER_PHONE ?? '';
  const from = env.TWILIO_FROM_NUMBER ?? '';
  if (transport === 'twilio' && ((smsReceiveMode === 'webhook' && !/^https:\/\/[^/?#]+$/.test(publicUrl)) || !/^\+[1-9]\d{7,14}$/.test(phone) || !/^\+[1-9]\d{7,14}$/.test(from))) {
    throw new Error('Live SMS requires PUBLIC_URL HTTPS origin and E.164 learner/sender numbers');
  }
  let bluebubbles: { url: string; password: string; learners: BlueBubblesLearner[] } | undefined;
  if (transport === 'bluebubbles') {
    const url = new URL(env.BLUEBUBBLES_URL ?? 'http://127.0.0.1:1234');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) throw new Error('BlueBubbles must use a loopback origin');
    const learners = JSON.parse(required('BLUEBUBBLES_LEARNERS')) as BlueBubblesLearner[];
    if (!Array.isArray(learners) || !learners.length || learners.length > 20) throw new Error('Allowlist requires 1–20 learners');
    const ids = new Set(), chats = new Set();
    for (const learner of learners) {
      if (!learner || !/^[a-zA-Z0-9_-]{1,64}$/.test(learner.id) || typeof learner.sender !== 'string' || !learner.sender.trim()
        || learner.chatGuid !== `iMessage;-;${learner.sender}` || ids.has(learner.id) || chats.has(learner.chatGuid)
        || (learner.selfChat !== undefined && typeof learner.selfChat !== 'boolean')) throw new Error('Invalid or duplicate learner; only direct iMessage chats are allowed');
      new Intl.DateTimeFormat('en', { timeZone: learner.timezone ?? timezone });
      ids.add(learner.id); chats.add(learner.chatGuid);
    }
    bluebubbles = { url: url.origin, password: required('BLUEBUBBLES_PASSWORD'), learners };
  }
  return { smsReceiveMode, bindHost, bluebubbles, maxGlobalAI: positive('MAX_GLOBAL_AI_CALLS_PER_DAY', 300), databaseUrl: required('DATABASE_URL'), transport, aiMode, timezone, token, publicUrl, phone, from,
    accountSid: transport === 'twilio' ? required('TWILIO_ACCOUNT_SID') : '',
    authToken: transport === 'twilio' ? required('TWILIO_AUTH_TOKEN') : '',
    apiKey: aiMode === 'openai' ? required('OPENAI_API_KEY') : '',
    model: aiMode === 'openai' ? required('OPENAI_MODEL') : '',
    port: positive('PORT', 3000), maxAI: positive('MAX_AI_CALLS_PER_DAY', 100), maxSMS: positive('MAX_SMS_PER_DAY', 60),
  };
}
export type Config = Omit<ReturnType<typeof config>, 'bluebubbles' | 'maxGlobalAI' | 'smsReceiveMode' | 'bindHost'> & { bluebubbles?: ReturnType<typeof config>['bluebubbles']; maxGlobalAI?: number; smsReceiveMode?: string; bindHost?: string };
