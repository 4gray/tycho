/** The Tycho wordmark (hand-drawn lowercase). Source: design/logo/tycho-wordmark-*.svg */
export function Wordmark({ height = 16 }: { height?: number }) {
  return (
    <svg height={height} viewBox="-4 14 272 120" role="img" aria-label="Tycho" className="wordmark">
      <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 28 V84 Q16 100 32 100" />
        <path d="M5 52 H30" />
        <path d="M46 52 V78 Q46 96 63 96 Q80 96 80 78 V52 V108 Q80 126 62 126 H54" />
        <path d="M138 61 A25 25 0 1 0 138 91" />
        <path d="M156 22 V100 M156 72 Q156 52 176 52 Q196 52 196 72 V100" />
        <circle cx="239" cy="76" r="25" />
      </g>
      <circle cx="256.7" cy="58.3" r="8.5" fill="url(#mark-brass)" />
    </svg>
  );
}
