// Refresh the bundled LiteLLM price snapshot (build-time only; the app never fetches this on its own).
// Usage: node scripts/update-prices.mjs
import { writeFileSync } from 'node:fs';

const SRC = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const FIELDS = [
  'input_cost_per_token', 'output_cost_per_token', 'cache_read_input_token_cost', 'cache_creation_input_token_cost',
  'input_cost_per_token_above_200k_tokens', 'output_cost_per_token_above_200k_tokens',
  'cache_read_input_token_cost_above_200k_tokens', 'cache_creation_input_token_cost_above_200k_tokens',
  'cache_creation_input_token_cost_above_1hr',
];
const all = await (await fetch(SRC)).json();
const out = {};
for (const [k, v] of Object.entries(all).sort()) {
  if (!v || typeof v !== 'object' || v.input_cost_per_token == null) continue;
  if (v.mode && v.mode !== 'chat' && v.mode !== 'responses') continue;
  out[k] = Object.fromEntries(FIELDS.filter((f) => v[f] != null).map((f) => [f, v[f]]));
}
writeFileSync(new URL('../packages/core/src/pricing/litellm-snapshot.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${Object.keys(out).length} models`);
