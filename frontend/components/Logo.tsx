import clsx from "clsx";

/**
 * CARGOX mark — the supplied "pitched C" logo, rebuilt as a vector so it stays
 * crisp at every size and can be inverted without a raster asset.
 * `variant="solid"` renders the mark in one colour (the supplied artwork is white
 * on black); `variant="ink"` tints it for light surfaces.
 */
export function PitchMark({
  size = 34,
  color = "#171717",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* upper arm of the C (pitched like a racing stripe) */}
      <path d="M56 8h20l10 17-12 20-6-10-12-20z" fill={color} />
      {/* lower arm of the C */}
      <path d="M56 92h20l10-17-12-20-6 10-12 20z" fill={color} />
      {/* main chevron body */}
      <path
        d="M6 50 44 14h16L26 50l34 36H44L6 50Z"
        fill={color}
      />
      {/* inner notch keeping the mark hollow */}
      <path d="M30 50 46 34h12L44 50l14 16H46L30 50Z" fill="#000" opacity="0" />
    </svg>
  );
}

export default function Logo({
  size = 34,
  tone = "dark",
  showWord = true,
  subtitle,
  className,
}: {
  /** dark = for light surfaces (near-black word) · light = for dark surfaces */
  tone?: "light" | "dark";
  size?: number;
  showWord?: boolean;
  subtitle?: string;
  className?: string;
}) {
  const markColor = tone === "dark" ? "#171717" : "#FFFFFF";
  const wordColor = tone === "dark" ? "#171717" : "#FFFFFF";
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <PitchMark size={size} color={markColor} />
      {showWord && (
        <span className="leading-none">
          <span
            className="block text-[16px] font-semibold tracking-[-0.01em]"
            style={{ color: wordColor }}
          >
            cargo<span className="font-bold">X</span>
          </span>
          {subtitle && (
            <span
              className="mt-1 block text-[8.5px] font-medium uppercase tracking-[0.18em]"
              style={{ color: tone === "dark" ? "#8A8A8A" : "rgba(255,255,255,.55)" }}
            >
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function LogoMark({ size = 34, tone = "dark" }: { size?: number; tone?: "light" | "dark" }) {
  return <PitchMark size={size} color={tone === "dark" ? "#171717" : "#FFFFFF"} />;
}

export function RolePill({ role, className }: { role: string; className?: string }) {
  const map: Record<string, string> = {
    sender: "bg-accent-50 text-ink border-accent",
    transporter: "bg-blue-50 text-blue-700 border-blue-200",
    admin: "bg-accent text-ink border-accent",
  };
  return (
    <span className={clsx("chip", map[role] || "border-line bg-soft text-ink-muted", className)}>
      {role.toUpperCase()}
    </span>
  );
}
