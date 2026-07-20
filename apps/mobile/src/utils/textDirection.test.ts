import { describe, expect, it } from 'vitest';
import { getTextDirection } from './textDirection';
describe('getTextDirection', () => {
  it('detects Hebrew', () => expect(getTextDirection('שלום world')).toBe('rtl'));
  it('detects English-first mixed text', () => expect(getTextDirection('Hello שלום')).toBe('ltr'));
});
