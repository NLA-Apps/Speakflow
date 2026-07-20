import { describe, expect, it } from 'vitest';
import { calculateStreak, countEnglishWords, type SessionRecord } from './activity';

const session = (startedAt: number): SessionRecord => ({
  id: String(startedAt),
  startedAt,
  durationSeconds: 60,
  userWords: 10,
  assistantWords: 8,
  wordsPerMinute: 10,
});

describe('activity metrics', () => {
  it('counts English words without counting Hebrew', () => {
    expect(countEnglishWords("I'm learning אנגלית today")).toBe(3);
  });

  it('calculates consecutive practice days', () => {
    const now = new Date(2026, 6, 18, 12).getTime();
    expect(
      calculateStreak(
        [session(now), session(new Date(2026, 6, 17, 12).getTime())],
        now,
      ),
    ).toBe(2);
  });
});
