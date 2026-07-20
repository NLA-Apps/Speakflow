import { createHash } from 'node:crypto';
import {
  buildCoachInstructions,
  type ClientSecretRequest,
  type TranscriptionSecretRequest,
  type AssessmentRequest,
  type AssessmentResponse,
  type LiveSearchRequest,
  type LiveSearchResponse,
  type SuggestionsRequest,
  type SuggestionsResponse,
  type TranslationRequest,
  type TranslationResponse,
  type SpeechRequest,
} from '@speakingflow/shared';
import type { ServerConfig } from './config.js';

interface OpenAISecretResult {
  value: string;
  expires_at: number;
  session?: { model?: string };
}

const retryableStatusCodes = new Set([408, 409, 429, 500, 502, 503, 504]);

async function fetchWithTransientRetry(url: string, init: RequestInit): Promise<Response> {
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (
        response.ok ||
        !retryableStatusCodes.has(response.status) ||
        attempt === maxAttempts - 1
      )
        return response;
      await response.body?.cancel();
    } catch (error) {
      if (init.signal?.aborted || attempt === maxAttempts - 1) throw error;
    }
    const delayMs = 250 * 2 ** attempt + Math.floor(Math.random() * 100);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('OpenAI request retry exhausted');
}

export async function createOpenAITranscriptionSecret(
  config: ServerConfig,
  input: TranscriptionSecretRequest,
  signal: AbortSignal,
): Promise<OpenAISecretResult> {
  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': safetyIdentifier(input.localUserId),
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: config.TOKEN_TTL_SECONDS },
      session: {
        type: 'transcription',
        audio: {
          input: {
            noise_reduction: { type: 'near_field' },
            transcription: {
              model: 'gpt-realtime-whisper',
              language: input.recognitionLanguage,
              delay: 'minimal',
            },
            turn_detection: null,
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const error = new Error('OpenAI transcription client-secret request failed');
    Object.assign(error, { statusCode: response.status });
    throw error;
  }
  return (await response.json()) as OpenAISecretResult;
}

export function safetyIdentifier(localUserId: string): string {
  return 'sf_' + createHash('sha256').update(localUserId).digest('hex').slice(0, 32);
}

export interface GeneratedSpeech {
  audio: Uint8Array;
  contentType: string;
}

export async function createSpeechWithOpenAI(
  config: ServerConfig,
  input: SpeechRequest,
  signal: AbortSignal,
): Promise<GeneratedSpeech> {
  const isHebrew = /[\u0590-\u05ff]/.test(input.text);
  const pace =
    input.speakingSpeed < 0.95
      ? 'calm and slightly slow'
      : input.speakingSpeed > 1.05
        ? 'lively and slightly brisk'
        : 'natural and conversational';
  const presentation =
    input.voice === 'male'
      ? 'a warm, polished masculine voice'
      : 'a warm, polished feminine voice';
  const response = await fetchWithTransientRetry('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: input.voice === 'male' ? 'cedar' : 'marin',
      input: input.text,
      response_format: 'mp3',
      instructions: [
        `Speak with ${presentation}.`,
        `Use a ${pace} pace and natural intonation suitable for a premium language coach.`,
        isHebrew
          ? 'Speak in natural modern Israeli Hebrew. Pronounce Hebrew clearly and do not translate the text.'
          : 'Speak in clear, natural international English. Do not translate the text.',
        'Read the complete text exactly once without cutting off the ending.',
      ].join(' '),
    }),
  });
  if (!response.ok) {
    const error = new Error('OpenAI speech request failed');
    Object.assign(error, { statusCode: response.status });
    throw error;
  }
  return {
    audio: new Uint8Array(await response.arrayBuffer()),
    // OpenAI may label binary audio as application/octet-stream. Because this
    // request explicitly asks for MP3, expose the precise media type so web
    // browsers do not reject it when Helmet enables X-Content-Type-Options.
    contentType: 'audio/mpeg',
  };
}

export async function createOpenAIClientSecret(
  config: ServerConfig,
  input: ClientSecretRequest,
  signal: AbortSignal,
): Promise<OpenAISecretResult> {
  const recognitionLanguage = input.recognitionLanguage ?? 'auto';
  const transcription = {
    model: 'gpt-4o-transcribe',
    ...(recognitionLanguage === 'auto' ? {} : { language: recognitionLanguage }),
    prompt:
      recognitionLanguage === 'en'
        ? 'The speaker is practicing conversational English. Transcribe in English using Latin letters.'
        : recognitionLanguage === 'he'
          ? 'The speaker is speaking Hebrew. Write Hebrew only in Hebrew script and never transliterate it.'
          : 'The speaker is a native Hebrew speaker practicing English and may naturally switch between Hebrew and English. Automatically identify each language. Write Hebrew speech only in Hebrew script and English speech only in Latin script. Never transliterate Hebrew and never identify Hebrew as Korean, Arabic, or another language.',
  };
  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': safetyIdentifier(input.localUserId),
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: config.TOKEN_TTL_SECONDS },
      session: {
        type: 'realtime',
        model: config.OPENAI_REALTIME_MODEL,
        output_modalities: ['audio'],
        instructions: buildCoachInstructions(input.languageMode, input.responseLength),
        // Audio consumes substantially more output tokens than plain text.
        // Keep the verbal answer short through instructions, not by truncating audio.
        max_output_tokens: input.responseLength === 'short' ? 1024 : 2048,
        tools: [
          {
            type: 'function',
            name: 'search_current_information',
            description:
              'Search the live web for current or recently changed facts such as sports results, news, schedules, prices, weather, public figures, and events. Always write the query argument in English, translating the user request when necessary.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'A focused web search query.' },
              },
              required: ['query'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: 'auto',
        audio: {
          input: {
            noise_reduction: { type: 'near_field' },
            transcription,
            turn_detection:
              input.turnMode === 'automatic'
                ? {
                    type: 'server_vad',
                    threshold: 0.68,
                    prefix_padding_ms: 400,
                    silence_duration_ms: 800,
                    // Let the client show the completed transcript and offer a
                    // short cancellation window before Sky receives the turn.
                    create_response: false,
                    interrupt_response: false,
                  }
                : null,
          },
          output: {
            voice: input.voice === 'male' ? 'cedar' : 'marin',
            speed: input.speakingSpeed,
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const error = new Error('OpenAI client-secret request failed');
    Object.assign(error, { statusCode: response.status });
    throw error;
  }
  return (await response.json()) as OpenAISecretResult;
}

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const value = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (value.output_text) return value.output_text;
  return (value.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? '')
    .join('');
}

export async function translateWithOpenAI(
  config: ServerConfig,
  input: TranslationRequest,
  signal: AbortSignal,
): Promise<TranslationResponse> {
  const response = await fetchWithTransientRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.OPENAI_TEXT_MODEL,
      max_output_tokens: 500,
      text: {
        format: {
          type: 'json_schema',
          name: 'translation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              translation: { type: 'string' },
              transliteration: { type: 'string' },
              example: { type: 'string' },
            },
            required: ['translation', 'transliteration', 'example'],
            additionalProperties: false,
          },
        },
      },
      input: [
        {
          role: 'system',
          content:
            'Translate English to natural Hebrew for a language learner. Return JSON only with string fields translation, transliteration, and example. For a sentence, transliteration may be empty. Keep the answer concise.',
        },
        {
          role: 'user',
          content: `${input.kind}: ${input.text}`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI translation failed (${response.status})`);
  const raw = responseText(await response.json()).replace(/```(?:json)?|```/g, '').trim();
  const parsed = JSON.parse(raw) as Partial<TranslationResponse>;
  if (!parsed.translation) throw new Error('OpenAI translation response was invalid');
  return {
    source: input.text,
    translation: parsed.translation,
    transliteration: parsed.transliteration || undefined,
    example: parsed.example || undefined,
  };
}

async function createTextResponse(
  config: ServerConfig,
  input: unknown,
  signal: AbortSignal,
  options: {
    webSearch?: boolean;
    maxOutputTokens?: number;
    jsonSchema?: { name: string; schema: Record<string, unknown> };
    model?: string;
  } = {},
): Promise<string> {
  const response = await fetchWithTransientRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? config.OPENAI_TEXT_MODEL,
      max_output_tokens: options.maxOutputTokens ?? 700,
      ...(options.webSearch
        ? { tools: [{ type: 'web_search', search_context_size: 'medium' }], tool_choice: 'required' }
        : {}),
      ...(options.jsonSchema
        ? {
            text: {
              format: {
                type: 'json_schema',
                name: options.jsonSchema.name,
                strict: true,
                schema: options.jsonSchema.schema,
              },
            },
          }
        : {}),
      input,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI response failed (${response.status})`);
  const text = responseText(await response.json()).trim();
  if (!text) throw new Error('OpenAI response was empty');
  return text;
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?|```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  return JSON.parse(first >= 0 && last >= first ? cleaned.slice(first, last + 1) : cleaned) as T;
}

export async function suggestRepliesWithOpenAI(
  config: ServerConfig,
  input: SuggestionsRequest,
  signal: AbortSignal,
): Promise<SuggestionsResponse> {
  const transcript = input.messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.text}`)
    .join('\n');
  const text = await createTextResponse(
    config,
    [
      {
        role: 'system',
        content:
          'You help a Hebrew-speaking English learner continue a conversation. Return JSON only: {"suggestions":[three short, natural English replies]}. Suggestions must directly fit the latest topic and must not repeat each other.',
      },
      { role: 'user', content: transcript || 'The conversation has not started yet.' },
    ],
    signal,
    {
      maxOutputTokens: 350,
      jsonSchema: {
        name: 'reply_suggestions',
        schema: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: { type: 'string' },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: ['suggestions'],
          additionalProperties: false,
        },
      },
    },
  );
  const parsed = parseJson<Partial<SuggestionsResponse>>(text);
  const suggestions = (parsed.suggestions ?? [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .slice(0, 3);
  if (suggestions.length !== 3) throw new Error('Invalid suggestions response');
  return { suggestions };
}

export async function searchCurrentInformationWithOpenAI(
  config: ServerConfig,
  input: LiveSearchRequest,
  signal: AbortSignal,
): Promise<LiveSearchResponse> {
  let searchQuery = input.query;
  if (/[\u0590-\u05ff]/.test(searchQuery)) {
    const normalized = await createTextResponse(
      config,
      [
        {
          role: 'system',
          content:
            'Translate the request into one concise English web-search query. Preserve names, dates, competitions, and the user intent. Return JSON only: {"query":"..."}.',
        },
        { role: 'user', content: searchQuery },
      ],
      signal,
      {
        maxOutputTokens: 180,
        jsonSchema: {
          name: 'normalized_search_query',
          schema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
    );
    const parsed = parseJson<{ query?: string }>(normalized);
    if (parsed.query?.trim()) searchQuery = parsed.query.trim();
  }
  const rawAnswer = await createTextResponse(
    config,
    [
      {
        role: 'system',
        content:
          `You must use live web search before answering. Today is ${new Date().toISOString().slice(0, 10)}. Translate the query internally if needed and answer only in concise English because a separate voice model will localize the final answer. Find the latest completed event available as of today, not merely a schedule or an old knowledge-cutoff answer. Never guess missing scores or facts. Mention the relevant date when it prevents ambiguity. Do not include citations or URLs.`,
      },
      { role: 'user', content: searchQuery },
    ],
    signal,
    { webSearch: true, maxOutputTokens: 900, model: config.OPENAI_SEARCH_MODEL },
  );
  const answer = rawAnswer
    .replace(/\s*\(\[[^\]]+\]\(https?:\/\/[^)]+\)\)/g, '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  return { answer };
}

export async function assessEnglishWithOpenAI(
  config: ServerConfig,
  input: AssessmentRequest,
  signal: AbortSignal,
): Promise<AssessmentResponse> {
  const text = await createTextResponse(
    config,
    [
      {
        role: 'system',
        content:
          'Assess only the learner English in the samples using CEFR. Return JSON only: {"level":"A1|A2|B1|B2|C1|C2","confidence":number from 0 to 1,"summary":"short Hebrew explanation"}. Ignore Hebrew words and do not overstate confidence from a small sample.',
      },
      { role: 'user', content: input.samples.join('\n') },
    ],
    signal,
    {
      maxOutputTokens: 350,
      jsonSchema: {
        name: 'cefr_assessment',
        schema: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            summary: { type: 'string' },
          },
          required: ['level', 'confidence', 'summary'],
          additionalProperties: false,
        },
      },
    },
  );
  const parsed = parseJson<Partial<AssessmentResponse>>(text);
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
  if (!parsed.level || !levels.includes(parsed.level) || typeof parsed.summary !== 'string')
    throw new Error('Invalid assessment response');
  return {
    level: parsed.level,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    summary: parsed.summary,
  };
}
