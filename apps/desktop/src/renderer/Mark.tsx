/** The Tycho mark (mural quadrant), drawn inline so it stays crisp at any size. Source: design/logo/tycho-mark.svg */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="16 17 68 68" aria-hidden="true" className="mark">
      <defs>
        <linearGradient id="mark-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6c992" />
          <stop offset=".55" stopColor="#c9a46a" />
          <stop offset="1" stopColor="#a7834b" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#mark-brass)" strokeLinecap="round">
        <path d="M24 23 A54 54 0 0 1 78 77" strokeWidth="6.5" />
        <path d="M24 77 L56.7 35.2" strokeWidth="4.5" />
        <circle cx="24" cy="77" r="6" fill="url(#mark-brass)" stroke="none" />
        <circle cx="57.2" cy="34.4" r="9" fill="url(#mark-brass)" stroke="none" />
      </g>
    </svg>
  );
}
