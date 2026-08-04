import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { INDUSTRY_OPTIONS, industryProfile } from "../industry";

export default function ServicesPage() {
  const { token, user } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [industry, setIndustry] = useState("health_beauty");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(100);
  const [deposit, setDeposit] = useState(0);
  const [error, setError] = useState("");
  const [savedIndustry, setSavedIndustry] = useState("");
  const [grabStatus, setGrabStatus] = useState<any | null>(null);
  const [grabMsg, setGrabMsg] = useState("");
  const [overrideDraft, setOverrideDraft] = useState<Record<number, string>>({});
  const [busyPublish, setBusyPublish] = useState(false);

  const profile = industryProfile(industry);
  const isFnb = profile.key === "fnb";

  async function refresh() {
    if (!token) return;
    const [s, workspace] = await Promise.all([api.services(token), api.workspace(token)]);
    setServices(s);
    setIndustry(workspace.industry || user?.tenant?.industry || "general");
    const drafts: Record<number, string> = {};
    for (const item of s) {
      if (item.grab?.price_override != null) {
        drafts[item.id] = String(item.grab.price_override);
      }
    }
    setOverrideDraft(drafts);
    if ((workspace.industry || user?.tenant?.industry) === "fnb" || workspace.industry === "food") {
      try {
        setGrabStatus(await api.grabStatus(token));
      } catch {
        setGrabStatus(null);
      }
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!category && profile.categoryHints[0]) {
      setCategory(profile.categoryHints[0]);
    }
    if (!profile.showDeposit) setDeposit(0);
    if (!profile.showDuration) setDuration(0);
    else if (duration <= 0) setDuration(30);
  }, [industry]);

  async function saveIndustry() {
    if (!token) return;
    setError("");
    try {
      const ws = await api.updateWorkspace(token, { industry });
      setIndustry(ws.industry);
      setSavedIndustry("Industry saved — refresh POS to see labels.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save industry");
    }
  }

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
        currency: "MYR",
        is_active: true,
      });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item");
    }
  }

  async function saveGrabOverride(serviceId: number) {
    if (!token) return;
    setError("");
    setGrabMsg("");
    const raw = (overrideDraft[serviceId] || "").trim();
    try {
      if (!raw) {
        await api.updateGrabPrice(token, serviceId, { clear_override: true });
        setGrabMsg("Cleared Grab override — using markup");
      } else {
        await api.updateGrabPrice(token, serviceId, { price_override: Number(raw) });
        setGrabMsg("Grab price saved");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Grab price");
    }
  }

  async function publishGrab() {
    if (!token) return;
    setBusyPublish(true);
    setError("");
    setGrabMsg("");
    try {
      const res = await api.publishGrabMenu(token);
      setGrabMsg(
        res.ok
          ? `${res.message}${res.dry_run ? " (dry-run)" : ""} · ${res.item_count} items`
          : res.message || "Publish failed",
      );
      setGrabStatus(await api.grabStatus(token));
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
            <h1>{profile.catalogNoun}</h1>
            <p>
              Catalog for {profile.label.toLowerCase()} — used by POS
              {profile.showDeposit ? " and WhatsApp booking" : ""}
              {isFnb ? " and Grab Food" : ""}.
            </p>
          </div>
          {isFnb ? (
            <button type="button" className="btn" disabled={busyPublish} onClick={publishGrab}>
              {busyPublish ? "Publishing…" : "Publish to Grab"}
            </button>
          ) : null}
        </div>

        {isFnb && grabStatus ? (
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Grab merchant: {grabStatus.merchant_id || "—"} · markup{" "}
            {Number(grabStatus.markup_percent || 30).toFixed(0)}% · sync {grabStatus.sync_status}
            {grabStatus.last_synced_at
              ? ` · last ${new Date(grabStatus.last_synced_at).toLocaleString()}`
              : ""}
            {!grabStatus.platform_credentials_set ? " · dry-run mode" : ""}
          </p>
        ) : null}
        {grabMsg ? <p className="muted">{grabMsg}</p> : null}

        <div className="industry-picker" style={{ marginBottom: "1rem" }}>
          <label>
            Business type
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn secondary" onClick={saveIndustry}>
            Save type
          </button>
        </div>
        {savedIndustry ? <p className="muted">{savedIndustry}</p> : null}

        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              {profile.showDuration ? <th>Duration</th> : null}
              <th>{isFnb ? "Walk-in" : "Price"}</th>
              {isFnb ? <th>Grab</th> : null}
              {profile.showDeposit ? <th>Deposit</th> : null}
              {isFnb ? <th>Grab override</th> : null}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  {!s.is_active ? <div className="muted">Inactive</div> : null}
                </td>
                <td>{s.category || "—"}</td>
                {profile.showDuration ? <td>{s.duration_minutes}m</td> : null}
                <td>
                  {s.currency} {Number(s.price_amount).toFixed(2)}
                </td>
                {isFnb ? (
                  <td>
                    {s.currency} {Number(s.grab?.grab_price ?? s.price_amount).toFixed(2)}
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {s.grab?.pricing_mode === "override"
                        ? "override"
                        : `+${Number(s.grab?.markup_percent ?? 30).toFixed(0)}%`}
                    </div>
                  </td>
                ) : null}
                {profile.showDeposit ? (
                  <td>
                    {s.currency} {s.deposit_amount}
                  </td>
                ) : null}
                {isFnb ? (
                  <td>
                    <div className="btn-row" style={{ alignItems: "center" }}>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        style={{ width: "5.5rem" }}
                        placeholder="auto"
                        value={overrideDraft[s.id] ?? ""}
                        onChange={(e) =>
                          setOverrideDraft((d) => ({ ...d, [s.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => saveGrabOverride(s.id)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form className="panel form" onSubmit={onCreate}>
        <h2>Add {profile.catalogNounSingular.toLowerCase()}</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Category
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="category-hints"
            placeholder={profile.categoryHints[0]}
          />
          <datalist id="category-hints">
            {profile.categoryHints.map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>
        </label>
        {profile.showDuration ? (
          <label>
            Duration (minutes)
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={0}
            />
          </label>
        ) : null}
        <label>
          {isFnb ? "Walk-in price (MYR)" : "Price (MYR)"}
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min={0}
          />
        </label>
        {isFnb ? (
          <p className="muted">
            Grab price defaults to walk-in + shop markup ({Number(grabStatus?.markup_percent || 30)}%).
            Set an override per item after saving.
          </p>
        ) : null}
        {profile.showDeposit ? (
          <label>
            Deposit (MYR)
            <input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(Number(e.target.value))}
              min={0}
            />
          </label>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        <button className="btn">Save {profile.catalogNounSingular.toLowerCase()}</button>
      </form>
    </div>
  );
}
