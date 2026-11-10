/**
 * Mask likely secrets before text is stored or full-text indexed. Deliberately conservative:
 * it targets well-known token formats and explicit `key = value` assignments, and keeps a short
 * prefix so a redacted value is still recognisable ("sk-ant-…").
 */
const RULES: { name: string; re: RegExp; keep?: number }[] = [
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, keep: 7 },
  { name: 'openai', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, keep: 3 },
  { name: 'github', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g, keep: 4 },
  { name: 'aws-key-id', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, keep: 4 },
  { name: 'slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, keep: 5 },
  { name: 'google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, keep: 4 },
  { name: 'stripe', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g, keep: 8 },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, keep: 3 },
  { name: 'bearer', re: /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}=*/g },
  { name: 'url-password', re: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]{3,}(@)/gi },
  {
    name: 'assignment',
    re: /\b((?:[A-Z0-9_]*_)?(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|auth)[A-Z0-9_]*["']?\s*[:=]\s*["']?)([A-Za-z0-9._~+/=-]{8,})(?![\w(])/gi,
  },
];

export const REDACTED = '[redacted]';

export function redact(text: string): string {
  let out = text;
  for (const r of RULES) {
    out = out.replace(r.re, (m: string, ...groups: unknown[]) => {
      const caps = groups.filter((g): g is string => typeof g === 'string');
      if (r.name === 'bearer') return `${caps[0]}${REDACTED}`;
      if (r.name === 'url-password') return `${caps[0]}${REDACTED}${caps[1]}`;
      if (r.name === 'assignment') {
        // `token = getToken`, `secret: process.env.X`: identifiers, not values.
        const v = caps[1] ?? '';
        const looksLikeCode =
          /^[A-Za-z_.$]+$/.test(v) || // getToken, process.env
          /^[-+]?\d[\d.]*(e[-+]?\d+)?$/i.test(v) || // 1.25e-06
          /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(v) || // excluded.cache_write_1h_tokens
          /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v); // snake_case_name
        return looksLikeCode ? m : `${caps[0]}${REDACTED}`;
      }
      return r.keep ? `${m.slice(0, r.keep)}…${REDACTED}` : REDACTED;
    });
  }
  return out;
}
