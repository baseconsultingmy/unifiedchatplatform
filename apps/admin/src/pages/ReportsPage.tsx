import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
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

const PRESETS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
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

function deltaLabel(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}% vs prior period`;
}

export default function ReportsPage() {
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

  return (
    <div className="grid page-scroll reports-page">
      <div className="reports-head">
        <div>
          <h1>Sales reports</h1>
          <p className="muted">
            Collected payments from {profile.key === "fnb" ? "POS, bookings, and marketplace" : "bookings, POS, and chat"}
            — daily and monthly views for your shop.
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
              {p.label}
            </button>
          ))}
        </div>
        <div className="reports-grain">
          <label>
            Group by
            <select
              value={grain}
              onChange={(e) => setGrain(e.target.value as "auto" | "day" | "month")}
            >
              <option value="auto">Auto</option>
              <option value="day">Day</option>
              <option value="month">Month</option>
            </select>
          </label>
        </div>
      </div>

      {period === "custom" ? (
        <div className="reports-custom panel">
          <label>
            From
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
        </div>
      ) : null}

      {error ? <div className="error">{error}</div> : null}
      {busy && !data ? <div className="muted">Loading report…</div> : null}

      {data ? (
        <>
          <div className="grid stats reports-stats">
            <div className="panel stat">
              <span className="muted">Collected</span>
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
                <span className="muted reports-delta">No prior period sales</span>
              )}
            </div>
            <div className="panel stat">
              <span className="muted">Transactions</span>
              <strong>{data.transactions}</strong>
              <span className="muted reports-delta">
                Avg ticket {money(data.currency, data.average_ticket)}
              </span>
            </div>
            <div className="panel stat">
              <span className="muted">Gross sales value</span>
              <strong>{money(data.currency, data.gross)}</strong>
              <span className="muted reports-delta">
                {data.booking_sales} booking · {data.order_sales} marketplace
              </span>
            </div>
            <div className="panel stat">
              <span className="muted">Outstanding</span>
              <strong>{money(data.currency, data.outstanding)}</strong>
              <span className="muted reports-delta">
                {data.outstanding_count} open payment
                {data.outstanding_count === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="grid split-2 reports-split">
            <section className="panel">
              <h2>{data.grain === "month" ? "Monthly sales" : "Daily sales"}</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Collected in each {data.grain === "month" ? "month" : "day"} of this range.
              </p>
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
                      <span className="muted reports-bar-count">
                        {row.transactions} tx
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No collected sales in this range.</p>
              )}
            </section>

            <section className="panel">
              <h2>By channel</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Where the money came from.
              </p>
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
                      <span className="muted reports-bar-count">
                        {row.transactions} tx
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No channel sales yet.</p>
              )}
            </section>
          </div>

          <section className="panel">
            <h2>Top items</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Best sellers in this period ({profile.catalogNoun.toLowerCase()} / menu).
            </p>
            {data.top_items?.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Revenue</th>
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
              <p className="muted">No item sales in this range.</p>
            )}
          </section>

          <p className="muted reports-footnote">
            Collected = deposits and full payments received (by paid time). Marketplace orders count when
            marked completed. Outstanding is open balances across all dates. Prior period is the same
            length immediately before this range
            {data.previous_from
              ? ` (${data.previous_from} → ${data.previous_to}, ${money(
                  data.currency,
                  data.previous_collected,
                )})`
              : ""}
            .
          </p>
        </>
      ) : null}
    </div>
  );
}
