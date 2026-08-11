import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { shopCurrency } from "../currency";
import { industryProfile } from "../industry";
import { useT } from "../i18n";

type Lesson = {
  id: string;
  title: string;
  summary: string;
  image: string;
  steps: string[];
  tip?: string;
  actions: { to?: string; href?: string; label: string; primary?: boolean; download?: boolean; external?: boolean }[];
};

function storageKey(tenantId?: number | string) {
  return `baseapp.onboarding.v2.${tenantId || "shop"}`;
}

export default function GuidesPage() {
  const t = useT();
  const { user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const currency = shopCurrency(user?.tenant);
  const country = (user?.tenant?.country || "MY").toUpperCase();
  const catalog = t(`industry.catalog_${profile.key}`);
  const roomsLabel = t(`industry.resources_${profile.key}`);
  const isFnb = profile.key === "fnb";
  const shopName = user?.tenant?.name || "your shop";

  const lessons: Lesson[] = useMemo(() => {
    const list: Lesson[] = [
      {
        id: "welcome",
        title: "Welcome to your shop",
        summary: `A 5-minute tour for ${shopName}. Finish each lesson, then jump into the real screen.`,
        image: "/guides/booklet/guide-visual-hero.png",
        steps: [
          "You’ll set prices, connect LINE, and practice one sale.",
          `This shop is ${t(`industry.${profile.key}`)} · ${country} / ${currency}.`,
          "Use Next to move through lessons — progress saves on this tablet.",
        ],
        tip: "Best on a tablet in landscape. Pull down any page later to refresh.",
        actions: [
          { href: "/guides/BaseApp-Shop-Onboarding-Booklet.pdf", label: "Download PDF booklet", download: true },
          { href: "/guides/booklet/index.html", label: "Open web booklet", external: true },
        ],
      },
      {
        id: "catalog",
        title: `Add your ${catalog.toLowerCase()}`,
        summary: "Customers and POS only see what you publish here. Start small — 5 to 15 items is enough for beta.",
        image: "/guides/booklet/guide-visual-catalog.png",
        steps:
          profile.key === "fnb"
            ? [
                `Open ${catalog} from the profile menu.`,
                "Add name, category (Food / Drinks…), and price.",
                "Optional: Customisations for ice, size, toppings.",
              ]
            : profile.key === "retail"
              ? [
                  `Open ${catalog} from the profile menu.`,
                  "Add product name, category, and price.",
                  "Save — then sell from POS.",
                ]
              : [
                  `Open ${catalog} from the profile menu.`,
                  "Add name, category, duration, price, optional deposit.",
                  "Save packages and add-ons the same way.",
                ],
        tip: "Wrong currency or shop type? Ask BaseApp Master Admin to Edit the vendor.",
        actions: [{ to: "/services", label: `Open ${catalog}`, primary: true }],
      },
    ];

    if (profile.supportsResources) {
      list.push({
        id: "rooms",
        title: `${roomsLabel} & first booking`,
        summary: "Assign artists and rooms so the day board stays conflict-free.",
        image: "/guides/booklet/booklet-step-bookings.png",
        steps: [
          `Add at least one artist/therapist under ${roomsLabel}.`,
          "Add a room/bay if you use stations.",
          "Create a practice booking: customer, service, artist, time.",
        ],
        actions: [
          { to: "/resources", label: `Open ${roomsLabel}`, primary: true },
          { to: "/bookings", label: "Open Bookings" },
        ],
      });
    }

    list.push({
      id: "line",
      title: "Connect LINE",
      summary: "Recommended for Thailand. Customers type menu or book to start booking in chat.",
      image: "/guides/booklet/guide-visual-line.png",
      steps: [
        "LINE Developers → Messaging API → copy Channel ID, secret, access token.",
        "Webhook URL: https://api.baseapp.asia/v1/webhooks/line — enable it.",
        "BaseApp Settings → LINE Messaging → paste → Save.",
        "From a personal LINE, message your OA: menu or book.",
      ],
      tip: "Chat booking works without LIFF. LIFF is optional for a mini-app.",
      actions: [{ to: "/settings", label: "Open Settings · LINE", primary: true }],
    });

    list.push({
      id: "pos",
      title: "Practice a walk-in sale",
      summary: "Ring up a real ticket so staff know the counter flow before opening day.",
      image: "/guides/booklet/guide-visual-pos.png",
      steps: [
        "Open POS and tap catalog items into the ticket.",
        "Confirm / Charge → walk-in or pick a customer.",
        "Take Cash or QR — finish the receipt.",
        ...(isFnb
          ? ["Optional later: Settings → Connect Grab → Publish menu → Orders tab."]
          : ["Optional later: WhatsApp in Settings + ask BaseApp to publish Flow."]),
      ],
      actions: [
        { to: "/pos", label: "Open POS", primary: true },
        { to: "/settings", label: "Channels in Settings" },
      ],
    });

    return list;
  }, [
    catalog,
    country,
    currency,
    isFnb,
    profile.key,
    profile.supportsResources,
    roomsLabel,
    shopName,
    t,
  ]);

  const [activeId, setActiveId] = useState(lessons[0]?.id || "welcome");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.tenant?.id));
      if (raw) {
        const parsed = JSON.parse(raw) as { done?: Record<string, boolean>; activeId?: string };
        if (parsed.done) setDone(parsed.done);
        if (parsed.activeId && lessons.some((l) => l.id === parsed.activeId)) {
          setActiveId(parsed.activeId);
        }
      }
    } catch {
      /* ignore */
    }
  }, [user?.tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- hydrate once per tenant

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(user?.tenant?.id),
        JSON.stringify({ done, activeId }),
      );
    } catch {
      /* ignore */
    }
  }, [activeId, done, user?.tenant?.id]);

  const activeIndex = Math.max(
    0,
    lessons.findIndex((l) => l.id === activeId),
  );
  const lesson = lessons[activeIndex] || lessons[0];
  const completedCount = lessons.filter((l) => done[l.id]).length;
  const progress = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const allDone = completedCount === lessons.length && lessons.length > 0;

  function go(delta: number) {
    const next = Math.min(lessons.length - 1, Math.max(0, activeIndex + delta));
    setActiveId(lessons[next].id);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 450);
  }

  function markDone(id: string) {
    setDone((d) => ({ ...d, [id]: true }));
    const idx = lessons.findIndex((l) => l.id === id);
    if (idx >= 0 && idx < lessons.length - 1) {
      window.setTimeout(() => setActiveId(lessons[idx + 1].id), 280);
    }
  }

  function resetProgress() {
    setDone({});
    setActiveId(lessons[0]?.id || "welcome");
  }

  return (
    <div className="guides-academy page-scroll">
      <header className={`guides-academy-hero ${pulse ? "is-pulse" : ""}`}>
        <div className="guides-academy-hero-copy">
          <p className="guides-kicker">Resources · Learn BaseApp</p>
          <h1>
            Learn your shop
            <span className="guides-accent"> in minutes</span>
          </h1>
          <p className="guides-lede">
            Interactive setup for <strong>{shopName}</strong>
            <span className="guides-dot">·</span>
            {t(`industry.${profile.key}`)}
            <span className="guides-dot">·</span>
            {country}/{currency}
          </p>
          <div className="guides-progress-block" aria-label={`${progress}% complete`}>
            <div className="guides-progress-meta">
              <span>
                {completedCount} of {lessons.length} lessons done
              </span>
              <strong>{progress}%</strong>
            </div>
            <div className="guides-progress-track">
              <div className="guides-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
          {allDone ? (
            <p className="guides-celebrate">You’re set — open POS and take a real customer.</p>
          ) : null}
        </div>
        <div className="guides-academy-hero-visual" aria-hidden>
          <img src="/guides/booklet/guide-visual-hero.png" alt="" />
        </div>
      </header>

      <div className="guides-academy-stage">
        <nav className="guides-lesson-rail" aria-label="Lessons">
          {lessons.map((l, i) => {
            const isActive = l.id === lesson.id;
            const isDone = !!done[l.id];
            return (
              <button
                key={l.id}
                type="button"
                className={`guides-lesson-pill ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}
                onClick={() => {
                  setActiveId(l.id);
                  setPulse(true);
                  window.setTimeout(() => setPulse(false), 450);
                }}
              >
                <span className="guides-lesson-num">{isDone ? "✓" : i + 1}</span>
                <span className="guides-lesson-label">{l.title}</span>
              </button>
            );
          })}
        </nav>

        <article className={`guides-lesson-panel ${pulse ? "is-enter" : ""}`} key={lesson.id}>
          <div className="guides-lesson-media">
            <img src={lesson.image} alt="" />
            <span className="guides-lesson-badge">
              Lesson {activeIndex + 1} / {lessons.length}
            </span>
          </div>

          <div className="guides-lesson-body">
            <h2>{lesson.title}</h2>
            <p className="guides-lesson-summary">{lesson.summary}</p>

            <ol className="guides-lesson-steps">
              {lesson.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            {lesson.tip ? <p className="guides-tip">{lesson.tip}</p> : null}

            <div className="guides-lesson-actions">
              {lesson.actions.map((a) =>
                a.to ? (
                  <Link
                    key={a.label}
                    className={`btn ${a.primary ? "" : "secondary"}`}
                    to={a.to}
                  >
                    {a.label}
                  </Link>
                ) : (
                  <a
                    key={a.label}
                    className={`btn ${a.primary ? "" : "secondary"}`}
                    href={a.href}
                    download={a.download || undefined}
                    target={a.external ? "_blank" : undefined}
                    rel={a.external ? "noreferrer" : undefined}
                  >
                    {a.label}
                  </a>
                ),
              )}
              {!done[lesson.id] ? (
                <button type="button" className="btn secondary" onClick={() => markDone(lesson.id)}>
                  Mark lesson done
                </button>
              ) : (
                <span className="guides-done-chip">Completed</span>
              )}
            </div>

            <div className="guides-lesson-nav">
              <button
                type="button"
                className="btn secondary"
                disabled={activeIndex === 0}
                onClick={() => go(-1)}
              >
                Previous
              </button>
              {activeIndex < lessons.length - 1 ? (
                <button type="button" className="btn" onClick={() => go(1)}>
                  Next lesson
                </button>
              ) : (
                <Link className="btn" to="/pos">
                  Go to POS
                </Link>
              )}
            </div>
          </div>
        </article>
      </div>

      <footer className="guides-academy-foot">
        <div>
          <h3>Need the printable booklet?</h3>
          <p className="muted">
            Same content as a PDF for staff training offline.
          </p>
        </div>
        <div className="guides-lesson-actions">
          <a
            className="btn secondary"
            href="/guides/BaseApp-Shop-Onboarding-Booklet.pdf"
            download="BaseApp-Shop-Onboarding-Booklet.pdf"
          >
            Download PDF
          </a>
          <button type="button" className="btn secondary" onClick={resetProgress}>
            Reset progress
          </button>
        </div>
      </footer>
    </div>
  );
}
