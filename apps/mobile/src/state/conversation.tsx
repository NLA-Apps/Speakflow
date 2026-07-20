import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { conversationReducer, initialConversationState } from './conversationReducer';
import { useDiagnostics } from './diagnostics';
import { useSettings } from './settings';
import { RealtimeWebRTCService } from '@/services/RealtimeWebRTCService';
import { LiveTranscriptionService } from '@/services/LiveTranscriptionService';
import { getLocalUserId } from '@/services/localIdentity';
import { pronounceText, stopPronunciation } from '@/services/pronunciation';
import { assessEnglish, fetchLiveAnswer, fetchSuggestions } from '@/services/api';
import { countEnglishWords, useActivity } from './activity';
import type {
  ConversationScenario,
  LanguageMode,
  RecognitionLanguage,
} from '@speakingflow/shared';

export interface Transcript {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  partial?: boolean;
}
export interface VoicePreview {
  text: string;
  itemId: string;
}
interface Value {
  phase: typeof initialConversationState.phase;
  error: string | null;
  transcripts: Transcript[];
  muted: boolean;
  outputMuted: boolean;
  elapsed: number;
  userWords: number;
  wordsPerMinute: number;
  suggestions: string[];
  suggestionsLoading: boolean;
  scenario: ConversationScenario;
  voicePreview: VoicePreview | null;
  start: () => Promise<void>;
  stop: () => void;
  interrupt: () => void;
  toggleMute: () => void;
  toggleOutputMute: () => void;
  setRecognitionLanguage: (language: RecognitionLanguage) => void;
  sendText: (text: string) => Promise<void>;
  loadSuggestions: () => Promise<void>;
  clearSuggestions: () => void;
  clearConversation: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  cancelRecording: () => void;
  cancelVoicePreview: () => void;
  startScenario: (scenario: ConversationScenario) => Promise<void>;
  openSystemSettings: () => void;
}
const Context = createContext<Value | null>(null);

const scenarioInstructions: Record<ConversationScenario, string> = {
  free:
    'This is a relaxed free conversation between two friendly adults. Explore the user’s real opinions and experiences. Follow interesting details instead of forcing a lesson plan.',
  job_interview:
    'Run a realistic but supportive job interview role-play. You are the interviewer. Stay in character, ask one interview question at a time, react to the answer, and occasionally give one brief practical improvement before continuing.',
  restaurant:
    'Run a realistic restaurant role-play. You are a friendly server and the user is the guest. Stay in character through greeting, seating, menu questions, ordering, special requests, dessert, and the bill. Introduce only one step at a time.',
};

const languageModeInstructions: Record<LanguageMode, string> = {
  english_hebrew_help:
    'Speak in English by default. Switch to Hebrew only when the user explicitly asks you to speak, explain, or translate in Hebrew.',
  mixed:
    'Speak mostly in English. Use Hebrew only when the user explicitly asks for it.',
  english_only: 'Speak only English unless comprehension or safety requires otherwise.',
  beginner: 'Use very simple English. Use Hebrew only when the user explicitly requests Hebrew help.',
};

const scenarioOpeners: Record<ConversationScenario, string[]> = {
  free: [
    'Start the conversation naturally by asking what made the user smile recently.',
    'Start with a friendly question about a place the user would love to visit and why.',
    'Start by asking what the user has been enjoying lately—music, a show, a game, or anything else.',
    'Start with an imaginative question: if the user had a completely free day tomorrow, how would they spend it?',
    'Start by asking about one small thing the user would like to improve this month.',
    'Start with a light opinion question about food, movies, technology, or travel. Choose only one topic.',
  ],
  job_interview: [
    'Welcome the candidate to the interview and ask them to tell you briefly about themselves.',
    'Begin a job interview for a role the user can choose, and ask what attracted them to that kind of work.',
    'Begin the interview and ask for an example of a challenge the candidate handled well.',
    'Begin the interview and ask what strength the candidate would bring to a team.',
  ],
  restaurant: [
    'Greet the guest at the restaurant entrance and ask whether they have a reservation.',
    'Welcome the guest to their table, offer the menu, and ask what they would like to drink.',
    'Act as the server and ask whether the guest would like a recommendation from today’s menu.',
    'Welcome the guest and ask whether they have any allergies or dietary preferences before ordering.',
  ],
};
function hebrewError(message: string) {
  if (message.includes('permission'))
    return 'אין הרשאה למיקרופון. אפשר לאשר אותה בהגדרות ה-iPhone.';
  if (message.includes('token') || message.includes('Backend'))
    return 'לא ניתן להתחבר לשרת SpeakingFlow. בדוק את כתובת השרת והחיבור לרשת.';
  return 'השיחה נותקה. אפשר לנסות להתחבר מחדש.';
}
export function ConversationProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [muted, setMuted] = useState(true);
  const [outputMuted, setOutputMuted] = useState(false);
  const outputMutedRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [scenario, setScenario] = useState<ConversationScenario>('free');
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const voicePreviewRef = useRef<VoicePreview | null>(null);
  const service = useRef<RealtimeWebRTCService | null>(null);
  const liveTranscription = useRef<LiveTranscriptionService | null>(null);
  const liveTranscriptionReady = useRef(false);
  const liveTranscriptionCommitted = useRef(false);
  const readyRef = useRef(false);
  const transcriptsRef = useRef<Transcript[]>([]);
  const pendingTexts = useRef<string[]>([]);
  const handledToolCalls = useRef(new Set<string>());
  const spokenAssistantItems = useRef(new Set<string>());
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const turnEndedAt = useRef<number | null>(null);
  const speechStartedAt = useRef<number | null>(null);
  const firstAudioMeasured = useRef(false);
  const firstTranscriptMeasured = useRef(false);
  const cancelledTurn = useRef(false);
  const connectedOnce = useRef(false);
  const reconnects = useRef(0);
  const starting = useRef(false);
  const startupRetryCount = useRef(0);
  const startRef = useRef<() => Promise<void>>(async () => undefined);
  const sessionAttempt = useRef(0);
  const { settings } = useSettings();
  const speechSettingsRef = useRef({
    voice: settings.voice,
    speakingSpeed: settings.speakingSpeed,
  });
  const { update: updateDiagnostics } = useDiagnostics();
  const { recordSession, saveAssessment } = useActivity();
  useEffect(() => {
    speechSettingsRef.current = {
      voice: settings.voice,
      speakingSpeed: settings.speakingSpeed,
    };
  }, [settings.speakingSpeed, settings.voice]);
  const upsert = useCallback(
    (
      id: string,
      role: Transcript['role'],
      text: string,
      partial: boolean,
      append = false,
      timestamp?: number,
    ) =>
      setTranscripts((items) => {
        const existing = items.findIndex((item) => item.id === id);
        const previous = existing >= 0 ? items[existing] : undefined;
        const item = {
          id,
          role,
          text: append && previous ? previous.text + text : text,
          partial,
          timestamp: previous?.timestamp ?? timestamp ?? Date.now(),
        };
        const unsorted = existing >= 0
          ? items.map((value, index) => (index === existing ? item : value))
          : [...items, item];
        const next = [...unsorted].sort((a, b) => a.timestamp - b.timestamp);
        transcriptsRef.current = next;
        return next;
      }),
    [],
  );

  const completeVoiceTurn = useCallback((itemId: string, transcript: string) => {
    const text = transcript.trim();
    if (!text) return;
    upsert(
      itemId,
      'user',
      text,
      false,
      false,
      speechStartedAt.current ?? undefined,
    );
    voicePreviewRef.current = null;
    setVoicePreview(null);
    speechStartedAt.current = null;
    try {
      service.current?.setOutputMuted(true);
      service.current?.requestResponse();
      dispatch({ type: 'GO', phase: 'waiting_for_response' });
    } catch {
      dispatch({ type: 'FAIL', message: hebrewError('Realtime channel is not open') });
    }
  }, [upsert]);

  const cancelVoicePreview = useCallback(() => {
    cancelledTurn.current = true;
    service.current?.setMuted(true);
    service.current?.clearInput();
    liveTranscription.current?.clear();
    liveTranscriptionCommitted.current = false;
    setMuted(true);
    voicePreviewRef.current = null;
    setVoicePreview(null);
    speechStartedAt.current = null;
    dispatch({ type: 'GO', phase: 'listening' });
  }, []);

  const handleCurrentInformationTool = useCallback(async (callId: string, args: string) => {
    if (handledToolCalls.current.has(callId)) return;
    handledToolCalls.current.add(callId);
    try {
      const parsed = JSON.parse(args) as { query?: unknown };
      if (typeof parsed.query !== 'string' || !parsed.query.trim())
        throw new Error('Invalid search query');
      const result = await fetchLiveAnswer({ query: parsed.query.trim() });
      service.current?.setOutputMuted(true);
      service.current?.submitToolOutput(callId, JSON.stringify(result));
    } catch {
      service.current?.setOutputMuted(true);
      service.current?.submitToolOutput(
        callId,
        JSON.stringify({ error: 'Live information is temporarily unavailable.' }),
      );
    }
  }, []);
  const handleEvent = useCallback(
    (event: {
      type: string;
      delta?: string;
      transcript?: string;
      error?: { message?: string };
      item_id?: string;
      response_id?: string;
      response?: {
        id?: string;
        output?: {
          type?: string;
          name?: string;
          call_id?: string;
          arguments?: string;
        }[];
      };
    }) => {
      if (event.type === 'input_audio_buffer.speech_started') {
        cancelledTurn.current = false;
        liveTranscriptionCommitted.current = false;
        speechStartedAt.current = Date.now();
        const preview: VoicePreview = {
          itemId: event.item_id ?? `voice-${Date.now()}`,
          text: '',
        };
        voicePreviewRef.current = preview;
        setVoicePreview(preview);
        dispatch({ type: 'GO', phase: 'user_speaking' });
      }
      if (event.type === 'input_audio_buffer.speech_stopped') {
        if (cancelledTurn.current) {
          speechStartedAt.current = null;
          dispatch({ type: 'GO', phase: 'listening' });
          return;
        }
        service.current?.setMuted(true);
        setMuted(true);
        if (!liveTranscriptionCommitted.current) {
          liveTranscriptionCommitted.current = true;
          liveTranscription.current?.commit();
        }
        turnEndedAt.current = Date.now();
        service.current?.markTurnEnded(turnEndedAt.current);
      }
      if (
        event.type.includes('input_audio_transcription.delta') &&
        event.delta &&
        !cancelledTurn.current &&
        !liveTranscriptionReady.current
      ) {
        const itemId = event.item_id ?? voicePreviewRef.current?.itemId ?? 'user-live';
        setVoicePreview((current) => {
          const next: VoicePreview = {
            itemId,
            text: (current?.itemId === itemId ? current.text : '') + event.delta,
          };
          voicePreviewRef.current = next;
          return next;
        });
      }
      if (event.type.includes('input_audio_transcription.completed') && event.transcript) {
        if (cancelledTurn.current) {
          if (event.item_id) service.current?.deleteConversationItem(event.item_id);
          return;
        }
        completeVoiceTurn(
          event.item_id ?? voicePreviewRef.current?.itemId ?? `voice-${Date.now()}`,
          event.transcript,
        );
      }
      if (
        (event.type.includes('output_audio_transcript.delta') ||
          event.type === 'response.audio_transcript.delta') &&
        event.delta
      ) {
        if (turnEndedAt.current && !firstTranscriptMeasured.current) {
          firstTranscriptMeasured.current = true;
          updateDiagnostics({ firstTranscriptLatencyMs: Date.now() - turnEndedAt.current });
        }
        dispatch({ type: 'GO', phase: 'assistant_speaking' });
      }
      if (
        event.type.includes('output_audio.delta') &&
        turnEndedAt.current &&
        !firstAudioMeasured.current
      ) {
        firstAudioMeasured.current = true;
        updateDiagnostics({ firstAudioLatencyMs: Date.now() - turnEndedAt.current });
      }
      if (event.type.includes('output_audio_transcript.done') && event.transcript)
        {
          const itemId =
            event.item_id ?? `assistant-${event.response_id ?? event.response?.id ?? Date.now()}`;
          if (!outputMutedRef.current && !spokenAssistantItems.current.has(itemId)) {
            spokenAssistantItems.current.add(itemId);
            const text = event.transcript;
            const currentSpeechSettings = speechSettingsRef.current;
            let revealed = false;
            const revealMessage = () => {
              if (revealed) return;
              revealed = true;
              upsert(itemId, 'assistant', text, false);
            };
            void pronounceText(text, {
              voice: currentSpeechSettings.voice,
              speed: currentSpeechSettings.speakingSpeed,
              onReady: revealMessage,
            }).finally(revealMessage);
          } else upsert(itemId, 'assistant', event.transcript, false);
        }
      if (event.type === 'response.done') {
        service.current?.setMuted(true);
        // Realtime audio stays muted. The professional TTS player reveals the
        // completed bubble on the same paint in which playback starts.
        service.current?.setOutputMuted(true);
        setMuted(true);
        setTranscripts((items) => {
          const next = items.map((item) =>
            item.role === 'assistant' && item.partial ? { ...item, partial: false } : item,
          );
          transcriptsRef.current = next;
          return next;
        });
        const calls = (event.response?.output ?? []).filter(
          (item) =>
            item.type === 'function_call' &&
            item.name === 'search_current_information' &&
            item.call_id &&
            item.arguments,
        );
        calls.forEach((item) => {
          void handleCurrentInformationTool(item.call_id!, item.arguments!);
        });
        if (calls.length === 0) dispatch({ type: 'GO', phase: 'listening' });
      }
      if (event.type === 'error') {
        const message = event.error?.message ?? 'Realtime API error';
        console.warn('Recoverable Realtime event:', message);
        updateDiagnostics({ lastError: message });
        dispatch({ type: 'GO', phase: 'listening' });
      }
    },
    [completeVoiceTurn, handleCurrentInformationTool, updateDiagnostics, upsert],
  );
  const stop = useCallback(() => {
    stopPronunciation();
    liveTranscription.current?.close();
    liveTranscription.current = null;
    liveTranscriptionReady.current = false;
    voicePreviewRef.current = null;
    setVoicePreview(null);
    const sessionStartedAt = startedAt.current;
    const currentSessionId = sessionId.current;
    const snapshot = transcriptsRef.current.filter((item) => !item.partial);
    if (sessionStartedAt && currentSessionId) {
      const durationSeconds = Math.max(1, Math.floor((Date.now() - sessionStartedAt) / 1000));
      const userSamples = snapshot.filter((item) => item.role === 'user').map((item) => item.text);
      const userWords = userSamples.reduce((sum, text) => sum + countEnglishWords(text), 0);
      const assistantWords = snapshot
        .filter((item) => item.role === 'assistant')
        .reduce((sum, item) => sum + countEnglishWords(item.text), 0);
      recordSession({
        id: currentSessionId,
        startedAt: sessionStartedAt,
        durationSeconds,
        userWords,
        assistantWords,
        wordsPerMinute: Math.round((userWords / durationSeconds) * 60),
      });
      if (userWords >= 20) {
        void assessEnglish({ samples: userSamples }).then(saveAssessment).catch(() => undefined);
      }
    }
    sessionAttempt.current += 1;
    starting.current = false;
    service.current?.close();
    service.current = null;
    readyRef.current = false;
    startedAt.current = null;
    sessionId.current = null;
    setMuted(true);
    void setAudioModeAsync({ allowsRecording: false });
    setElapsed(0);
    dispatch({ type: 'GO', phase: 'disconnecting' });
    dispatch({ type: 'GO', phase: 'idle' });
  }, [recordSession, saveAssessment]);
  const start = useCallback(async () => {
    if (service.current || starting.current) return;
    starting.current = true;
    const attempt = ++sessionAttempt.current;
    try {
      handledToolCalls.current.clear();
      setSuggestions([]);
      if (connectedOnce.current) {
        reconnects.current += 1;
        updateDiagnostics({ reconnectCount: reconnects.current });
      }
      dispatch({ type: 'GO', phase: 'requesting_permission' });
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (attempt !== sessionAttempt.current) return;
      updateDiagnostics({ microphonePermission: permission.status });
      if (!permission.granted) throw new Error('microphone permission denied');
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: !settings.speaker,
      });
      if (attempt !== sessionAttempt.current) {
        await setAudioModeAsync({ allowsRecording: false });
        return;
      }
      dispatch({ type: 'GO', phase: 'fetching_token' });
      const localUserId = await getLocalUserId();
      if (attempt !== sessionAttempt.current) return;
      let next: RealtimeWebRTCService;
      next = new RealtimeWebRTCService({
        onEvent: handleEvent,
        onConnection: (connectionState, iceState, signalingState) => {
          if (attempt !== sessionAttempt.current || service.current !== next) return;
          updateDiagnostics({ connectionState, iceState, signalingState });
          if (connectionState === 'failed') {
            // During the initial handshake connect() rejects and the retry
            // path below owns cleanup. Avoid flashing an error in between.
            if (starting.current && !readyRef.current) return;
            liveTranscription.current?.close();
            liveTranscription.current = null;
            liveTranscriptionReady.current = false;
            service.current?.close();
            service.current = null;
            readyRef.current = false;
            dispatch({ type: 'FAIL', message: hebrewError('WebRTC connection failed') });
          }
        },
        onMetric: (name, ms) => {
          if (name === 'token') updateDiagnostics({ tokenLatencyMs: ms });
          else if (name === 'connect') updateDiagnostics({ connectLatencyMs: ms });
          else {
            firstAudioMeasured.current = true;
            updateDiagnostics({ firstAudioLatencyMs: ms });
          }
        },
        onError: (message) => {
          if (attempt !== sessionAttempt.current || service.current !== next) return;
          console.warn('SpeakingFlow Realtime error:', message);
          if (starting.current && !readyRef.current) {
            updateDiagnostics({ lastError: message });
            return;
          }
          liveTranscription.current?.close();
          liveTranscription.current = null;
          liveTranscriptionReady.current = false;
          service.current?.close();
          service.current = null;
          readyRef.current = false;
          updateDiagnostics({ lastError: message });
          dispatch({ type: 'FAIL', message: hebrewError(message) });
        },
      });
      service.current = next;
      dispatch({ type: 'GO', phase: 'connecting' });
      const model = await next.connect({
        localUserId,
        languageMode: settings.languageMode,
        // Server VAD detects the end of speech, but the audio track itself stays
        // closed until the user taps the microphone.
        turnMode: 'automatic',
        responseLength: settings.responseLength,
        speakingSpeed: settings.speakingSpeed,
        voice: settings.voice,
        recognitionLanguage: settings.recognitionLanguage,
      });
      if (attempt !== sessionAttempt.current) {
        next.close();
        return;
      }
      const microphoneStream = next.getMicrophoneStream();
      if (microphoneStream) {
        const transcription = new LiveTranscriptionService({
          onDelta: (itemId, delta) => {
            if (cancelledTurn.current) return;
            setVoicePreview((current) => {
              if (!current) return current;
              const nextPreview: VoicePreview = {
                itemId,
                text: (current.itemId === itemId ? current.text : '') + delta,
              };
              voicePreviewRef.current = nextPreview;
              return nextPreview;
            });
          },
          onCompleted: (itemId, transcript) => {
            if (cancelledTurn.current) return;
            setVoicePreview((current) => {
              if (!current) return current;
              const nextPreview: VoicePreview = { itemId, text: transcript };
              voicePreviewRef.current = nextPreview;
              return nextPreview;
            });
          },
          onError: (message) => {
            console.warn('Live transcription fallback:', message);
            liveTranscriptionReady.current = false;
          },
        });
        liveTranscription.current = transcription;
        try {
          await transcription.connect(
            {
              localUserId,
              recognitionLanguage:
                settings.recognitionLanguage === 'he' ? 'he' : 'en',
            },
            microphoneStream,
          );
          liveTranscriptionReady.current = true;
        } catch (error) {
          console.warn(
            'Streaming transcription unavailable; using turn transcript:',
            error instanceof Error ? error.message : error,
          );
          transcription.close();
          liveTranscription.current = null;
          liveTranscriptionReady.current = false;
        }
      }
      // Keep the microphone track closed until the user explicitly starts a turn.
      next.setMuted(true);
      setMuted(true);
      next.setOutputMuted(true);
      firstAudioMeasured.current = false;
      firstTranscriptMeasured.current = false;
      updateDiagnostics({ model });
      dispatch({ type: 'GO', phase: 'connected' });
      dispatch({ type: 'GO', phase: 'listening' });
      startedAt.current = Date.now();
      sessionId.current = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      connectedOnce.current = true;
      readyRef.current = true;
      startupRetryCount.current = 0;
      const queued = pendingTexts.current.splice(0);
      queued.forEach((text) => {
        upsert(`typed-${Date.now()}-${Math.random()}`, 'user', text, false);
        next.sendText(text);
      });
    } catch (error) {
      liveTranscription.current?.close();
      liveTranscription.current = null;
      liveTranscriptionReady.current = false;
      service.current?.close();
      service.current = null;
      readyRef.current = false;
      if (attempt !== sessionAttempt.current) return;
      const technical = error instanceof Error ? error.message : 'Unknown session error';
      console.warn('SpeakingFlow connection failed:', technical);
      updateDiagnostics({ lastError: technical });
      const normalized = technical.toLowerCase();
      const shouldRetry =
        startupRetryCount.current < 1 &&
        !normalized.includes('permission') &&
        !normalized.includes('notallowed') &&
        !normalized.includes('no microphone') &&
        !normalized.includes('cancelled');
      if (shouldRetry) {
        startupRetryCount.current += 1;
        reconnects.current += 1;
        updateDiagnostics({ reconnectCount: reconnects.current });
        dispatch({ type: 'GO', phase: 'reconnecting' });
        starting.current = false;
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (attempt === sessionAttempt.current) await startRef.current();
        return;
      }
      startupRetryCount.current = 0;
      dispatch({ type: 'FAIL', message: hebrewError(technical) });
    } finally {
      starting.current = false;
    }
  }, [handleEvent, settings, updateDiagnostics, upsert]);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setSuggestions([]);
      if (!service.current || !readyRef.current) {
        pendingTexts.current.push(text);
        await start();
        return;
      }
      upsert(`typed-${Date.now()}-${Math.random()}`, 'user', text, false);
      service.current.setOutputMuted(true);
      service.current.sendText(text);
      dispatch({ type: 'GO', phase: 'waiting_for_response' });
    },
    [start, upsert],
  );

  const clearConversation = useCallback(async () => {
    // A visual-only reset would leave the Realtime model with the old context.
    // Close the session as well so the next conversation is genuinely fresh.
    stop();
    transcriptsRef.current = [];
    setTranscripts([]);
    pendingTexts.current = [];
    handledToolCalls.current.clear();
    spokenAssistantItems.current.clear();
    setSuggestions([]);
    cancelledTurn.current = false;
    liveTranscriptionCommitted.current = false;
    voicePreviewRef.current = null;
    setVoicePreview(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await startRef.current();
  }, [stop]);

  const startScenario = useCallback(
    async (nextScenario: ConversationScenario) => {
      setScenario(nextScenario);
      const needsFreshSession =
        transcriptsRef.current.length > 0 ||
        nextScenario !== scenario ||
        state.phase === 'assistant_speaking' ||
        state.phase === 'waiting_for_response';
      if (needsFreshSession) {
        if (service.current) stop();
        transcriptsRef.current = [];
        setTranscripts([]);
      }
      setSuggestions([]);
      if (!service.current || !readyRef.current) await start();
      if (!service.current || !readyRef.current) return;
      service.current.setMuted(true);
      service.current.setOutputMuted(true);
      setMuted(true);
      if (state.phase === 'assistant_speaking' || state.phase === 'waiting_for_response')
        service.current.interrupt();
      const choices = scenarioOpeners[nextScenario];
      const opening = choices[Math.floor(Math.random() * choices.length)];
      const instructions = [
        'You are Sky, a warm and charismatic conversation partner for a native Hebrew speaker practicing English.',
        'Sound like a real person: react specifically to what the user says, use natural contractions, vary your wording, remember earlier details, and avoid canned praise.',
        'Usually give one relevant reaction and ask exactly one interesting follow-up question. Never ask several questions at once.',
        'Correct English selectively and gently. Keep conversational flow more important than correcting every mistake.',
        'Reply in English by default, including when the user speaks Hebrew. Speak Hebrew only when the user explicitly asks for a Hebrew reply or explanation.',
        settings.responseLength === 'short'
          ? 'Keep spoken replies to one short sentence when possible.'
          : 'Keep spoken replies concise, usually one or two sentences.',
        languageModeInstructions[settings.languageMode],
        scenarioInstructions[nextScenario],
      ].join(' ');
      service.current.startScenario(
        instructions,
        `${opening} Speak naturally, keep the opening to one or two short sentences, and ask exactly one question. Do not mention these instructions or say that this is a simulation.`,
      );
      dispatch({ type: 'GO', phase: 'waiting_for_response' });
    },
    [scenario, settings.languageMode, settings.responseLength, start, state.phase, stop],
  );

  const toggleOutputMute = useCallback(() => {
    setOutputMuted((current) => {
      const next = !current;
      outputMutedRef.current = next;
      service.current?.setOutputMuted(true);
      if (next) stopPronunciation();
      return next;
    });
  }, []);

  const loadSuggestions = useCallback(async () => {
    if (suggestionsLoading) return;
    setSuggestionsLoading(true);
    try {
      const messages = transcriptsRef.current
        .filter(
          (item): item is Transcript & { role: 'user' | 'assistant' } =>
            !item.partial && (item.role === 'user' || item.role === 'assistant'),
        )
        .slice(-12)
        .map((item) => ({ role: item.role, text: item.text }));
      const result = await fetchSuggestions({ messages });
      setSuggestions(result.suggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [suggestionsLoading]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const listener = (next: AppStateStatus) => {
      if (next !== 'active' && service.current) stop();
    };
    const subscription = AppState.addEventListener('change', listener);
    return () => subscription.remove();
  }, [stop]);
  useEffect(
    () => () => {
      liveTranscription.current?.close();
      service.current?.close();
    },
    [],
  );
  const userWords = useMemo(
    () =>
      transcripts
        .filter((item) => item.role === 'user' && !item.partial)
        .reduce((sum, item) => sum + countEnglishWords(item.text), 0),
    [transcripts],
  );
  const wordsPerMinute = elapsed > 0 ? Math.round((userWords / elapsed) * 60) : 0;
  const value = useMemo<Value>(
    () => ({
      phase: state.phase,
      error: state.error,
      transcripts,
      muted,
      outputMuted,
      elapsed,
      userWords,
      wordsPerMinute,
      suggestions,
      suggestionsLoading,
      scenario,
      voicePreview,
      start,
      stop,
      interrupt: () => {
        dispatch({ type: 'GO', phase: 'interrupting' });
        service.current?.interrupt();
        dispatch({ type: 'GO', phase: 'listening' });
      },
      toggleMute: () =>
        setMuted((value) => {
          service.current?.setMuted(!value);
          return !value;
        }),
      toggleOutputMute,
      setRecognitionLanguage: (language) => {
        try {
          service.current?.setRecognitionLanguage(language);
          liveTranscription.current?.setLanguage(language);
        } catch {
          return;
        }
      },
      sendText,
      loadSuggestions,
      clearSuggestions: () => setSuggestions([]),
      clearConversation,
      toggleRecording: async () => {
        if (muted) {
          if (voicePreviewRef.current) return;
          if (!service.current || !readyRef.current) await start();
          if (!service.current || !readyRef.current) return;
          if (state.phase === 'assistant_speaking' || state.phase === 'waiting_for_response') {
            service.current.interrupt();
            service.current.clearOutput();
          }
          stopPronunciation();
          cancelledTurn.current = false;
          liveTranscriptionCommitted.current = false;
          const preview: VoicePreview = { itemId: `voice-${Date.now()}`, text: '' };
          voicePreviewRef.current = preview;
          setVoicePreview(preview);
          service.current.setMuted(false);
          setMuted(false);
          speechStartedAt.current = Date.now();
          dispatch({ type: 'GO', phase: 'user_speaking' });
        } else {
          service.current?.setMuted(true);
          setMuted(true);
          turnEndedAt.current = Date.now();
          service.current?.markTurnEnded(turnEndedAt.current);
          try {
            if (!liveTranscriptionCommitted.current) {
              liveTranscriptionCommitted.current = true;
              liveTranscription.current?.commit();
            }
            service.current?.commitManualTurn();
          } catch {
            return;
          }
        }
      },
      cancelRecording: () => {
        if (!muted || voicePreviewRef.current) cancelVoicePreview();
      },
      cancelVoicePreview,
      startScenario,
      openSystemSettings: () => {
        void Linking.openSettings();
      },
    }),
    [
      elapsed,
      cancelVoicePreview,
      clearConversation,
      loadSuggestions,
      muted,
      outputMuted,
      sendText,
      start,
      state,
      stop,
      suggestions,
      suggestionsLoading,
      scenario,
      startScenario,
      toggleOutputMute,
      transcripts,
      userWords,
      voicePreview,
      wordsPerMinute,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useConversation() {
  const value = useContext(Context);
  if (!value) throw new Error('ConversationProvider missing');
  return value;
}
