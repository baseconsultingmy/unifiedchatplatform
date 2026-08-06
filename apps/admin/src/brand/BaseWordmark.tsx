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
 * Product wordmarks from locked Base CI (Transit OS pattern for Kiosk OS).
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
      <img
        className={`base-consulting-lockup ${className}`.trim()}
        style={style}
        src="/brand/base-consulting-primary.png"
        alt="Base Consulting"
        height={compact ? 36 : 56}
      />
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

/** Official primary mark: family silhouettes + amber arc (transparent SVG). */
export function BaseMark({ className = "", size = 36 }: { className?: string; size?: number }) {
  return (
    <img
      className={`base-mark ${className}`.trim()}
      src="/brand/base-mark.svg"
      width={size}
      alt=""
      aria-hidden
      draggable={false}
      style={{ width: size, height: "auto" }}
    />
  );
}

/** Official primary BASE logo (transparent; light artwork on dark via tone). */
export function BasePrimaryLogo({
  className = "",
  width = 220,
  tone = "light",
}: {
  className?: string;
  width?: number;
  tone?: Tone;
}) {
  const src = tone === "dark" ? "/brand/base-primary-on-dark.svg" : "/brand/base-primary.svg";
  return (
    <img
      className={`base-primary-logo ${className}`.trim()}
      src={src}
      width={width}
      alt="BASE"
      style={{ height: "auto" }}
      draggable={false}
    />
  );
}
