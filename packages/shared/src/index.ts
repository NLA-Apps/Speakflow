export type LanguageMode = 'english_hebrew_help' | 'mixed' | 'english_only' | 'beginner';
export type TurnMode = 'automatic' | 'push_to_talk';
export type ResponseLength = 'short' | 'normal';
export type VoicePreference = 'female' | 'male';
export type RecognitionLanguage = 'auto' | 'he' | 'en';
export type ConversationScenario = 'free' | 'job_interview' | 'restaurant';

export interface ClientSecretRequest {
  localUserId: string;
  languageMode: LanguageMode;
  turnMode: TurnMode;
  responseLength: ResponseLength;
  speakingSpeed: number;
  voice?: VoicePreference;
  recognitionLanguage?: RecognitionLanguage;
}

export interface TranscriptionSecretRequest {
  localUserId: string;
  recognitionLanguage: RecognitionLanguage;
}

export interface TranslationRequest {
  text: string;
  kind: 'word' | 'sentence';
}

export interface TranslationResponse {
  source: string;
  translation: string;
  transliteration?: string;
  example?: string;
}

export interface SpeechRequest {
  text: string;
  voice: VoicePreference;
  speakingSpeed: number;
}

export interface SpeechResponse {
  audioPath: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface SuggestionsRequest {
  messages: ConversationMessage[];
}

export interface SuggestionsResponse {
  suggestions: string[];
}

export interface LiveSearchRequest {
  query: string;
}

export interface LiveSearchResponse {
  answer: string;
}

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface AssessmentRequest {
  samples: string[];
}

export interface AssessmentResponse {
  level: CefrLevel;
  confidence: number;
  summary: string;
}

export interface ClientSecretResponse {
  clientSecret: string;
  expiresAt: number;
  model: string;
}

export { buildCoachInstructions } from './instructions.js';

export type ConversationPhase =
  | 'idle'
  | 'requesting_permission'
  | 'fetching_token'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'user_speaking'
  | 'waiting_for_response'
  | 'assistant_speaking'
  | 'interrupting'
  | 'reconnecting'
  | 'disconnecting'
  | 'error';
