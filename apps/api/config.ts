export function config(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string) => { const value = env[key]; if (!value) throw new Error(`Missing ${key}`); return value; };
  const transport = env.TRANSPORT ?? 'console';
  const aiMode = env.AI_MODE ?? 'fake';
  if (!['console', 'twilio'].includes(transport) || !['fake', 'openai'].includes(aiMode)) throw new Error('Invalid provider mode');
  if (transport === 'twilio' && aiMode !== 'openai') throw new Error('Live SMS requires real AI grading');
  const timezone = env.JINGU_TIMEZONE ?? 'America/Los_Angeles';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  const token = required('ADMIN_TOKEN');
  if (token.length < 32 || token.startsWith('replace-')) throw new Error('ADMIN_TOKEN must be at least 32 random characters');
  const positive = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > (key === 'PORT' ? 65535 : 10000)) throw new Error(`Invalid ${key}`); return n;
  };
  const publicUrl = env.PUBLIC_URL?.replace(/\/$/, '') ?? '';
  const phone = env.LEARNER_PHONE ?? '';
  const from = env.TWILIO_FROM_NUMBER ?? '';
  if (transport === 'twilio' && (!/^https:\/\/[^/?#]+$/.test(publicUrl) || !/^\+[1-9]\d{7,14}$/.test(phone) || !/^\+[1-9]\d{7,14}$/.test(from))) {
    throw new Error('Live SMS requires PUBLIC_URL HTTPS origin and E.164 learner/sender numbers');
  }
  return { databaseUrl: required('DATABASE_URL'), transport, aiMode, timezone, token, publicUrl, phone, from,
    accountSid: transport === 'twilio' ? required('TWILIO_ACCOUNT_SID') : '',
    authToken: transport === 'twilio' ? required('TWILIO_AUTH_TOKEN') : '',
    apiKey: aiMode === 'openai' ? required('OPENAI_API_KEY') : '',
    model: aiMode === 'openai' ? required('OPENAI_MODEL') : '',
    port: positive('PORT', 3000), maxAI: positive('MAX_AI_CALLS_PER_DAY', 100), maxSMS: positive('MAX_SMS_PER_DAY', 60),
  };
}
export type Config = ReturnType<typeof config>;
