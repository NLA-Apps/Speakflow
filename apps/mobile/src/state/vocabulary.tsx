import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { TranslationResponse } from '@speakingflow/shared';

export interface SavedWord extends TranslationResponse {
  id: string;
  savedAt: number;
}

interface VocabularyValue {
  words: SavedWord[];
  toggle: (translation: TranslationResponse) => void;
  isSaved: (source: string) => boolean;
}

const storageKey = 'speakingflow.vocabulary.v1';
const Context = createContext<VocabularyValue | null>(null);

export function VocabularyProvider({ children }: PropsWithChildren) {
  const [words, setWords] = useState<SavedWord[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (value) setWords(JSON.parse(value) as SavedWord[]);
      })
      .catch(() => undefined);
  }, []);

  const toggle = (translation: TranslationResponse) => {
    setWords((current) => {
      const normalized = translation.source.toLocaleLowerCase();
      const exists = current.some((word) => word.source.toLocaleLowerCase() === normalized);
      const next = exists
        ? current.filter((word) => word.source.toLocaleLowerCase() !== normalized)
        : [
            {
              ...translation,
              id: `${normalized}-${Date.now()}`,
              savedAt: Date.now(),
            },
            ...current,
          ];
      void AsyncStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo(
    () => ({
      words,
      toggle,
      isSaved: (source: string) =>
        words.some((word) => word.source.toLocaleLowerCase() === source.toLocaleLowerCase()),
    }),
    [words],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVocabulary() {
  const value = useContext(Context);
  if (!value) throw new Error('VocabularyProvider missing');
  return value;
}
