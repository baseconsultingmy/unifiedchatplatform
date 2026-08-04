import type { CSSProperties } from "react";

type Variant = "kiosk-os" | "app" | "simplified" | "consulting-lockup";
type Tone = "light" | "dark";

type Props = {
  variant?: Variant;
  tone?: Tone;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Product wordmarks from locked Base CI.
 * - simplified: BASE with amber arc (CI sheet)
 * - kiosk-os: BASE | Kiosk [OS] (Transit OS pattern)
 */
export function BaseWordmark({
  variant = "kiosk-os",
  tone = "light",
  compact = false,
  className = "",
  style,
}: Props) {
  const onDark = tone === "dark";
  const baseColor = onDark ? "#FFFFFF" : "var(--base-navy)";
  const secondaryColor = onDark ? "#94A3B8" : "var(--base-grey)";
  const dividerColor = onDark ? "#64748B" : "#94A3B8";
  const badgeFg = onDark ? "#000000" : "#FFFFFF";
  const arcColor = "var(--base-amber)";

  if (variant === "simplified") {
    return (
      <span
        className={`base-wordmark base-wordmark-simplified ${compact ? "is-compact" : ""} ${className}`.trim()}
        style={style}
        aria-label="BASE"
      >
        <span className="base-wordmark-arc" style={{ borderColor: arcColor }} aria-hidden />
        <span className="base-wordmark-base" style={{ color: baseColor }}>
          BASE
        </span>
      </span>
    );
  }

  if (variant === "app") {
    return (
      <span
        className={`base-wordmark base-wordmark-app ${compact ? "is-compact" : ""} ${className}`.trim()}
        style={style}
        aria-label="BaseApp"
      >
        <span className="base-wordmark-base" style={{ color: baseColor }}>
          BASE
        </span>
        <span className="base-wordmark-secondary" style={{ color: secondaryColor }}>
          App
        </span>
      </span>
    );
  }

  if (variant === "consulting-lockup") {
    return (
      <span
        className={`base-wordmark base-wordmark-consulting ${compact ? "is-compact" : ""} ${className}`.trim()}
        style={style}
        aria-label="Base Consulting"
      >
        <span className="base-wordmark-base" style={{ color: baseColor }}>
          BASE
        </span>
        <span className="base-wordmark-descriptor" style={{ color: secondaryColor }}>
          CONSULTING
        </span>
      </span>
    );
  }

  return (
    <span
      className={`base-wordmark base-wordmark-kiosk ${compact ? "is-compact" : ""} ${className}`.trim()}
      style={style}
      aria-label="Base Kiosk OS"
    >
      <span className="base-wordmark-base" style={{ color: baseColor }}>
        BASE
      </span>
      <span className="base-wordmark-divider" style={{ background: dividerColor }} aria-hidden />
      <span className="base-wordmark-secondary" style={{ color: secondaryColor }}>
        Kiosk
      </span>
      <span className="base-wordmark-os" style={{ color: badgeFg }}>
        {onDark ? "os" : "OS"}
      </span>
    </span>
  );
}

/** Primary logo graphic: family silhouettes + amber arc (no wordmark). */
export function BaseMark({ className = "", size = 36 }: { className?: string; size?: number }) {
  return (
    <img
      className={`base-mark ${className}`.trim()}
      src="/brand/base-mark.svg"
      width={size}
      height={Math.round(size * (160 / 280))}
      alt=""
      aria-hidden
    />
  );
}

/** Full primary BASE logo (family + arc + BASE). CONSULTING omitted. */
export function BasePrimaryLogo({
  className = "",
  width = 220,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <img
      className={`base-primary-logo ${className}`.trim()}
      src="/brand/base-primary.svg"
      width={width}
      height={Math.round(width * (260 / 360))}
      alt="BASE"
    />
  );
}

/** Simplified CI logo: amber arc over BASE. */
export function BaseSimplifiedLogo({
  className = "",
  width = 200,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <img
      className={`base-simplified-logo ${className}`.trim()}
      src="/brand/base-simplified.svg"
      width={width}
      height={Math.round(width * (120 / 320))}
      alt="BASE"
    />
  );
}
