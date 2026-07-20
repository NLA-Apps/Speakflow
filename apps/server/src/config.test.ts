import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('rejects a missing key', () => expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow());
  it('parses allowed origins', () => {
    const config = loadConfig({
      OPENAI_API_KEY: 'test-openai-key-placeholder-000000',
      ALLOWED_ORIGINS: 'https://a.test,https://b.test',
      NODE_ENV: 'test',
    });
    expect(config.allowedOrigins).toEqual(['https://a.test', 'https://b.test']);
  });
});
