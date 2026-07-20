import { expect, it } from 'vitest';
import { conversationReducer, initialConversationState } from './conversationReducer';
it('accepts valid transitions', () =>
  expect(
    conversationReducer(initialConversationState, { type: 'GO', phase: 'requesting_permission' })
      .phase,
  ).toBe('requesting_permission'));
it('blocks invalid transitions', () =>
  expect(
    conversationReducer(initialConversationState, { type: 'GO', phase: 'assistant_speaking' }),
  ).toEqual(initialConversationState));
