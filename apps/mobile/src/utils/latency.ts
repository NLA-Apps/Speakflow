export function latencyBetween(start?: number, end?: number): number | null {
  if (start === undefined || end === undefined || end < start) return null;
  return end - start;
}
export function formatLatency(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)} שנ׳`;
}
