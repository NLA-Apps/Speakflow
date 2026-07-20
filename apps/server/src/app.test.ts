import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig({
  OPENAI_API_KEY: 'test-openai-key-placeholder-000000',
  NODE_ENV: 'test',
});
const body = {
  localUserId: '9d1b4fd1-6934-4cc7-ad3c-a22b0bc6174a',
  languageMode: 'english_hebrew_help',
  turnMode: 'automatic',
  responseLength: 'short',
  speakingSpeed: 1,
};

describe('server routes', () => {
  it('returns health', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
    await app.close();
  });
  it('returns only safe token metadata', async () => {
    const creator = vi.fn().mockResolvedValue({
      value: 'temporary',
      expires_at: 123,
      session: { model: 'gpt-realtime' },
    });
    const app = await buildApp(config, creator);
    const response = await app.inject({
      method: 'POST',
      url: '/api/realtime/client-secret',
      payload: body,
    });
    expect(response.json()).toEqual({
      clientSecret: 'temporary',
      expiresAt: 123,
      model: 'gpt-realtime',
    });
    await app.close();
  });
  it('creates a safe streaming-transcription client secret', async () => {
    const voiceCreator = vi.fn();
    const transcriptionCreator = vi.fn().mockResolvedValue({
      value: 'temporary-transcription-token',
      expires_at: 456,
      session: { model: 'gpt-realtime-whisper' },
    });
    const app = await buildApp(config, voiceCreator, transcriptionCreator);
    const response = await app.inject({
      method: 'POST',
      url: '/api/realtime/transcription-client-secret',
      payload: {
        localUserId: '9d1b4fd1-6934-4cc7-ad3c-a22b0bc6174a',
        recognitionLanguage: 'en',
      },
    });
    expect(response.json()).toEqual({
      clientSecret: 'temporary-transcription-token',
      expiresAt: 456,
      model: 'gpt-realtime-whisper',
    });
    expect(voiceCreator).not.toHaveBeenCalled();
    expect(transcriptionCreator).toHaveBeenCalledOnce();
    await app.close();
  });
  it('rejects malformed requests without calling OpenAI', async () => {
    const creator = vi.fn();
    const app = await buildApp(config, creator);
    const response = await app.inject({
      method: 'POST',
      url: '/api/realtime/client-secret',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(creator).not.toHaveBeenCalled();
    await app.close();
  });
  it('sanitizes upstream OpenAI failures', async () => {
    const creator = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('private upstream detail'), { statusCode: 429 }));
    const app = await buildApp(config, creator);
    const response = await app.inject({
      method: 'POST',
      url: '/api/realtime/client-secret',
      payload: body,
    });
    expect(response.statusCode).toBe(429);
    expect(response.body).not.toContain('private upstream detail');
    expect(response.json().error).toBe('realtime_unavailable');
    await app.close();
  });
  it('rejects invalid translation requests before contacting OpenAI', async () => {
    const app = await buildApp(config);
    const response = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { text: '', kind: 'word' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_request');
    await app.close();
  });
  it('creates private speech audio and serves it by temporary id', async () => {
    const voiceCreator = vi.fn();
    const transcriptionCreator = vi.fn();
    const speechCreator = vi.fn().mockResolvedValue({
      audio: new Uint8Array([73, 68, 51]),
      contentType: 'audio/mpeg',
    });
    const app = await buildApp(config, voiceCreator, transcriptionCreator, speechCreator);
    const created = await app.inject({
      method: 'POST',
      url: '/api/speech',
      payload: { text: 'שלום, מה שלומך?', voice: 'female', speakingSpeed: 1 },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().audioPath).toMatch(/^\/api\/speech\/[0-9a-f-]+$/);
    const audio = await app.inject({ method: 'GET', url: created.json().audioPath });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/mpeg');
    expect(audio.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(speechCreator).toHaveBeenCalledOnce();
    const cached = await app.inject({
      method: 'POST',
      url: '/api/speech',
      payload: { text: 'שלום, מה שלומך?', voice: 'female', speakingSpeed: 1 },
    });
    expect(cached.statusCode).toBe(200);
    expect(speechCreator).toHaveBeenCalledOnce();
    await app.close();
  });
  it('rejects invalid speech requests before contacting OpenAI', async () => {
    const voiceCreator = vi.fn();
    const transcriptionCreator = vi.fn();
    const speechCreator = vi.fn();
    const app = await buildApp(config, voiceCreator, transcriptionCreator, speechCreator);
    const response = await app.inject({
      method: 'POST',
      url: '/api/speech',
      payload: { text: '', voice: 'female', speakingSpeed: 1 },
    });
    expect(response.statusCode).toBe(400);
    expect(speechCreator).not.toHaveBeenCalled();
    await app.close();
  });
  it.each([
    ['/api/suggestions', { messages: [{ role: 'invalid', text: 'hello' }] }],
    ['/api/live-search', { query: '' }],
    ['/api/assess', { samples: [] }],
  ])('rejects invalid AI helper input for %s', async (url, payload) => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'POST', url, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_request');
    await app.close();
  });
});
