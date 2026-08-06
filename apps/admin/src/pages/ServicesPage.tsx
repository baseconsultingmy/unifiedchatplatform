import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { INDUSTRY_OPTIONS, industryProfile } from "../industry";
import { shopCurrency } from "../currency";

export default function ServicesPage() {
  const t = useT();
  const { token, user } = useAuth();
  const currency = shopCurrency(user?.tenant);
  const [services, setServices] = useState<any[]>([]);
  const [industry, setIndustry] = useState(
    () => user?.tenant?.industry || "general",
  );
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(100);
  const [deposit, setDeposit] = useState(0);
  const [error, setError] = useState("");
  const [grabMsg, setGrabMsg] = useState("");
  const [busyPublish, setBusyPublish] = useState(false);
  const [modItem, setModItem] = useState<any | null>(null);
  const [modGroups, setModGroups] = useState<any[]>([]);
  const [modBusy, setModBusy] = useState(false);
  const [modMsg, setModMsg] = useState("");

  const profile = industryProfile(industry);
  const isFnb = profile.key === "fnb";
  const existingCategories = Array.from(
    new Set(
      services
        .map((s) => (s.category || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const categorySuggestions = Array.from(
    new Set([...profile.categoryHints, ...existingCategories]),
  );

  function openModifiers(item: any) {
    setModItem(item);
    setModMsg("");
    const groups = (item.modifiers || []).map((g: any) => ({
      name: g.name,
      min_select: g.min_select ?? 0,
      max_select: g.max_select ?? 1,
      required: !!g.required,
      sort_order: g.sort_order ?? 0,
      is_active: g.is_active !== false,
      options: (g.options || []).map((o: any) => ({
        name: o.name,
        price_delta: Number(o.price_delta || 0),
        sort_order: o.sort_order ?? 0,
        is_active: o.is_active !== false,
      })),
    }));
    setModGroups(
      groups.length
        ? groups
        : [
            {
              name: "Ice",
              min_select: 1,
              max_select: 1,
              required: true,
              sort_order: 0,
              is_active: true,
              options: [
                { name: "Normal ice", price_delta: 0, sort_order: 0, is_active: true },
                { name: "Less ice", price_delta: 0, sort_order: 1, is_active: true },
                { name: "More ice", price_delta: 0, sort_order: 2, is_active: true },
              ],
            },
          ],
    );
  }

  async function saveModifiers() {
    if (!token || !modItem) return;
    setModBusy(true);
    setModMsg("");
    setError("");
    try {
      await api.replaceModifiers(token, modItem.id, modGroups);
      setModMsg("Customisations saved");
      await refresh();
      setModItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customisations");
    } finally {
      setModBusy(false);
    }
  }

  async function refresh() {
    if (!token) return;
    const [s, workspace] = await Promise.all([api.services(token), api.workspace(token)]);
    setServices(s);
    setIndustry(workspace.industry || user?.tenant?.industry || "general");
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    const hints = profile.categoryHints;
    const allHints = new Set(
      INDUSTRY_OPTIONS.flatMap((opt) => industryProfile(opt.value).categoryHints),
    );
    // Prefill / fix stale cross-industry defaults (e.g. Treatments on an F&B shop).
    if (!category || allHints.has(category)) {
      if (hints[0] && category !== hints[0]) {
        setCategory(hints[0]);
      }
    }
    if (!profile.showDeposit) setDeposit(0);
    if (!profile.showDuration) setDuration(0);
    else if (duration <= 0) setDuration(30);
  }, [industry, profile.key]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await api.createService(token, {
        name,
        category: category || null,
        duration_minutes: profile.showDuration ? duration : 0,
        price_amount: price,
        deposit_amount: profile.showDeposit ? deposit : 0,
        currency,
        is_active: true,
      });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item");
    }
  }

  async function publishGrab() {
    if (!token) return;
    setBusyPublish(true);
    setError("");
    setGrabMsg("");
    try {
      const res = await api.publishGrabMenu(token);
      setGrabMsg(res.ok ? res.message || "Menu published to Grab" : res.message || "Publish failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusyPublish(false);
    }
  }

  return (
    <div className="grid split-2 page-scroll">
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>{isFnb ? t("services.menuTitle") : t("services.servicesTitle")}</h1>
            <p>{isFnb ? t("services.menuHint") : t("services.servicesHint")}</p>
          </div>
          {isFnb ? (
            <button type="button" className="btn" disabled={busyPublish} onClick={publishGrab}>
              {busyPublish ? "Publishing…" : t("services.publishGrab")}
            </button>
          ) : null}
        </div>

        {grabMsg ? <p className="muted">{grabMsg}</p> : null}

        <table className="table">
          <thead>
            <tr>
              <th>{t("services.name")}</th>
              <th>{t("services.category")}</th>
              {profile.showDuration ? <th>{t("services.duration")}</th> : null}
              <th>{isFnb ? t("services.walkInPrice", { currency }) : t("services.price", { currency })}</th>
              {profile.showDeposit ? <th>{t("services.deposit", { currency })}</th> : null}
              {isFnb ? <th>{t("services.customise")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  {!s.is_active ? <div className="muted">{t("common.inactive")}</div> : null}
                  {isFnb && (s.modifiers || []).length ? (
                    <div className="muted" style={{ fontSize: "0.78rem" }}>
                      {(s.modifiers || []).map((g: any) => g.name).join(" · ")}
                    </div>
                  ) : null}
                </td>
                <td>{s.category || "—"}</td>
                {profile.showDuration ? <td>{s.duration_minutes}m</td> : null}
                <td>
                  {s.currency} {Number(s.price_amount).toFixed(2)}
                </td>
                {profile.showDeposit ? (
                  <td>
                    {s.currency} {s.deposit_amount}
                  </td>
                ) : null}
                {isFnb ? (
                  <td>
                    <button type="button" className="btn secondary" onClick={() => openModifiers(s)}>
                      {(s.modifiers || []).length ? t("common.edit") : "Add"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modItem ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>Customisations — {modItem.name}</h2>
                <p>Shown as a popup when this item is tapped on POS (e.g. less ice, less sweet).</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setModItem(null)}>
                {t("common.close")}
              </button>
            </div>

            {modGroups.map((g, gi) => (
              <div key={gi} className="pos-confirmed" style={{ marginBottom: "0.75rem" }}>
                <label className="pos-field">
                  Group name
                  <input
                    value={g.name}
                    onChange={(e) =>
                      setModGroups((rows) =>
                        rows.map((row, i) => (i === gi ? { ...row, name: e.target.value } : row)),
                      )
                    }
                  />
                </label>
                <div className="btn-row" style={{ marginTop: "0.45rem" }}>
                  <label className="pos-field">
                    Min
                    <input
                      type="number"
                      min={0}
                      value={g.min_select}
                      onChange={(e) =>
                        setModGroups((rows) =>
                          rows.map((row, i) =>
                            i === gi ? { ...row, min_select: Number(e.target.value) } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="pos-field">
                    Max
                    <input
                      type="number"
                      min={1}
                      value={g.max_select}
                      onChange={(e) =>
                        setModGroups((rows) =>
                          rows.map((row, i) =>
                            i === gi ? { ...row, max_select: Number(e.target.value) } : row,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                {(g.options || []).map((o: any, oi: number) => (
                  <div key={oi} className="btn-row" style={{ marginTop: "0.4rem", alignItems: "end" }}>
                    <label className="pos-field" style={{ flex: 1 }}>
                      Option
                      <input
                        value={o.name}
                        onChange={(e) =>
                          setModGroups((rows) =>
                            rows.map((row, i) =>
                              i === gi
                                ? {
                                    ...row,
                                    options: row.options.map((opt: any, j: number) =>
                                      j === oi ? { ...opt, name: e.target.value } : opt,
                                    ),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="pos-field" style={{ width: "6rem" }}>
                      +RM
                      <input
                        type="number"
                        step={0.5}
                        value={o.price_delta}
                        onChange={(e) =>
                          setModGroups((rows) =>
                            rows.map((row, i) =>
                              i === gi
                                ? {
                                    ...row,
                                    options: row.options.map((opt: any, j: number) =>
                                      j === oi
                                        ? { ...opt, price_delta: Number(e.target.value) }
                                        : opt,
                                    ),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn secondary"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() =>
                    setModGroups((rows) =>
                      rows.map((row, i) =>
                        i === gi
                          ? {
                              ...row,
                              options: [
                                ...row.options,
                                {
                                  name: "New option",
                                  price_delta: 0,
                                  sort_order: row.options.length,
                                  is_active: true,
                                },
                              ],
                            }
                          : row,
                      ),
                    )
                  }
                >
                  Add option
                </button>
              </div>
            ))}

            <div className="btn-row">
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  setModGroups((rows) => [
                    ...rows,
                    {
                      name: "New group",
                      min_select: 0,
                      max_select: 1,
                      required: false,
                      sort_order: rows.length,
                      is_active: true,
                      options: [
                        { name: "Option", price_delta: 0, sort_order: 0, is_active: true },
                      ],
                    },
                  ])
                }
              >
                Add group
              </button>
              <button type="button" className="btn" disabled={modBusy} onClick={saveModifiers}>
                {modBusy ? t("common.saving") : "Save customisations"}
              </button>
            </div>
            {modMsg ? <p className="muted">{modMsg}</p> : null}
          </div>
        </div>
      ) : null}

      <form className="panel form" onSubmit={onCreate}>
        <h2>{isFnb ? t("services.addItem") : t("services.addService")}</h2>
        <label>
          {t("services.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t("services.category")}
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="category-hints"
            placeholder={profile.categoryHints[0] || "e.g. Food"}
          />
          <datalist id="category-hints">
            {categorySuggestions.map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>
          <span className="muted" style={{ display: "block", marginTop: "0.35rem", fontSize: "0.85rem" }}>
            {t("services.categoryHint")}
          </span>
        </label>
        {profile.showDuration ? (
          <label>
            {t("services.duration")}
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={0}
            />
          </label>
        ) : null}
        <label>
          {isFnb ? t("services.walkInPrice", { currency }) : t("services.price", { currency })}
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min={0}
          />
        </label>
        {profile.showDeposit ? (
          <label>
            {t("services.deposit", { currency })}
            <input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
              min={0}
            />
          </label>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        <button className="btn">
          {isFnb ? t("services.saveItem") : t("services.saveService")}
        </button>
      </form>
    </div>
  );
}
