import { useEffect, useMemo, useState } from "react";
import QrPayPanel from "../components/QrPayPanel";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

type CartLine = { serviceId: number; quantity: number };

function parseMoney(raw: string): number {
  if (!raw || raw === ".") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toFixed(2);
}

export default function PosPage() {
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [chargeMode, setChargeMode] = useState<"full" | "deposit">("full");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [tenderInput, setTenderInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showQr, setShowQr] = useState(false);
  const [lastCash, setLastCash] = useState<{ tendered: number; change: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.services(token), api.customers(token)])
      .then(([s, c]) => {
        setServices(s.filter((x: any) => x.is_active));
        setCustomers(c);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.category) set.add(String(s.category));
    }
    return ["All", ...Array.from(set).sort()];
  }, [services]);

  const visibleServices = useMemo(() => {
    if (category === "All") return services;
    return services.filter((s) => (s.category || "General") === category);
  }, [services, category]);

  const cartDetails = useMemo(() => {
    return cart
      .map((line) => {
        const service = services.find((s) => s.id === line.serviceId);
        if (!service) return null;
        const unit = Number(service.price_amount || 0);
        return {
          ...line,
          service,
          unit,
          lineTotal: unit * line.quantity,
        };
      })
      .filter(Boolean) as Array<{
      serviceId: number;
      quantity: number;
      service: any;
      unit: number;
      lineTotal: number;
    }>;
  }, [cart, services]);

  const amountDue = useMemo(() => {
    if (
      profile.showDeposit &&
      chargeMode === "deposit" &&
      cartDetails.length === 1 &&
      cartDetails[0].quantity === 1 &&
      Number(cartDetails[0].service.deposit_amount || 0) > 0
    ) {
      return Number(cartDetails[0].service.deposit_amount || 0);
    }
    return cartDetails.reduce((sum, line) => sum + line.lineTotal, 0);
  }, [cartDetails, chargeMode, profile.showDeposit]);

  const currency = cartDetails[0]?.service?.currency || "MYR";
  const tendered = parseMoney(tenderInput);
  const changeDue = Math.max(0, tendered - amountDue);
  const balanceDue = Math.max(0, amountDue - tendered);
  const canTakeCash = cartDetails.length > 0 && tendered + 1e-9 >= amountDue && amountDue > 0;
  const depositAllowed =
    profile.showDeposit &&
    cartDetails.length === 1 &&
    cartDetails[0].quantity === 1 &&
    Number(cartDetails[0].service.deposit_amount || 0) > 0;

  const selectedCustomer = customerId
    ? customers.find((c) => c.id === customerId)
    : null;
  const customerLabel =
    selectedCustomer?.name ||
    customerName.trim() ||
    (customerPhone.trim() ? customerPhone.trim() : "Walk-in guest");
  const customerMeta = selectedCustomer
    ? selectedCustomer.phone
    : customerPhone.trim() || "No phone on ticket";

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          String(c.name || "")
            .toLowerCase()
            .includes(q) || String(c.phone || "").includes(q),
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  function resetTicket(keepCart = false) {
    if (!keepCart) setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setTenderInput("");
    setCustomerOpen(false);
    setCustomerQuery("");
  }

  function addToCart(serviceId: number) {
    setResult(null);
    setShowQr(false);
    setLastCash(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.serviceId === serviceId);
      if (existing) {
        return prev.map((l) =>
          l.serviceId === serviceId ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l,
        );
      }
      return [...prev, { serviceId, quantity: 1 }];
    });
  }

  function setQty(serviceId: number, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.serviceId !== serviceId);
      return prev.map((l) => (l.serviceId === serviceId ? { ...l, quantity } : l));
    });
  }

  function openCustomer() {
    setDraftName(selectedCustomer?.name || customerName);
    setDraftPhone(selectedCustomer?.phone || customerPhone);
    setDraftNotes(notes);
    setCustomerQuery("");
    setCustomerOpen(true);
  }

  function pickCustomer(c: any) {
    setCustomerId(c.id);
    setCustomerName(c.name || "");
    setCustomerPhone(c.phone || "");
    setDraftName(c.name || "");
    setDraftPhone(c.phone || "");
    setCustomerQuery("");
  }

  function saveCustomerDetails() {
    setCustomerName(draftName.trim());
    setCustomerPhone(draftPhone.trim());
    setNotes(draftNotes.trim());
    if (customerId) {
      const match = customers.find((c) => c.id === customerId);
      if (match && draftPhone.trim() && match.phone !== draftPhone.trim()) {
        setCustomerId(null);
      }
    }
    setCustomerOpen(false);
  }

  function setWalkIn() {
    setCustomerId(null);
    setCustomerName("Walk-in");
    setCustomerPhone("");
    setDraftName("Walk-in");
    setDraftPhone("");
    setDraftNotes(notes);
  }

  function appendDigit(digit: string) {
    setTenderInput((prev) => {
      if (digit === ".") {
        if (prev.includes(".")) return prev;
        return prev ? `${prev}.` : "0.";
      }
      if (prev === "0") return digit;
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      if (prev.length >= 10) return prev;
      return `${prev}${digit}`;
    });
  }

  async function checkout(method: "cash" | "qr") {
    if (!token || cartDetails.length === 0) return;
    if (method === "cash" && !canTakeCash) {
      setError("Cash received must cover the amount due");
      return;
    }
    setError("");
    setBusy(true);
    setResult(null);
    setShowQr(false);
    setLastCash(null);
    try {
      const saleNotes = [
        notes.trim(),
        method === "cash"
          ? `Cash tendered ${currency} ${formatMoney(tendered)}; change ${currency} ${formatMoney(changeDue)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const sale = await api.posSale(token, {
        items: cartDetails.map((l) => ({
          service_id: l.serviceId,
          quantity: l.quantity,
        })),
        customer_id: customerId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        payment_method: method,
        charge_mode: depositAllowed && chargeMode === "deposit" ? "deposit" : "full",
        notes: saleNotes || null,
      });
      setResult(sale);
      if (method === "qr") {
        setShowQr(true);
      } else {
        setLastCash({ tendered, change: changeDue });
        resetTicket(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid pos-shell pos-shell-3">
      <section className="panel pos-services-panel">
        <div className="bookings-toolbar">
          <div>
            <h1>{profile.posTitle}</h1>
            <p>{profile.posHint}</p>
          </div>
          {depositAllowed ? (
            <div className="segmented">
              <button
                type="button"
                className={chargeMode === "full" ? "active" : ""}
                onClick={() => {
                  setChargeMode("full");
                  setTenderInput("");
                }}
              >
                Full
              </button>
              <button
                type="button"
                className={chargeMode === "deposit" ? "active" : ""}
                onClick={() => {
                  setChargeMode("deposit");
                  setTenderInput("");
                }}
              >
                Deposit
              </button>
            </div>
          ) : null}
        </div>

        <div className="pos-category-row">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`pos-chip ${category === c ? "active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {visibleServices.length === 0 ? (
          <p className="muted">No active {profile.catalogNoun.toLowerCase()} yet.</p>
        ) : (
          <div className="pos-service-grid">
            {visibleServices.map((s) => (
              <button
                key={s.id}
                type="button"
                className="pos-service-btn"
                onClick={() => addToCart(s.id)}
              >
                <strong>{s.name}</strong>
                <span className="pos-service-meta">
                  {s.category || "General"}
                  {profile.showDuration ? ` · ${s.duration_minutes} min` : ""}
                </span>
                <span className="pos-service-price">
                  {s.currency} {Number(s.price_amount).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel pos-ticket-panel">
        <div className="bookings-toolbar">
          <div>
            <h2>Ticket</h2>
            <p className="muted">{cartDetails.length ? `${cartDetails.length} line(s)` : "Empty"}</p>
          </div>
          <button type="button" className="btn secondary" onClick={() => resetTicket(false)} disabled={!cart.length}>
            Clear
          </button>
        </div>

        {cartDetails.length === 0 ? (
          <p className="muted">Tap catalog items to add them here.</p>
        ) : (
          <div className="pos-ticket-lines">
            {cartDetails.map((line) => (
              <div key={line.serviceId} className="pos-ticket-line">
                <div>
                  <strong>{line.service.name}</strong>
                  <div className="muted">
                    {currency} {formatMoney(line.unit)} each
                  </div>
                </div>
                <div className="pos-qty">
                  <button type="button" onClick={() => setQty(line.serviceId, line.quantity - 1)}>
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button type="button" onClick={() => setQty(line.serviceId, line.quantity + 1)}>
                    +
                  </button>
                </div>
                <div className="pos-line-total">{formatMoney(line.lineTotal)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="pos-due-board">
          <div className="pos-due-amount">
            <span className="muted">Amount due</span>
            <em>
              {currency} {formatMoney(amountDue)}
            </em>
          </div>
        </div>
      </section>

      <section className="panel pos-checkout-panel">
        {showQr && result?.payment_url ? (
          <QrPayPanel
            paymentUrl={result.payment_url}
            amountLabel={`${result.currency} ${Number(result.amount_due).toFixed(2)}`}
            subtitle={(result.line_items || []).join(", ") || `Sale #${result.booking?.id}`}
            onPaid={() => {
              setResult((prev: any) =>
                prev
                  ? {
                      ...prev,
                      already_paid: true,
                      booking: {
                        ...prev.booking,
                        payment_status:
                          chargeMode === "deposit" && depositAllowed ? "deposit_paid" : "paid",
                      },
                    }
                  : prev,
              );
            }}
            onClose={() => {
              setShowQr(false);
              resetTicket(false);
            }}
          />
        ) : (
          <>
            <div className="pos-customer-card">
              <button type="button" className="pos-customer-summary" onClick={openCustomer}>
                <div>
                  <span className="muted">Customer</span>
                  <strong>{customerLabel}</strong>
                  <span className="muted">{customerMeta}</span>
                </div>
                <span className="pos-customer-edit">Open</span>
              </button>

              {customerOpen ? (
                <div className="pos-customer-form">
                  <div className="pos-customer-form-head">
                    <strong>Customer</strong>
                    <button type="button" className="btn secondary" onClick={() => setCustomerOpen(false)}>
                      Close
                    </button>
                  </div>

                  <div className="btn-row">
                    <button type="button" className="btn secondary" onClick={setWalkIn}>
                      Walk-in
                    </button>
                  </div>

                  <label>
                    Search existing
                    <input
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="Name or phone"
                    />
                  </label>

                  <div className="pos-customer-results">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`pos-customer-result ${customerId === c.id ? "selected" : ""}`}
                        onClick={() => pickCustomer(c)}
                      >
                        <strong>{c.name || "Unnamed"}</strong>
                        <span className="muted">{c.phone}</span>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 ? (
                      <div className="muted">No matches — save a new guest below.</div>
                    ) : null}
                  </div>

                  <label>
                    Name
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Walk-in"
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      value={draftPhone}
                      onChange={(e) => setDraftPhone(e.target.value)}
                      placeholder="6012…"
                    />
                  </label>
                  <label>
                    Note
                    <input
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <div className="btn-row">
                    <button type="button" className="btn" onClick={saveCustomerDetails}>
                      Use on ticket
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pos-calc compact">
              <div className="pos-calc-readout">
                <div>
                  <span className="muted">Cash received</span>
                  <strong>
                    {currency} {tenderInput ? tenderInput : "0"}
                  </strong>
                </div>
                <div className={balanceDue > 0 ? "pos-balance warn" : "pos-balance ok"}>
                  <span className="muted">{balanceDue > 0 ? "Still due" : "Change"}</span>
                  <strong>
                    {currency} {formatMoney(balanceDue > 0 ? balanceDue : changeDue)}
                  </strong>
                </div>
              </div>

              <div className="pos-keypad compact">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="pos-key"
                    onClick={() => {
                      if (key === "⌫") setTenderInput((prev) => prev.slice(0, -1));
                      else appendDigit(key);
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="btn-row pos-calc-tools">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setTenderInput(formatMoney(amountDue))}
                >
                  Exact
                </button>
                <button type="button" className="btn secondary" onClick={() => setTenderInput("")}>
                  Clear
                </button>
              </div>
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="btn-row pos-actions">
              <button
                type="button"
                className="btn"
                disabled={busy || !canTakeCash}
                onClick={() => checkout("cash")}
              >
                Take cash
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || cartDetails.length === 0 || amountDue <= 0}
                onClick={() => checkout("qr")}
              >
                Show QR pay
              </button>
            </div>

            {lastCash && result?.already_paid ? (
              <div className="pos-receipt">
                <strong>Sale recorded</strong>
                <div>#{result.booking?.id}</div>
                <div className="muted">
                  {(result.line_items || []).join(", ")} · Change {currency}{" "}
                  {formatMoney(lastCash.change)}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
