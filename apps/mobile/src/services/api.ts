import Constants from 'expo-constants';
import type {
  ClientSecretRequest,
  ClientSecretResponse,
  TranscriptionSecretRequest,
  TranslationRequest,
  TranslationResponse,
  SuggestionsRequest,
  SuggestionsResponse,
  LiveSearchRequest,
  LiveSearchResponse,
  AssessmentRequest,
  AssessmentResponse,
  SpeechRequest,
  SpeechResponse,
} from '@speakingflow/shared';

export function apiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    Constants.expoConfig?.extra?.apiBaseUrl ||
    ''
  ).replace(/\/$/, '');
}
export function validateApiUrl(url = apiBaseUrl()): URL {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid backend URL');
  return parsed;
}
async function timedFetch(url: string, init: RequestInit, timeout = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
export async function healthCheck(): Promise<boolean> {
  try {
    validateApiUrl();
    const response = await timedFetch(`${apiBaseUrl()}/health`, { method: 'GET' }, 5000);
    return response.ok;
  } catch {
    return false;
  }
}
export async function fetchClientSecret(input: ClientSecretRequest): Promise<ClientSecretResponse> {
  validateApiUrl();
  const response = await timedFetch(`${apiBaseUrl()}/api/realtime/client-secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Backend token request failed (${response.status})`);
  return (await response.json()) as ClientSecretResponse;
}

export async function fetchTranscriptionSecret(
  input: TranscriptionSecretRequest,
): Promise<ClientSecretResponse> {
  return postJson('/api/realtime/transcription-client-secret', input, 12_000);
}

export async function translateText(input: TranslationRequest): Promise<TranslationResponse> {
  validateApiUrl();
  const response = await timedFetch(
    `${apiBaseUrl()}/api/translate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    25_000,
  );
  if (!response.ok) throw new Error(`Translation request failed (${response.status})`);
  return (await response.json()) as TranslationResponse;
}

export async function createSpeech(input: SpeechRequest): Promise<string> {
  const result = await postJson<SpeechResponse>('/api/speech', input, 30_000);
  return `${apiBaseUrl()}${result.audioPath}`;
}

async function postJson<TResponse>(path: string, input: unknown, timeout = 12_000) {
  validateApiUrl();
  const response = await timedFetch(
    `${apiBaseUrl()}${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    timeout,
  );
  if (!response.ok) throw new Error(`${path} request failed (${response.status})`);
  return (await response.json()) as TResponse;
}

export function fetchSuggestions(input: SuggestionsRequest): Promise<SuggestionsResponse> {
  return postJson('/api/suggestions', input);
}

export function fetchLiveAnswer(input: LiveSearchRequest): Promise<LiveSearchResponse> {
  return postJson('/api/live-search', input, 20_000);
}

export function assessEnglish(input: AssessmentRequest): Promise<AssessmentResponse> {
  return postJson('/api/assess', input, 18_000);
}
