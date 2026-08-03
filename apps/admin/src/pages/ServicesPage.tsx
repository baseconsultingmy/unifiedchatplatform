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

  const profile = industryProfile(industry);

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
      // Force me() refresh by reloading user context via full page is heavy;
      // store hint; user can soft-reload. We'll call me and rely on next navigation.
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

  return (
    <div className="grid split-2">
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>{profile.catalogNoun}</h1>
            <p>
              Catalog for {profile.label.toLowerCase()} — used by POS
              {profile.showDeposit ? " and WhatsApp booking" : ""}.
            </p>
          </div>
        </div>

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
              <th>Price</th>
              {profile.showDeposit ? <th>Deposit</th> : null}
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
                  {s.currency} {s.price_amount}
                </td>
                {profile.showDeposit ? (
                  <td>
                    {s.currency} {s.deposit_amount}
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
          Price (MYR)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min={0}
          />
        </label>
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
