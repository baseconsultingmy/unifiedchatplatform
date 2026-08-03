import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

export default function ResourcesPage() {
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const [resources, setResources] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"room" | "person">("person");
  const [error, setError] = useState("");

  async function refresh() {
    if (!token) return;
    setResources(await api.resources(token));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  const rooms = useMemo(() => resources.filter((r) => r.kind === "room"), [resources]);
  const people = useMemo(() => resources.filter((r) => r.kind === "person"), [resources]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      await api.createResource(token, {
        name,
        kind,
        is_active: true,
        sort_order: kind === "room" ? rooms.length + 1 : people.length + 1,
      });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save resource");
    }
  }

  async function toggleActive(resource: any) {
    if (!token) return;
    await api.updateResource(token, resource.id, {
      name: resource.name,
      kind: resource.kind,
      is_active: !resource.is_active,
      sort_order: resource.sort_order || 0,
    });
    await refresh();
  }

  if (!profile.supportsResources) {
    return (
      <section className="panel">
        <h1>{profile.resourcesNoun}</h1>
        <p>
          Room / staff assignment is aimed at appointment businesses (massage, tattoo, salon). Switch
          business type to Health & Beauty under {profile.catalogNoun} if you need it.
        </p>
      </section>
    );
  }

  return (
    <div className="grid split-2 page-scroll">
      <section className="panel">
        <h1>{profile.resourcesNoun}</h1>
        <p>
          Assign bookings to a {profile.roomNoun.toLowerCase()} and/or {profile.personNoun.toLowerCase()}.
        </p>

        <h2 style={{ marginTop: "1.2rem" }}>{profile.roomNoun}s</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td>
                  <span className={`badge ${r.is_active ? "" : "warn"}`}>
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td>
                  <button className="btn secondary" onClick={() => toggleActive(r)}>
                    {r.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No rooms yet — add Room 1, Bay A, etc.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <h2 style={{ marginTop: "1.2rem" }}>{profile.personNoun}s</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td>
                  <span className={`badge ${r.is_active ? "" : "warn"}`}>
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td>
                  <button className="btn secondary" onClick={() => toggleActive(r)}>
                    {r.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {people.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No people yet — add therapists or tattoo artists.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <form className="panel form" onSubmit={onCreate}>
        <h2>Add resource</h2>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as "room" | "person")}>
            <option value="room">{profile.roomNoun}</option>
            <option value="person">{profile.personNoun}</option>
          </select>
        </label>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={kind === "room" ? "Room 1" : "Artist name"}
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn">Save</button>
      </form>
    </div>
  );
}
