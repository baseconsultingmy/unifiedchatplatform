import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { shopCurrency } from "../currency";
import { industryProfile, type IndustryKey } from "../industry";
import { useT } from "../i18n";
import {
  buildOnboardingLessons,
  type OnboardingIndustry,
} from "../onboardingContent";

function storageKey(tenantId?: number | string) {
  return `baseapp.onboarding.v3.${tenantId || "shop"}`;
}

function asOnboardingIndustry(key: IndustryKey): OnboardingIndustry {
  if (key === "fnb" || key === "retail" || key === "health_beauty") return key;
  return "general";
}

export default function GuidesPage() {
  const t = useT();
  const { user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const currency = shopCurrency(user?.tenant);
  const country = (user?.tenant?.country || "MY").toUpperCase();
  const catalog = t(`industry.catalog_${profile.key}`);
  const roomsLabel = t(`industry.resources_${profile.key}`);
  const shopName = user?.tenant?.name || "your shop";
  const industry = asOnboardingIndustry(profile.key);

  const lessons = useMemo(
    () =>
      buildOnboardingLessons({
        industry,
        shopName,
        country,
        currency,
        catalogLabel: catalog,
        roomsLabel,
      }),
    [industry, shopName, country, currency, catalog, roomsLabel],
  );

  const [activeId, setActiveId] = useState(lessons[0]?.id || "welcome");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.tenant?.id));
      if (raw) {
        const parsed = JSON.parse(raw) as {
          done?: Record<string, boolean>;
          activeId?: string;
          openDetails?: Record<string, boolean>;
        };
        if (parsed.done) setDone(parsed.done);
        if (parsed.openDetails) setOpenDetails(parsed.openDetails);
        if (parsed.activeId && lessons.some((l) => l.id === parsed.activeId)) {
          setActiveId(parsed.activeId);
        }
      }
    } catch {
      /* ignore */
    }
    // hydrate once per tenant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenant?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(user?.tenant?.id),
        JSON.stringify({ done, activeId, openDetails }),
      );
    } catch {
      /* ignore */
    }
  }, [activeId, done, openDetails, user?.tenant?.id]);

  useEffect(() => {
    // When switching to LINE lesson, expand details by default for first-timers
    if (activeId === "line") {
      setOpenDetails((d) => ({ ...d, line: true }));
    }
  }, [activeId]);

  const activeIndex = Math.max(
    0,
    lessons.findIndex((l) => l.id === activeId),
  );
  const lesson = lessons[activeIndex] || lessons[0];
  const completedCount = lessons.filter((l) => done[l.id]).length;
  const progress = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const allDone = completedCount === lessons.length && lessons.length > 0;
  const detailsOpen = !!openDetails[lesson.id];

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
    setOpenDetails({});
    setActiveId(lessons[0]?.id || "welcome");
  }

  const trackLabel =
    industry === "fnb"
      ? "F&B track · Menu · POS · Orders · Grab"
      : industry === "retail"
        ? "Retail track · Products · POS"
        : "Health & Beauty track · Services · Bookings · LINE";

  return (
    <div className="guides-academy page-scroll">
      <header className={`guides-academy-hero ${pulse ? "is-pulse" : ""}`}>
        <div className="guides-academy-hero-copy">
          <p className="guides-kicker">Resources · {trackLabel}</p>
          <h1>
            Learn your shop
            <span className="guides-accent"> step by step</span>
          </h1>
          <p className="guides-lede">
            Detailed setup for <strong>{shopName}</strong>
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
              {lesson.overview.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            {lesson.details?.length ? (
              <div className="guides-details">
                <button
                  type="button"
                  className="guides-details-toggle"
                  aria-expanded={detailsOpen}
                  onClick={() =>
                    setOpenDetails((d) => ({ ...d, [lesson.id]: !d[lesson.id] }))
                  }
                >
                  {detailsOpen ? "Hide detailed steps" : "Show detailed steps (recommended)"}
                </button>
                {detailsOpen ? (
                  <div className="guides-details-list">
                    {lesson.details.map((block) => (
                      <section key={block.title} className="guides-detail-block">
                        <h3>{block.title}</h3>
                        <ol>
                          {block.steps.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                        {block.note ? <p className="guides-tip">{block.note}</p> : null}
                        {block.link ? (
                          <a
                            className="btn secondary"
                            href={block.link.href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {block.link.label}
                          </a>
                        ) : null}
                      </section>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

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
          <h3>
            {industry === "fnb"
              ? "F&B tip"
              : industry === "retail"
                ? "Retail tip"
                : "Clinic / salon tip"}
          </h3>
          <p className="muted">
            {industry === "fnb"
              ? "Menu + POS first. Grab only after walk-in sales feel easy."
              : industry === "retail"
                ? "Products + POS first. Chat channels are optional for beta."
                : "Services + artist + LINE booking is the core path for Thailand."}
          </p>
        </div>
        <div className="guides-lesson-actions">
          <a
            className="btn secondary"
            href={`/guides/booklet/index.html?industry=${industry}`}
            target="_blank"
            rel="noreferrer"
          >
            Full web guide
          </a>
          <button type="button" className="btn secondary" onClick={resetProgress}>
            Reset progress
          </button>
        </div>
      </footer>
    </div>
  );
}
