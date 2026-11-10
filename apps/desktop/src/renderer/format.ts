export const usd = (n: number) => `$${n.toFixed(2)}`;
export const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

export const HARNESS: Record<string, { label: string; color: string }> = {
  'claude-code': { label: 'Claude', color: 'var(--claude)' },
  opencode: { label: 'OpenCode', color: 'var(--opencode)' },
  cursor: { label: 'Cursor', color: 'var(--cursor)' },
};
export const harness = (h: string) => HARNESS[h] ?? { label: h, color: 'var(--fg-3)' };

export const STAMP = {
  reported: { code: 'R', title: 'Reported by the harness' },
  computed: { code: 'C', title: 'Computed from the price table' },
  estimated: { code: 'E', title: 'Estimated' },
} as const;

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
export const span = (a: string, b: string) => `${time.format(new Date(a))}–${time.format(new Date(b))}`;
