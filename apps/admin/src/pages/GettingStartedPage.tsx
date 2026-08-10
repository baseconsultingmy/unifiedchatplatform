import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { shopCurrency } from "../currency";
import { industryProfile } from "../industry";
import { useT } from "../i18n";

type Step = {
  id: string;
  title: string;
  body: string;
  to?: string;
  cta?: string;
  optional?: boolean;
};

export default function GettingStartedPage() {
  const t = useT();
  const { user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const currency = shopCurrency(user?.tenant);
  const country = (user?.tenant?.country || "MY").toUpperCase();
  const catalog = t(`industry.catalog_${profile.key}`);
  const resources = t(`industry.resources_${profile.key}`);

  const steps: Step[] = [
    {
      id: "shop",
      title: "1. Confirm shop details",
      body: `Check your shop name under Settings. Country is ${country} · prices use ${currency}. Ask BaseApp if country or category is wrong.`,
      to: "/settings",
      cta: "Open Settings",
    },
    {
      id: "catalog",
      title: `2. Add your ${catalog.toLowerCase()}`,
      body:
        profile.key === "fnb"
          ? "Add menu items with name, category, and price. You can add customisations (modifiers) after saving an item."
          : profile.key === "retail"
            ? "Add products with name, category, and price. Start with 5–15 items for beta."
            : "Add services with name, category, duration, price, and optional deposit. Start with 5–15 items.",
      to: "/services",
      cta: `Open ${catalog}`,
    },
    ...(profile.supportsResources
      ? [
          {
            id: "resources",
            title: `3. Set up ${resources.toLowerCase()}`,
            body: "Add at least one artist/therapist and a room/bay if you use stations. You will assign them on bookings.",
            to: "/resources",
            cta: `Open ${resources}`,
          } satisfies Step,
        ]
      : []),
    {
      id: "line",
      title: `${profile.supportsResources ? "4" : "3"}. Connect LINE`,
      body: "Paste Channel ID, channel secret, and channel access token from LINE Developers. Set webhook to https://api.baseapp.asia/v1/webhooks/line, then message menu or book to test.",
      to: "/settings",
      cta: "LINE in Settings",
    },
    {
      id: "whatsapp",
      title: `${profile.supportsResources ? "5" : "4"}. Connect WhatsApp (optional)`,
      body: "Copy the callback URL and verify token into Meta, then paste Phone number ID + access token here. Ask BaseApp to publish the booking Flow.",
      to: "/settings",
      cta: "WhatsApp in Settings",
      optional: true,
    },
    ...(profile.key === "fnb"
      ? [
          {
            id: "grab",
            title: "5. Connect Grab Food",
            body: "Connect Grab, finish activation, paste merchant ID if needed, then publish your menu. Orders appear under Orders.",
            to: "/settings",
            cta: "Grab in Settings",
            optional: true,
          } satisfies Step,
        ]
      : []),
    {
      id: "practice",
      title: "Practice a real flow",
      body:
        profile.opsMode === "orders"
          ? "Run a POS sale, then check Orders for Grab/delivery status changes."
          : profile.opsMode === "retail"
            ? "Ring up a product on POS with cash or QR."
            : "Create a booking and complete a POS walk-in sale so staff know both paths.",
      to: profile.opsMode === "orders" ? "/orders" : profile.opsMode === "bookings" ? "/bookings" : "/pos",
      cta: profile.opsMode === "orders" ? "Open Orders" : profile.opsMode === "bookings" ? "Open Bookings" : "Open POS",
    },
  ];

  return (
    <div className="grid page-scroll" style={{ gap: "1rem", maxWidth: 720 }}>
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>Getting started</h1>
            <p>
              Beta setup for <strong>{user?.tenant?.name || "your shop"}</strong>
              {" · "}
              {t(`industry.${profile.key}`)}
              {" · "}
              {country}/{currency}
            </p>
          </div>
          <Link to="/pos" className="btn secondary">
            Go to POS
          </Link>
        </div>

        <ol className="getting-started-list">
          {steps.map((step) => (
            <li key={step.id} className="getting-started-step">
              <div>
                <h2>
                  {step.title}
                  {step.optional ? <span className="muted"> · optional</span> : null}
                </h2>
                <p className="muted">{step.body}</p>
              </div>
              {step.to && step.cta ? (
                <Link to={step.to} className="btn secondary">
                  {step.cta}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>

        <p className="muted" style={{ marginTop: "1rem" }}>
          Full written guide for your team: ask BaseApp for the beta onboarding doc, or see{" "}
          <code>docs/BETA_ONBOARDING.md</code> in the project.
        </p>
      </section>
    </div>
  );
}
