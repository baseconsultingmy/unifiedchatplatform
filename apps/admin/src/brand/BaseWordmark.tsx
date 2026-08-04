import type { CSSProperties } from "react";

type Variant = "kiosk-os" | "app" | "consulting-lockup";
type Tone = "light" | "dark";

type Props = {
  variant?: Variant;
  tone?: Tone;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Product wordmarks following locked Base CI + Transit OS horizontal pattern.
 * BASE (navy/white) · secondary (grey) · optional amber OS badge.
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
        <span
          className="base-wordmark-descriptor"
          style={{ color: secondaryColor }}
        >
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

export function BaseMark({ className = "", size = 36 }: { className?: string; size?: number }) {
  return (
    <img
      className={`base-mark ${className}`.trim()}
      src="/brand/base-mark.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden
    />
  );
}
