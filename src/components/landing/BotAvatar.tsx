/**
 * The assistant's face.
 *
 * A drawn robot rather than the abstract orb: on a landing page the right-hand column has
 * to say "this is an assistant you talk to" in the half-second before anyone reads the
 * headline, and a pulsing circle does not say that.
 *
 * Pure SVG with no asset and no network, so it cannot fail the way the 3D scene slot did.
 * `currentColor` drives the visor and antenna, so it inherits whatever the caller sets.
 */
export function BotAvatar({
  size = 44,
  thinking = false,
  className,
}: {
  size?: number;
  /** Narrows the eyes and lights the antenna, for the moment a reply is being composed. */
  thinking?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-hidden
    >
      {/* Antenna. The bulb is the only part that changes with `thinking`, which keeps the
          state readable at 20px as well as at 72px. */}
      <line x1="24" y1="4.5" x2="24" y2="9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <circle cx="24" cy="3.6" r="2.4" fill="currentColor" opacity={thinking ? 1 : 0.5} />

      {/* Head. */}
      <rect
        x="8.5"
        y="9.5"
        width="31"
        height="25"
        rx="9"
        fill="var(--color-glass-strong, rgba(255,255,255,0.06))"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.55"
      />

      {/* Visor: the dark band the eyes sit in, so they read as eyes and not as dots. */}
      <rect x="13" y="15" width="22" height="12.5" rx="6.25" fill="currentColor" fillOpacity="0.14" />

      {/* Eyes. Rounded caps mean the "blink" can be done by shortening the line. */}
      <g stroke="currentColor" strokeWidth={thinking ? 2.6 : 3.4} strokeLinecap="round">
        <line x1="19" y1={thinking ? 21.2 : 19.6} x2="19" y2={thinking ? 21.8 : 23.4} />
        <line x1="29" y1={thinking ? 21.2 : 19.6} x2="29" y2={thinking ? 21.8 : 23.4} />
      </g>

      {/* Ears / side modules, and the neck the head sits on. */}
      <rect x="5" y="18" width="3.2" height="8" rx="1.6" fill="currentColor" opacity="0.4" />
      <rect x="39.8" y="18" width="3.2" height="8" rx="1.6" fill="currentColor" opacity="0.4" />
      <path d="M17 34.5h14v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4v-3Z" fill="currentColor" opacity="0.22" />
    </svg>
  );
}
