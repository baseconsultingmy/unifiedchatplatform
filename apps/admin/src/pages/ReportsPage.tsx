import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { industryProfile } from "../industry";

type PeriodKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "last_month"
  | "year"
  | "custom";

const PRESETS: { key: PeriodKey; labelKey: string }[] = [
  { key: "today", labelKey: "reports.today" },
  { key: "yesterday", labelKey: "reports.yesterday" },
  { key: "7d", labelKey: "reports.days7" },
  { key: "30d", labelKey: "reports.days30" },
  { key: "month", labelKey: "reports.thisMonth" },
  { key: "last_month", labelKey: "reports.lastMonth" },
  { key: "year", labelKey: "reports.thisYear" },
  { key: "custom", labelKey: "reports.custom" },
];

function money(currency: string, value: number) {
  try {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: currency || "MYR",
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${currency || "MYR"} ${(value || 0).toFixed(2)}`;
  }
}

export default function ReportsPage() {
  const t = useT();
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [grain, setGrain] = useState<"auto" | "day" | "month">("auto");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (period === "custom" && (!customFrom || !customTo)) return;
    setBusy(true);
    setError("");
    api
      .salesReport(token, {
        period,
        from: period === "custom" ? customFrom : undefined,
        to: period === "custom" ? customTo : undefined,
        grain: grain === "auto" ? undefined : grain,
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load report"))
      .finally(() => setBusy(false));
  }, [token, period, customFrom, customTo, grain]);

  const maxCollected = useMemo(() => {
    if (!data?.series?.length) return 1;
    return Math.max(1, ...data.series.map((r: any) => Number(r.collected) || 0));
  }, [data]);

  const channelMax = useMemo(() => {
    if (!data?.channels?.length) return 1;
    return Math.max(1, ...data.channels.map((r: any) => Number(r.collected) || 0));
  }, [data]);

  function deltaLabel(pct: number | null | undefined) {
    if (pct == null || Number.isNaN(pct)) return null;
    const sign = pct > 0 ? "+" : "";
    return t("reports.vsPrior", { pct: `${sign}${pct.toFixed(1)}` });
  }

  return (
    <div className="reports-app page-fill">
      <header className="reports-chrome">
        <div className="reports-head">
          <div>
            <h1>{t("reports.title")}</h1>
            <p className="muted reports-subtitle">
              {profile.key === "fnb" ? t("reports.subtitle") : t("reports.subtitleWellness")}
            </p>
          </div>
          {data ? (
            <div className="reports-range muted">
              {data.from_date === data.to_date
                ? data.series?.[0]?.label || data.from_date
                : `${data.from_date} → ${data.to_date}`}
              <span>· {data.timezone}</span>
            </div>
          ) : null}
        </div>

        <div className="reports-toolbar">
          <div className="reports-presets" role="tablist" aria-label="Report period">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={period === p.key}
                className={`reports-preset ${period === p.key ? "on" : ""}`}
                onClick={() => setPeriod(p.key)}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
          <div className="reports-grain">
            <label>
              {t("reports.groupBy")}
              <select
                value={grain}
                onChange={(e) => setGrain(e.target.value as "auto" | "day" | "month")}
              >
                <option value="auto">{t("reports.auto")}</option>
                <option value="day">{t("reports.day")}</option>
                <option value="month">{t("reports.month")}</option>
              </select>
            </label>
          </div>
        </div>

        {period === "custom" ? (
          <div className="reports-custom panel">
            <label>
              {t("reports.from")}
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              {t("reports.to")}
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}
      </header>

      <div className="reports-body">
        {busy && !data ? (
          <div className="reports-empty muted">{t("reports.loading")}</div>
        ) : null}

        {data ? (
          <>
            <div className="reports-stats">
              <div className="panel stat">
                <span className="muted">{t("reports.collected")}</span>
                <strong>{money(data.currency, data.collected)}</strong>
                {deltaLabel(data.collected_delta_pct) ? (
                  <span
                    className={`reports-delta ${
                      (data.collected_delta_pct || 0) >= 0 ? "up" : "down"
                    }`}
                  >
                    {deltaLabel(data.collected_delta_pct)}
                  </span>
                ) : (
                  <span className="muted reports-delta">{t("reports.noPrior")}</span>
                )}
              </div>
              <div className="panel stat">
                <span className="muted">{t("reports.transactions")}</span>
                <strong>{data.transactions}</strong>
                <span className="muted reports-delta">
                  {t("reports.avgTicket", { amount: money(data.currency, data.average_ticket) })}
                </span>
              </div>
              <div className="panel stat">
                <span className="muted">{t("reports.gross")}</span>
                <strong>{money(data.currency, data.gross)}</strong>
                <span className="muted reports-delta">
                  {t("reports.bookingOrderSplit", {
                    bookings: data.booking_sales,
                    orders: data.order_sales,
                  })}
                </span>
              </div>
              <div className="panel stat">
                <span className="muted">{t("reports.outstanding")}</span>
                <strong>{money(data.currency, data.outstanding)}</strong>
                <span className="muted reports-delta">
                  {data.outstanding_count === 1
                    ? t("reports.openPayments", { count: data.outstanding_count })
                    : t("reports.openPayments_other", { count: data.outstanding_count })}
                </span>
              </div>
            </div>

            <div className="reports-panels">
              <section className="panel reports-panel">
                <div className="reports-panel-head">
                  <h2>
                    {data.grain === "month" ? t("reports.monthlySales") : t("reports.dailySales")}
                  </h2>
                  <p className="muted">
                    {t("reports.seriesHint", {
                      grain: data.grain === "month" ? t("reports.month") : t("reports.day"),
                    })}
                  </p>
                </div>
                <div className="reports-panel-body">
                  {data.series?.length ? (
                    <div className="reports-bars">
                      {data.series.map((row: any) => (
                        <div className="reports-bar-row" key={row.key}>
                          <div className="reports-bar-meta">
                            <span>{row.label}</span>
                            <strong>{money(data.currency, row.collected)}</strong>
                          </div>
                          <div className="reports-bar-track" aria-hidden>
                            <div
                              className="reports-bar-fill"
                              style={{
                                width: `${Math.max(
                                  2,
                                  (Number(row.collected) / maxCollected) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="muted reports-bar-count">{row.transactions} tx</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">{t("reports.noSales")}</p>
                  )}
                </div>
              </section>

              <section className="panel reports-panel">
                <div className="reports-panel-head">
                  <h2>{t("reports.byChannel")}</h2>
                  <p className="muted">{t("reports.byChannelHint")}</p>
                </div>
                <div className="reports-panel-body">
                  {data.channels?.length ? (
                    <div className="reports-bars">
                      {data.channels.map((row: any) => (
                        <div className="reports-bar-row" key={row.channel}>
                          <div className="reports-bar-meta">
                            <span>{row.label}</span>
                            <strong>{money(data.currency, row.collected)}</strong>
                          </div>
                          <div className="reports-bar-track" aria-hidden>
                            <div
                              className="reports-bar-fill channel"
                              style={{
                                width: `${Math.max(
                                  2,
                                  (Number(row.collected) / channelMax) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="muted reports-bar-count">{row.transactions} tx</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">{t("reports.noChannels")}</p>
                  )}
                </div>
              </section>

              <section className="panel reports-panel reports-panel-items">
                <div className="reports-panel-head">
                  <h2>{t("reports.topItems")}</h2>
                  <p className="muted">{t("reports.topItemsHint")}</p>
                </div>
                <div className="reports-panel-body">
                  {data.top_items?.length ? (
                    <div className="table-wrap reports-table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t("reports.item")}</th>
                            <th>{t("reports.qty")}</th>
                            <th>{t("reports.revenue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.top_items.map((row: any) => (
                            <tr key={row.name}>
                              <td>{row.name}</td>
                              <td>{row.quantity}</td>
                              <td>{money(data.currency, row.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">{t("reports.noItems")}</p>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
