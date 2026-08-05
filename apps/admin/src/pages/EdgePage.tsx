import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type DnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
  priority?: number;
};

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`edge-badge ${ok ? "ok" : "warn"}`}>{label}</span>;
}

export default function EdgePage() {
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  const [status, setStatus] = useState<any | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState("");
  const [newRec, setNewRec] = useState({
    type: "A",
    name: "",
    content: "",
    proxied: true,
  });

  async function refresh() {
    if (!token) return;
    const st = await api.edgeStatus(token);
    setStatus(st);
    if (st?.cloudflare?.configured && !st?.cloudflare?.error) {
      try {
        const dns = await api.edgeDnsList(token);
        setRecords(dns.records || []);
      } catch {
        setRecords([]);
      }
    } else {
      setRecords([]);
    }
  }

  useEffect(() => {
    if (!isPlatformAdmin) return;
    refresh().catch((err) => setError(err.message));
  }, [token, isPlatformAdmin]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  async function run(action: string, fn: () => Promise<unknown>, okMsg: string) {
    if (!token) return;
    setError("");
    setSaved("");
    setBusy(action);
    try {
      await fn();
      setSaved(okMsg);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy("");
    }
  }

  async function onCreateRecord(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    await run(
      "create",
      () =>
        api.edgeDnsCreate(token, {
          type: newRec.type,
          name: newRec.name.trim(),
          content: newRec.content.trim(),
          proxied: newRec.type === "A" || newRec.type === "CNAME" ? newRec.proxied : undefined,
        }),
      "DNS record created",
    );
    setNewRec((r) => ({ ...r, name: "", content: "" }));
  }

  const health = status?.health || {};
  const cf = status?.cloudflare || {};
  const xb = status?.exabytes || {};
  const publicDns = status?.public_dns || {};
  const expectedNs: string[] = cf.expected_nameservers || [];
  const zone = cf.zone;

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>Edge / DNS</h1>
            <p>
              Cloudflare Universal SSL + Exabytes nameservers for{" "}
              <strong>{status?.zone_name || "baseapp.asia"}</strong>. Origin{" "}
              {status?.origin_ip || "157.245.149.238"}.
            </p>
          </div>
          <button
            type="button"
            className="btn secondary"
            disabled={!!busy}
            onClick={() => run("refresh", async () => refresh(), "Status refreshed")}
          >
            Refresh
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {saved ? <p className="muted">{saved}</p> : null}

        <div className="detail-grid" style={{ marginTop: "0.5rem" }}>
          <div>
            <span className="muted">Zone</span>
            <div>
              {zone?.status || (cf.configured ? "—" : "Token missing")}{" "}
              {health.zone_active ? <Badge ok label="Active" /> : <Badge ok={false} label="Not active" />}
            </div>
          </div>
          <div>
            <span className="muted">Registry NS</span>
            <div>
              {health.registry_on_cloudflare ? (
                <Badge ok label="On Cloudflare" />
              ) : (
                <Badge ok={false} label="Not on Cloudflare yet" />
              )}
            </div>
          </div>
          <div>
            <span className="muted">Orange proxy</span>
            <div>
              {health.proxy_active ? (
                <Badge ok label="Proxied (CF IPs)" />
              ) : (
                <Badge ok={false} label="Hitting origin directly" />
              )}
            </div>
          </div>
          <div>
            <span className="muted">SSL mode</span>
            <div>
              {cf.ssl || "—"}{" "}
              {health.ssl_strict ? <Badge ok label="Strict" /> : <Badge ok={false} label="Set Full strict" />}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Cloudflare</h2>
        <p className="muted">
          {cf.configured
            ? cf.error
              ? `Configured, but: ${cf.error}`
              : "API token on file — manage DNS and SSL below."
            : "Set CF_API_TOKEN in deploy/.env (Zone DNS Edit + Zone Settings Edit), rebuild API."}
        </p>

        {expectedNs.length ? (
          <div className="pos-confirmed" style={{ marginTop: "0.75rem" }}>
            <h3>Expected nameservers</h3>
            <p className="muted">Set these at Exabytes (or use Point to Cloudflare below).</p>
            <ul className="edge-ns-list">
              {expectedNs.map((ns: string) => (
                <li key={ns}>
                  <code>{ns}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="edge-actions">
          <button
            type="button"
            className="btn"
            disabled={!cf.configured || !!busy}
            onClick={() =>
              run(
                "bootstrap",
                () => api.edgeCloudflareBootstrap(token!),
                "Bootstrapped A/CNAME records + Full (strict)",
              )
            }
          >
            {busy === "bootstrap" ? "Working…" : "Bootstrap BaseApp DNS + SSL"}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!cf.configured || !!busy}
            onClick={() =>
              run(
                "ssl",
                () => api.edgeCloudflareSsl(token!, "strict"),
                "SSL set to Full (strict)",
              )
            }
          >
            Force Full (strict)
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!cf.configured || !!busy}
            onClick={() =>
              run(
                "activation",
                () => api.edgeCloudflareActivationCheck(token!),
                "Asked Cloudflare to re-check nameservers",
              )
            }
          >
            Check nameservers
          </button>
          {status?.links?.cloudflare_dns ? (
            <a className="btn secondary" href={status.links.cloudflare_dns} target="_blank" rel="noreferrer">
              Open Cloudflare DNS
            </a>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Exabytes (registrar)</h2>
        <p className="muted">
          {xb.configured
            ? xb.error
              ? `API on file, but: ${xb.error}`
              : "WHMCS API on file — you can push Cloudflare nameservers from here."
            : "Optional: set EXABYTES_API_IDENTIFIER + EXABYTES_API_SECRET to change nameservers in-panel. Otherwise use the portal link."}
        </p>

        {xb.domain ? (
          <div className="detail-grid" style={{ marginTop: "0.5rem" }}>
            <div>
              <span className="muted">Domain</span>
              <div>{xb.domain.domain}</div>
            </div>
            <div>
              <span className="muted">Status</span>
              <div>{xb.domain.status || "—"}</div>
            </div>
            <div>
              <span className="muted">Current NS (Exabytes)</span>
              <div>
                {[xb.nameservers?.ns1, xb.nameservers?.ns2, xb.nameservers?.ns3]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
            </div>
          </div>
        ) : null}

        <div className="edge-actions">
          <button
            type="button"
            className="btn"
            disabled={!xb.configured || !cf.configured || !!busy}
            onClick={() =>
              run(
                "point-cf",
                () =>
                  api.edgeExabytesSetNameservers(token!, {
                    ns1: expectedNs[0] || "jonah.ns.cloudflare.com",
                    ns2: expectedNs[1] || "laila.ns.cloudflare.com",
                    use_cloudflare: true,
                  }),
                "Exabytes nameservers pointed at Cloudflare",
              )
            }
          >
            {busy === "point-cf" ? "Updating…" : "Point nameservers → Cloudflare"}
          </button>
          {status?.links?.exabytes_nameservers ? (
            <a
              className="btn secondary"
              href={status.links.exabytes_nameservers}
              target="_blank"
              rel="noreferrer"
            >
              Open Exabytes Nameservers
            </a>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Public DNS probe</h2>
        <div className="detail-grid">
          <div>
            <span className="muted">NS</span>
            <div>
              <code>{(publicDns.nameservers || []).join(", ") || "—"}</code>
            </div>
          </div>
          <div>
            <span className="muted">admin A</span>
            <div>
              <code>{(publicDns.admin_a || []).join(", ") || "—"}</code>
            </div>
          </div>
          <div>
            <span className="muted">api A</span>
            <div>
              <code>{(publicDns.api_a || []).join(", ") || "—"}</code>
            </div>
          </div>
          <div>
            <span className="muted">apex A</span>
            <div>
              <code>{(publicDns.apex_a || []).join(", ") || "—"}</code>
            </div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Proxied hostnames should show Cloudflare IPs (e.g. 104.x), not the origin. After Active +
          orange cloud, open{" "}
          <a href={status?.links?.admin_login || "https://admin.baseapp.asia/login"} target="_blank" rel="noreferrer">
            admin login
          </a>{" "}
          in Incognito.
        </p>
      </section>

      <section className="panel table-panel">
        <div className="bookings-toolbar">
          <div>
            <h2>DNS records</h2>
            <p className="muted">Cloudflare zone records. Keep mail/ftp DNS-only.</p>
          </div>
        </div>

        {!cf.configured ? (
          <p className="muted">Configure CF_API_TOKEN to manage records here.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Content</th>
                    <th>Proxy</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>{r.type}</td>
                      <td>
                        <code>{r.name}</code>
                      </td>
                      <td>
                        <code>{r.content}</code>
                        {r.priority != null ? ` (prio ${r.priority})` : ""}
                      </td>
                      <td>
                        {r.proxied == null ? "—" : r.proxied ? "Proxied" : "DNS only"}
                      </td>
                      <td className="edge-row-actions">
                        {r.type === "A" || r.type === "CNAME" ? (
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                `proxy-${r.id}`,
                                () =>
                                  api.edgeDnsUpdate(token!, r.id, {
                                    proxied: !r.proxied,
                                  }),
                                r.proxied ? "Set DNS only" : "Set Proxied",
                              )
                            }
                          >
                            {r.proxied ? "DNS only" : "Proxy"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={!!busy}
                          onClick={() => {
                            if (!window.confirm(`Delete ${r.type} ${r.name}?`)) return;
                            return run(
                              `del-${r.id}`,
                              () => api.edgeDnsDelete(token!, r.id),
                              "Record deleted",
                            );
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!records.length ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No records loaded
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <form className="edge-new-record" onSubmit={onCreateRecord}>
              <h3>Add record</h3>
              <div className="detail-grid">
                <label>
                  Type
                  <select
                    value={newRec.type}
                    onChange={(e) => setNewRec((r) => ({ ...r, type: e.target.value }))}
                  >
                    <option value="A">A</option>
                    <option value="CNAME">CNAME</option>
                    <option value="TXT">TXT</option>
                    <option value="MX">MX</option>
                  </select>
                </label>
                <label>
                  Name
                  <input
                    value={newRec.name}
                    placeholder="admin or @"
                    onChange={(e) => setNewRec((r) => ({ ...r, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Content
                  <input
                    value={newRec.content}
                    placeholder={status?.origin_ip || "157.245.149.238"}
                    onChange={(e) => setNewRec((r) => ({ ...r, content: e.target.value }))}
                    required
                  />
                </label>
                {newRec.type === "A" || newRec.type === "CNAME" ? (
                  <label className="edge-check">
                    <input
                      type="checkbox"
                      checked={newRec.proxied}
                      onChange={(e) => setNewRec((r) => ({ ...r, proxied: e.target.checked }))}
                    />
                    Proxied (orange cloud)
                  </label>
                ) : null}
              </div>
              <button type="submit" className="btn" disabled={!!busy}>
                Add record
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
