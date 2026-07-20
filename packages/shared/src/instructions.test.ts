import { describe, expect, it } from 'vitest';
import { buildCoachInstructions } from './instructions.js';

describe('buildCoachInstructions', () => {
  it('adds Hebrew guidance for the default mode', () => {
    expect(buildCoachInstructions('english_hebrew_help', 'short')).toContain('in Hebrew');
  });
  it('enforces English-only mode', () => {
    expect(buildCoachInstructions('english_only', 'normal')).toContain('only English');
  });
  it('requires live search for changing facts', () => {
    expect(buildCoachInstructions('mixed', 'short')).toContain('search_current_information');
  });
});
