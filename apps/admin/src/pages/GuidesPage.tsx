import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { shopCurrency } from "../currency";
import { industryProfile } from "../industry";
import { useT } from "../i18n";

type GuideCard = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  download?: boolean;
  external?: boolean;
  fnbOnly?: boolean;
  image?: string;
};

const GUIDES: GuideCard[] = [
  {
    id: "booklet-pdf",
    title: "Shop Onboarding Booklet (PDF)",
    body: "Illustrated multi-page booklet with cover art and detailed steps for login, catalog, rooms & staff, LINE, WhatsApp, Grab, and your first sale.",
    href: "/guides/BaseApp-Shop-Onboarding-Booklet.pdf",
    cta: "Download PDF",
    download: true,
    image: "/guides/booklet/booklet-cover.png",
  },
  {
    id: "booklet-web",
    title: "Booklet (open in browser)",
    body: "Same booklet as a web page — handy on a tablet without saving a file.",
    href: "/guides/booklet/index.html",
    cta: "Open booklet",
    external: true,
    image: "/guides/booklet/booklet-checklist.png",
  },
];

export default function GuidesPage() {
  const t = useT();
  const { user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const currency = shopCurrency(user?.tenant);
  const country = (user?.tenant?.country || "MY").toUpperCase();
  const catalog = t(`industry.catalog_${profile.key}`);
  const roomsLabel = t(`industry.resources_${profile.key}`);
  const isFnb = profile.key === "fnb";

  const setupLinks = [
    { to: "/settings", label: "Settings · shop / LINE / WhatsApp" },
    { to: "/services", label: catalog },
    ...(profile.supportsResources
      ? [{ to: "/resources", label: roomsLabel }]
      : []),
    { to: "/pos", label: "POS" },
    ...(profile.opsMode === "bookings"
      ? [{ to: "/bookings", label: "Bookings" }]
      : []),
    ...(profile.opsMode === "orders" ? [{ to: "/orders", label: "Orders" }] : []),
    { to: "/getting-started", label: "Quick checklist" },
  ];

  return (
    <div className="grid page-scroll guides-app" style={{ gap: "1rem" }}>
      <section className="panel guides-hero">
        <div className="bookings-toolbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Resources
            </p>
            <h1>Setup guides for your store</h1>
            <p>
              Download the onboarding booklet and follow the detailed steps. Built for{" "}
              <strong>{user?.tenant?.name || "your shop"}</strong>
              {" · "}
              {t(`industry.${profile.key}`)}
              {" · "}
              {country}/{currency}
            </p>
          </div>
          <a
            className="btn"
            href="/guides/BaseApp-Shop-Onboarding-Booklet.pdf"
            download="BaseApp-Shop-Onboarding-Booklet.pdf"
          >
            Download booklet PDF
          </a>
        </div>
        <img
          className="guides-hero-image"
          src="/guides/booklet/booklet-cover.png"
          alt="BaseApp onboarding booklet cover"
        />
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Downloads</h2>
        <div className="guides-grid">
          {GUIDES.filter((g) => !g.fnbOnly || isFnb).map((g) => (
            <article key={g.id} className="guides-card">
              {g.image ? (
                <img src={g.image} alt="" className="guides-card-image" />
              ) : null}
              <div className="guides-card-body">
                <h3>{g.title}</h3>
                <p className="muted">{g.body}</p>
                {g.download ? (
                  <a className="btn secondary" href={g.href} download>
                    {g.cta}
                  </a>
                ) : (
                  <a
                    className="btn secondary"
                    href={g.href}
                    target={g.external ? "_blank" : undefined}
                    rel={g.external ? "noreferrer" : undefined}
                  >
                    {g.cta}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Step-by-step (with pictures)</h2>
        <div className="guides-chapters">
          <article className="guides-chapter">
            <img src="/guides/booklet/booklet-step-login.png" alt="Sign in" />
            <div>
              <h3>1. Sign in</h3>
              <ol>
                <li>
                  Open <code>https://admin.baseapp.asia/login</code>
                </li>
                <li>Enter the email + temporary password BaseApp sent you</li>
                <li>
                  Tap <strong>Sign in</strong> — you land on POS
                </li>
              </ol>
            </div>
          </article>

          <article className="guides-chapter">
            <img src="/guides/booklet/booklet-step-catalog.png" alt="Catalog setup" />
            <div>
              <h3>2. Upload {catalog.toLowerCase()}</h3>
              <ol>
                <li>
                  Profile → <strong>{catalog}</strong>
                </li>
                <li>Add name, category, and price (plus duration/deposit for services)</li>
                <li>Start with 5–15 items for beta</li>
              </ol>
              <Link className="btn secondary" to="/services">
                Open {catalog}
              </Link>
            </div>
          </article>

          {profile.supportsResources ? (
            <article className="guides-chapter">
              <img src="/guides/booklet/booklet-step-bookings.png" alt="Bookings" />
              <div>
                <h3>3. Rooms, staff &amp; bookings</h3>
                <ol>
                  <li>
                    Profile → <strong>{roomsLabel}</strong> — add artist + room/bay
                  </li>
                  <li>
                    Open <strong>Bookings → New</strong> for a practice appointment
                  </li>
                </ol>
                <div className="btn-row">
                  <Link className="btn secondary" to="/resources">
                    Open {roomsLabel}
                  </Link>
                  <Link className="btn secondary" to="/bookings">
                    Open Bookings
                  </Link>
                </div>
              </div>
            </article>
          ) : null}

          <article className="guides-chapter" id="line-setup">
            <img src="/guides/booklet/booklet-step-line.png" alt="LINE setup" />
            <div>
              <h3>{profile.supportsResources ? "4" : "3"}. Connect LINE</h3>
              <ol>
                <li>
                  In LINE Developers, copy Channel ID, secret, and long-lived access token
                </li>
                <li>
                  Webhook URL: <code>https://api.baseapp.asia/v1/webhooks/line</code> — enable it
                </li>
                <li>
                  BaseApp → <strong>Settings → LINE Messaging</strong> → paste → Save
                </li>
                <li>
                  From LINE, message your OA with <strong>menu</strong> or <strong>book</strong>
                </li>
              </ol>
              <Link className="btn secondary" to="/settings">
                Open Settings
              </Link>
            </div>
          </article>

          <article className="guides-chapter" id="whatsapp-setup">
            <img src="/guides/booklet/booklet-step-pos.png" alt="POS practice" />
            <div>
              <h3>Practice a sale (+ optional WhatsApp / Grab)</h3>
              <ol>
                <li>
                  <strong>POS</strong> → tap items → Charge → Cash or QR
                </li>
                <li id="grab-setup">
                  WhatsApp: Settings → copy Meta webhook values → paste Phone number ID + token → ask
                  BaseApp to publish Flow
                </li>
                {isFnb ? (
                  <li>Grab: Settings → Connect Grab → publish menu → manage under Orders</li>
                ) : null}
              </ol>
              <div className="btn-row">
                <Link className="btn" to="/pos">
                  Open POS
                </Link>
                <Link className="btn secondary" to="/settings">
                  Channels in Settings
                </Link>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Jump into the app</h2>
        <div className="btn-row" style={{ flexWrap: "wrap" }}>
          {setupLinks.map((l) => (
            <Link key={l.to} className="btn secondary" to={l.to}>
              {l.label}
            </Link>
          ))}
        </div>
        <p className="muted" style={{ marginTop: "0.85rem" }}>
          Need help? Send BaseApp a screenshot and what you tapped. Master Admin can use{" "}
          <strong>View as</strong> to assist without your password.
        </p>
      </section>
    </div>
  );
}
