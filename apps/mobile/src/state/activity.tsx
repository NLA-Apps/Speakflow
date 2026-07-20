import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { AssessmentResponse } from '@speakingflow/shared';

export interface SessionRecord {
  id: string;
  startedAt: number;
  durationSeconds: number;
  userWords: number;
  assistantWords: number;
  wordsPerMinute: number;
}

interface StoredActivity {
  sessions: SessionRecord[];
  assessment: AssessmentResponse | null;
}

interface ActivityValue extends StoredActivity {
  loaded: boolean;
  recordSession: (session: SessionRecord) => void;
  saveAssessment: (assessment: AssessmentResponse) => void;
  practiceDays: number;
  streak: number;
  last14Days: number[];
  totalUserWords: number;
}

const storageKey = 'speakingflow.activity.v1';
const Context = createContext<ActivityValue | null>(null);

export function countEnglishWords(text: string): number {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateStreak(sessions: SessionRecord[], now = Date.now()): number {
  const active = new Set(sessions.map((session) => localDay(session.startedAt)));
  const cursor = new Date(now);
  if (!active.has(localDay(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(localDay(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function ActivityProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<StoredActivity>({ sessions: [], assessment: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (value) setState(JSON.parse(value) as StoredActivity);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const recordSession = useCallback(
    (session: SessionRecord) => {
      setState((current) => {
        if (current.sessions.some((value) => value.id === session.id)) return current;
        const next = { ...current, sessions: [...current.sessions, session].slice(-180) };
        void AsyncStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const saveAssessment = useCallback((assessment: AssessmentResponse) => {
    setState((current) => {
      const next = { ...current, assessment };
      void AsyncStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<ActivityValue>(() => {
    const days = new Set(state.sessions.map((session) => localDay(session.startedAt)));
    const last14Days = Array.from({ length: 14 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - offset));
      const day = localDay(date.getTime());
      return state.sessions
        .filter((session) => localDay(session.startedAt) === day)
        .reduce((sum, session) => sum + session.userWords, 0);
    });
    return {
      ...state,
      loaded,
      recordSession,
      saveAssessment,
      practiceDays: days.size,
      streak: calculateStreak(state.sessions),
      last14Days,
      totalUserWords: state.sessions.reduce((sum, session) => sum + session.userWords, 0),
    };
  }, [loaded, recordSession, saveAssessment, state]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActivity() {
  const value = useContext(Context);
  if (!value) throw new Error('ActivityProvider missing');
  return value;
}
