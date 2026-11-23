export function config(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string) => { const value = env[key]; if (!value) throw new Error(`Missing ${key}`); return value; };
  const transport = env.TRANSPORT ?? 'console';
  const aiMode = env.AI_MODE ?? 'fake';
  if (!['console', 'web'].includes(transport) || !['fake', 'openai'].includes(aiMode)) throw new Error('Invalid provider mode');
  if (transport === 'web' && !/^[a-f0-9]{64}$/.test(env.WEB_PASSWORD_HASH ?? '')) throw new Error('Missing WEB_PASSWORD_HASH');
  const timezone = env.JINGU_TIMEZONE ?? 'UTC';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  const token = required('ADMIN_TOKEN');
  if (token.length < 32 || token.startsWith('replace-')) throw new Error('ADMIN_TOKEN must be at least 32 random characters');
  const positive = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback); if (!Number.isInteger(n) || n < 1 || n > (key === 'PORT' ? 65535 : 10000)) throw new Error(`Invalid ${key}`); return n;
  };
  const bindHost = env.BIND_HOST ?? '127.0.0.1';
  if (bindHost !== '127.0.0.1') throw new Error('Local website must bind to loopback');
  return { gardenNickname: env.GARDEN_NICKNAME ?? 'Gardener', bindHost,
    maxGlobalAI: positive('MAX_GLOBAL_AI_CALLS_PER_DAY', 300), databaseUrl: required('DATABASE_URL'), transport, aiMode, timezone, token,
    apiKey: aiMode === 'openai' ? required('OPENAI_API_KEY') : '',
    model: aiMode === 'openai' ? required('OPENAI_MODEL') : '',
    port: positive('PORT', 3000), maxAI: positive('MAX_AI_CALLS_PER_DAY', 100), maxReplies: positive('MAX_REPLIES_PER_DAY', 60) };
}
export type Config = ReturnType<typeof config>;
