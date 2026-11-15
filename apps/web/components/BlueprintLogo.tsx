import { t } from "../i18n";

/**
 * Rosmarin-style geometric logo: hairline square frame + corner ticks +
 * five-petal myosotis (forget-me-not) line drawing. Used on login and
 * empty states in place of the raw emoji.
 */
export default function BlueprintLogo({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="blueprint-logo"
      aria-hidden
    >
      {/* frame with corner ticks */}
      <rect x="4" y="4" width="56" height="56" stroke="var(--border)" strokeWidth="1" />
      <rect x="4" y="4" width="6" height="6" fill="var(--accent)" stroke="none" opacity="0.9" />
      <rect x="54" y="54" width="6" height="6" fill="var(--border-strong)" stroke="none" />
      {/* five petals: myosotis rotational symmetry */}
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="32"
          cy="19"
          rx="6.5"
          ry="11"
          transform={`rotate(${a} 32 32)`}
          stroke="var(--accent)"
          strokeWidth="1.4"
        />
      ))}
      {/* center disc */}
      <circle cx="32" cy="32" r="4.5" fill="var(--accent)" stroke="none" />
      {/* stem + leaf */}
      <path d="M32 36.5V56" stroke="var(--text-3)" strokeWidth="1.4" />
      <path d="M32 47c-6 0-9-3-10-7 5 0 8.5 2 10 7Z" stroke="var(--text-3)" strokeWidth="1.3" />
    </svg>
  );
}
