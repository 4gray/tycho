import { describe, expect, it } from 'vitest';
import { computeCost, resolveModel, type PriceTable } from './index';

const table: PriceTable = {
  'claude-sonnet-4-5': { input_cost_per_token: 3e-6, output_cost_per_token: 15e-6, cache_read_input_token_cost: 3e-7, cache_creation_input_token_cost: 3.75e-6, input_cost_per_token_above_200k_tokens: 6e-6 },
  'openai/gpt-x': { input_cost_per_token: 1e-6 },
};

describe('pricing', () => {
  it('resolves dated, bracketed and provider-prefixed ids', () => {
    expect(resolveModel('claude-sonnet-4-5-20250929', table)).toBe('claude-sonnet-4-5');
    expect(resolveModel('claude-sonnet-4-5[1m]', table)).toBe('claude-sonnet-4-5');
    expect(resolveModel('gpt-x', table)).toBe('openai/gpt-x');
    expect(resolveModel('nope', table)).toBeUndefined();
    expect(resolveModel('mine', table, { mine: 'gpt-x' })).toBe('openai/gpt-x');
    expect(resolveModel('claude-4.5-sonnet-thinking', table)).toBe('claude-sonnet-4-5');
    expect(resolveModel('claude-4.5-sonnet-high-thinking', table)).toBe('claude-sonnet-4-5');
  });

  it('sums all four token kinds', () => {
    const c = computeCost('claude-sonnet-4-5', { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 10_000, cacheWriteTokens: 2000 }, table);
    expect(c).toBeCloseTo(1000 * 3e-6 + 100 * 15e-6 + 10_000 * 3e-7 + 2000 * 3.75e-6);
  });

  it('prices 1-hour cache writes separately', () => {
    const t: PriceTable = { m: { input_cost_per_token: 0, cache_creation_input_token_cost: 5e-6, cache_creation_input_token_cost_above_1hr: 8e-6 } };
    const c = computeCost('m', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1000, cacheWrite1hTokens: 600 }, t);
    expect(c).toBeCloseTo(400 * 5e-6 + 600 * 8e-6);
  });

  it('applies the above-200k tier only to the excess', () => {
    const c = computeCost('claude-sonnet-4-5', { inputTokens: 250_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, table);
    expect(c).toBeCloseTo(200_000 * 3e-6 + 50_000 * 6e-6);
  });

  it('knows the bundled current models', () => {
    expect(resolveModel('claude-opus-5-5')).toBe('claude-opus-5-5');
  });
});
