import { expect, it } from 'vitest';
import { latencyBetween } from './latency';
it('calculates valid latency', () => expect(latencyBetween(100, 1350)).toBe(1250));
it('rejects reversed timestamps', () => expect(latencyBetween(200, 100)).toBeNull());
