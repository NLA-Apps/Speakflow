import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
export interface Diagnostics {
  connectionState: string;
  iceState: string;
  signalingState: string;
  microphonePermission: string;
  audioRoute: string;
  tokenLatencyMs: number | null;
  connectLatencyMs: number | null;
  firstAudioLatencyMs: number | null;
  firstTranscriptLatencyMs: number | null;
  reconnectCount: number;
  lastError: string | null;
  model: string;
}
export const emptyDiagnostics: Diagnostics = {
  connectionState: 'disconnected',
  iceState: 'new',
  signalingState: 'stable',
  microphonePermission: 'undetermined',
  audioRoute: 'system default',
  tokenLatencyMs: null,
  connectLatencyMs: null,
  firstAudioLatencyMs: null,
  firstTranscriptLatencyMs: null,
  reconnectCount: 0,
  lastError: null,
  model: 'gpt-realtime',
};
const Context = createContext<{
  data: Diagnostics;
  update: (next: Partial<Diagnostics>) => void;
  clear: () => void;
} | null>(null);
export function DiagnosticsProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState(emptyDiagnostics);
  const update = useCallback(
    (next: Partial<Diagnostics>) => setData((current) => ({ ...current, ...next })),
    [],
  );
  const clear = useCallback(() => setData(emptyDiagnostics), []);
  const value = useMemo(() => ({ data, update, clear }), [clear, data, update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDiagnostics() {
  const value = useContext(Context);
  if (!value) throw new Error('DiagnosticsProvider missing');
  return value;
}
