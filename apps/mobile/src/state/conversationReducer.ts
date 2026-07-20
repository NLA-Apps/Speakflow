import type { ConversationPhase } from '@speakingflow/shared';

export interface ConversationState {
  phase: ConversationPhase;
  error: string | null;
}
export type ConversationAction =
  { type: 'GO'; phase: ConversationPhase } | { type: 'FAIL'; message: string } | { type: 'RESET' };
const allowed: Record<ConversationPhase, ConversationPhase[]> = {
  idle: ['requesting_permission'],
  requesting_permission: ['fetching_token', 'reconnecting', 'error', 'idle'],
  fetching_token: ['connecting', 'reconnecting', 'error', 'disconnecting'],
  connecting: ['connected', 'reconnecting', 'error', 'disconnecting'],
  connected: ['listening', 'error', 'disconnecting'],
  listening: ['user_speaking', 'disconnecting', 'error'],
  user_speaking: ['waiting_for_response', 'assistant_speaking', 'disconnecting', 'error'],
  waiting_for_response: ['assistant_speaking', 'user_speaking', 'disconnecting', 'error'],
  assistant_speaking: ['listening', 'user_speaking', 'interrupting', 'disconnecting', 'error'],
  interrupting: ['listening', 'disconnecting', 'error'],
  reconnecting: ['connecting', 'error', 'disconnecting'],
  disconnecting: ['idle'],
  error: ['requesting_permission', 'reconnecting', 'disconnecting', 'idle'],
};
export const initialConversationState: ConversationState = { phase: 'idle', error: null };
export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  if (action.type === 'RESET') return initialConversationState;
  if (action.type === 'FAIL') return { phase: 'error', error: action.message };
  if (!allowed[state.phase].includes(action.phase)) return state;
  return { phase: action.phase, error: null };
}
