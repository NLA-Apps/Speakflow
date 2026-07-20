import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type { ClientSecretRequest, TranscriptionSecretRequest } from '@speakingflow/shared';
import type { ServerConfig } from './config.js';
import {
  assessEnglishWithOpenAI,
  createOpenAIClientSecret,
  createOpenAITranscriptionSecret,
  createSpeechWithOpenAI,
  safetyIdentifier,
  searchCurrentInformationWithOpenAI,
  suggestRepliesWithOpenAI,
  translateWithOpenAI,
} from './openai.js';

const requestSchema = z.object({
  localUserId: z.string().uuid(),
  languageMode: z.enum(['english_hebrew_help', 'mixed', 'english_only', 'beginner']),
  turnMode: z.enum(['automatic', 'push_to_talk']),
  responseLength: z.enum(['short', 'normal']),
  speakingSpeed: z.number().min(0.75).max(1.25),
  voice: z.enum(['female', 'male']).optional(),
  recognitionLanguage: z.enum(['auto', 'he', 'en']).optional(),
});
const transcriptionRequestSchema = z.object({
  localUserId: z.string().uuid(),
  recognitionLanguage: z.enum(['he', 'en']),
});
const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  voice: z.enum(['female', 'male']),
  speakingSpeed: z.number().min(0.75).max(1.25),
});

const translationSchema = z.object({
  text: z.string().trim().min(1).max(500),
  kind: z.enum(['word', 'sentence']),
});

const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(2_000),
});
const suggestionsSchema = z.object({
  messages: z.array(conversationMessageSchema).max(20),
});
const liveSearchSchema = z.object({ query: z.string().trim().min(2).max(500) });
const assessmentSchema = z.object({
  samples: z.array(z.string().trim().min(1).max(2_000)).min(1).max(30),
});

export type SecretCreator = typeof createOpenAIClientSecret;
export type TranscriptionSecretCreator = typeof createOpenAITranscriptionSecret;
export type SpeechCreator = typeof createSpeechWithOpenAI;

export async function buildApp(
  config: ServerConfig,
  secretCreator: SecretCreator = createOpenAIClientSecret,
  transcriptionSecretCreator: TranscriptionSecretCreator = createOpenAITranscriptionSecret,
  speechCreator: SpeechCreator = createSpeechWithOpenAI,
) {
  const speechAudio = new Map<string, { audio: Uint8Array; contentType: string; expiresAt: number }>();
  const speechCache = new Map<string, { audio: Uint8Array; contentType: string; expiresAt: number }>();
  const app = Fastify({
    logger:
      config.NODE_ENV !== 'test'
        ? { redact: ['req.headers.authorization', '*.clientSecret', '*.value'] }
        : false,
    requestTimeout: 30_000,
    bodyLimit: 8_192,
    genReqId: () => crypto.randomUUID(),
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.allowedOrigins.includes(origin)),
    methods: ['GET', 'POST'],
  });
  await app.register(rateLimit, { max: 20, timeWindow: '1 minute' });

  app.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }));
  app.post(
    '/api/speech',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = speechRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'invalid_request', message: 'Invalid speech text' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        const now = Date.now();
        for (const [id, entry] of speechAudio) if (entry.expiresAt <= now) speechAudio.delete(id);
        for (const [key, entry] of speechCache) if (entry.expiresAt <= now) speechCache.delete(key);
        const cacheKey = JSON.stringify(parsed.data);
        let generated = speechCache.get(cacheKey);
        if (!generated) {
          const fresh = await speechCreator(config, parsed.data, controller.signal);
          generated = { ...fresh, expiresAt: now + 10 * 60_000 };
          if (speechCache.size >= 100) speechCache.delete(speechCache.keys().next().value ?? '');
          speechCache.set(cacheKey, generated);
        }
        const id = crypto.randomUUID();
        speechAudio.set(id, { ...generated, expiresAt: now + 5 * 60_000 });
        return { audioPath: `/api/speech/${id}` };
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'statusCode' in error
            ? Number(error.statusCode)
            : 502;
        request.log.warn({ status }, 'Speech request failed');
        return reply
          .code(status >= 400 && status < 600 ? status : 502)
          .send({ error: 'speech_unavailable', message: 'Unable to create speech' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  app.get('/api/speech/:id', async (request, reply) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'not_found' });
    const entry = speechAudio.get(parsed.data.id);
    if (!entry || entry.expiresAt <= Date.now()) {
      speechAudio.delete(parsed.data.id);
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply
      .header('Content-Type', entry.contentType)
      // The Expo web app and API run on different local origins during
      // development. Helmet defaults this header to same-origin, which makes
      // Chrome reject otherwise valid audio with NotSameOrigin.
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Cache-Control', 'private, max-age=300')
      .send(Buffer.from(entry.audio));
  });
  app.post(
    '/api/realtime/client-secret',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: 'invalid_request', message: 'Request validation failed' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        const input = parsed.data as ClientSecretRequest;
        request.log.info(
          { safetyId: safetyIdentifier(input.localUserId) },
          'Creating Realtime client secret',
        );
        const result = await secretCreator(config, input, controller.signal);
        return {
          clientSecret: result.value,
          expiresAt: result.expires_at,
          model: result.session?.model ?? config.OPENAI_REALTIME_MODEL,
        };
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'statusCode' in error
            ? Number(error.statusCode)
            : 502;
        request.log.warn({ status }, 'Realtime client-secret request failed');
        return reply
          .code(status >= 400 && status < 600 ? status : 502)
          .send({ error: 'realtime_unavailable', message: 'Unable to start a Realtime session' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  app.post(
    '/api/realtime/transcription-client-secret',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = transcriptionRequestSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: 'invalid_request', message: 'Request validation failed' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        const input = parsed.data as TranscriptionSecretRequest;
        const result = await transcriptionSecretCreator(config, input, controller.signal);
        return {
          clientSecret: result.value,
          expiresAt: result.expires_at,
          model: result.session?.model ?? 'gpt-realtime-whisper',
        };
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'statusCode' in error
            ? Number(error.statusCode)
            : 502;
        request.log.warn({ status }, 'Transcription client-secret request failed');
        return reply
          .code(status >= 400 && status < 600 ? status : 502)
          .send({ error: 'transcription_unavailable', message: 'Unable to start transcription' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  app.post(
    '/api/translate',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = translationSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'invalid_request', message: 'Invalid text' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        return await translateWithOpenAI(config, parsed.data, controller.signal);
      } catch (error) {
        request.log.warn({ error }, 'Translation request failed');
        return reply
          .code(502)
          .send({ error: 'translation_unavailable', message: 'Unable to translate text' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  app.post(
    '/api/suggestions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = suggestionsSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'invalid_request', message: 'Invalid transcript' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        return await suggestRepliesWithOpenAI(config, parsed.data, controller.signal);
      } catch {
        return reply
          .code(502)
          .send({ error: 'suggestions_unavailable', message: 'Unable to create suggestions' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  app.post(
    '/api/live-search',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = liveSearchSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'invalid_request', message: 'Invalid query' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 28_000);
      try {
        return await searchCurrentInformationWithOpenAI(config, parsed.data, controller.signal);
      } catch {
        return reply
          .code(502)
          .send({ error: 'search_unavailable', message: 'Unable to search current information' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  app.post(
    '/api/assess',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = assessmentSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'invalid_request', message: 'Invalid samples' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        return await assessEnglishWithOpenAI(config, parsed.data, controller.signal);
      } catch {
        return reply
          .code(502)
          .send({ error: 'assessment_unavailable', message: 'Unable to assess English' });
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  return app;
}
