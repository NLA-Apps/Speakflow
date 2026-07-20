export interface RealtimeEvent {
  type: string;
  item_id?: string;
  response_id?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
  response?: {
    id?: string;
    output?: {
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }[];
  };
}
export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value && 'type' in value && typeof value.type === 'string')
      return value as RealtimeEvent;
  } catch {
    return null;
  }
  return null;
}
