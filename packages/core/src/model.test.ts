import { describe, expect, it } from 'vitest';
import { UsageEvent } from './model';

describe('UsageEvent schema', () => {
  it('rejects negative token counts and unknown provenance', () => {
    const base = { id: 'x', sessionId: 's', timestamp: 't', model: 'm', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costSource: 'computed' };
    expect(UsageEvent.safeParse(base).success).toBe(true);
    expect(UsageEvent.safeParse({ ...base, inputTokens: -1 }).success).toBe(false);
    expect(UsageEvent.safeParse({ ...base, costSource: 'guess' }).success).toBe(false);
  });
});
