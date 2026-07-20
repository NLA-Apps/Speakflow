import { z } from 'zod';

const schema = z.object({
  OPENAI_API_KEY: z.string().min(20),
  OPENAI_REALTIME_MODEL: z.string().min(1).default('gpt-realtime'),
  OPENAI_TEXT_MODEL: z.string().min(1).default('gpt-5.4-mini'),
  OPENAI_SEARCH_MODEL: z.string().min(1).default('gpt-5.4-mini'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ALLOWED_ORIGINS: z.string().default('http://localhost:8081'),
  TOKEN_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = schema.parse(env);
  return { ...parsed, allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((v) => v.trim()) };
}
