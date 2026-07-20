import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type {
  LanguageMode,
  ResponseLength,
  TurnMode,
  VoicePreference,
  RecognitionLanguage,
} from '@speakingflow/shared';

export interface Settings {
  languageMode: LanguageMode;
  turnMode: TurnMode;
  responseLength: ResponseLength;
  speakingSpeed: number;
  showTranscript: boolean;
  speaker: boolean;
  voice: VoicePreference;
  recognitionLanguage: RecognitionLanguage;
}
export const defaults: Settings = {
  languageMode: 'english_hebrew_help',
  turnMode: 'push_to_talk',
  responseLength: 'short',
  speakingSpeed: 1,
  showTranscript: true,
  speaker: true,
  voice: 'female',
  recognitionLanguage: 'en',
};
const key = 'speakingflow.settings.v1';
interface Value {
  settings: Settings;
  update: (next: Partial<Settings>) => void;
  reset: () => void;
  loaded: boolean;
}
const Context = createContext<Value | null>(null);
export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((value) => {
        if (value) {
          const saved = JSON.parse(value) as Partial<Settings>;
          setSettings({
            ...defaults,
            ...saved,
            // SpeakingFlow records only after an explicit tap. This also migrates
            // installations that previously saved the always-listening mode.
            turnMode: 'push_to_talk',
            recognitionLanguage:
              saved.recognitionLanguage === 'he' ? 'he' : 'en',
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  const update = (next: Partial<Settings>) =>
    setSettings((current) => {
      const value = { ...current, ...next };
      void AsyncStorage.setItem(key, JSON.stringify(value));
      return value;
    });
  const reset = () => {
    setSettings(defaults);
    void AsyncStorage.removeItem(key);
  };
  const value = useMemo(() => ({ settings, update, reset, loaded }), [settings, loaded]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('SettingsProvider missing');
  return value;
}
