export const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: undefined },
] as const;
export type Days = (typeof RANGES)[number]['days'];

export function RangePicker({ value, onChange }: { value: Days; onChange: (d: Days) => void }) {
  return (
    <div className="filters" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button key={r.label} aria-pressed={value === r.days} onClick={() => onChange(r.days)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function HarnessPicker({ value, onChange, options }: { value?: string; onChange: (h?: string) => void; options: [string, string][] }) {
  return (
    <div className="filters" role="group" aria-label="Harness">
      <button aria-pressed={!value} onClick={() => onChange(undefined)}>All</button>
      {options.map(([k, label]) => (
        <button key={k} aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
