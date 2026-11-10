import { describe, expect, it } from 'vitest';
import { redact } from './redact';

// Synthetic, format-valid strings only; none of these are real credentials.
const fake = (prefix: string, n: number) => prefix + 'A1b2C3d4E5'.repeat(Math.ceil(n / 10)).slice(0, n);

describe('redact', () => {
  it.each([
    [fake('sk-ant-api03-', 40), 'sk-ant-…[redacted]'],
    [fake('ghp_', 36), 'ghp_…[redacted]'],
    ['AKIAABCDEFGHIJKLMNOP', 'AKIA…[redacted]'],
    [`Authorization: Bearer ${fake('', 32)}`, 'Authorization: Bearer [redacted]'],
    [`OPENAI_API_KEY=${fake('', 24)}`, 'OPENAI_API_KEY=[redacted]'],
    [`"password": "${fake('', 12)}"`, '"password": "[redacted]"'],
    ['postgres://app:hunter2secret@db:5432/x', 'postgres://app:[redacted]@db:5432/x'],
    ['-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----', '[redacted]'],
  ])('masks %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('leaves ordinary code and prose alone', () => {
    const text = 'token_cost: 1.25e-06\nSET cache_write_1h_tokens = excluded.cache_write_1h_tokens\nconst token = getToken();\npassword reset flow\nsk-learn is great\nUse the auth middleware';
    expect(redact(text)).toBe(text);
  });
});
