import type { CSSProperties } from "react";

type Variant = "kiosk-os" | "app" | "consulting-lockup";
type Tone = "light" | "dark";
type BrandSize = "sm" | "md" | "lg";

type Props = {
  variant?: Variant;
  tone?: Tone;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Product wordmarks from locked Base CI (August 2026).
 * Company = Base Consulting · Product = BaseApp · OS surface = Base Kiosk OS
 * See docs/BRAND.md — do not invent alternate lockups.
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

/** Official mark: family silhouettes + amber arc (shared by company + product). */
export function BaseMark({
  className = "",
  size = 36,
  tone = "light",
}: {
  className?: string;
  size?: number;
  tone?: Tone;
}) {
  const src = tone === "dark" ? "/brand/base-mark-dark.png" : "/brand/base-mark.png";
  return (
    <img
      className={`base-mark ${className}`.trim()}
      src={src}
      alt=""
      aria-hidden
      style={{ height: size, width: "auto" }}
    />
  );
}

/** Amber CI pill — used under BaseApp for surface / context labels. */
export function BaseAmberPill({
  children,
  tone = "light",
  className = "",
}: {
  children: string;
  tone?: Tone;
  className?: string;
}) {
  const color = tone === "dark" ? "#000000" : "#FFFFFF";
  return (
    <span className={`base-amber-pill ${className}`.trim()} style={{ color }}>
      {children}
    </span>
  );
}

const MARK_SIZE: Record<BrandSize, number> = { sm: 36, md: 52, lg: 72 };

/**
 * Product brand lockup: family mark + BaseApp, with amber context pill under BaseApp.
 * Login → badge "kiosk". App shell → Master Admin / page / shop name.
 */
export function BaseAppBrand({
  badge,
  tone = "light",
  size = "md",
  className = "",
}: {
  badge: string;
  tone?: Tone;
  size?: BrandSize;
  className?: string;
}) {
  const markSize = MARK_SIZE[size];
  return (
    <div
      className={`base-app-brand base-app-brand-${size} ${className}`.trim()}
      aria-label={`BaseApp ${badge}`}
    >
      <BaseMark size={markSize} tone={tone} className="base-app-brand-mark" />
      <div className="base-app-brand-copy">
        <BaseWordmark variant="app" tone={tone} />
        <BaseAmberPill tone={tone}>{badge}</BaseAmberPill>
      </div>
    </div>
  );
}

/**
 * BaseApp product logo — horizontal lockup PNG (family + arc | BaseApp).
 * Prefer BaseAppBrand when an amber context pill is needed.
 */
export function BaseAppLogo({
  className = "",
  width = 280,
  tone = "light",
}: {
  className?: string;
  width?: number;
  tone?: Tone;
}) {
  const src =
    tone === "dark" ? "/brand/base-app-lockup-dark.png" : "/brand/base-app-lockup.png";
  return (
    <img
      className={`base-app-logo ${className}`.trim()}
      src={src}
      width={width}
      alt="BaseApp"
      style={{ height: "auto" }}
    />
  );
}

/** @deprecated Prefer BaseAppLogo / BaseAppBrand for product surfaces */
export function BasePrimaryLogo(props: { className?: string; width?: number; tone?: Tone }) {
  return <BaseAppLogo {...props} />;
}

/** Map app route + role to the amber context pill label. */
export function contextPillLabel(input: {
  pathname: string;
  isPlatformAdmin: boolean;
  impersonating: boolean;
  shopName?: string | null;
  catalogLabel?: string;
  resourcesLabel?: string;
}): string {
  const path = input.pathname.replace(/\/+$/, "") || "/";

  if (path.startsWith("/vendors")) return "Master Admin";
  if (path.startsWith("/overview")) return input.isPlatformAdmin ? "Overview" : "Overview";
  if (path.startsWith("/pos")) return "POS";
  if (path.startsWith("/conversations")) return "Chat";
  if (path.startsWith("/bookings")) return "Bookings";
  if (path.startsWith("/customers")) return "Customers";
  if (path.startsWith("/services")) return input.catalogLabel || "Services";
  if (path.startsWith("/resources")) return input.resourcesLabel || "Resources";
  if (path.startsWith("/settings")) return "Settings";

  if (input.isPlatformAdmin) return "Master Admin";
  if (input.impersonating) return input.shopName || "Vendor";
  return input.shopName || "BaseApp";
}
