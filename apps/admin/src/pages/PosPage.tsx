import { useEffect, useMemo, useState } from "react";
import QrPayPanel from "../components/QrPayPanel";
import { api } from "../api";
import { useAuth } from "../auth";

const QUICK_NOTES = [1, 5, 10, 20, 50, 100] as const;

function parseMoney(raw: string): number {
  if (!raw || raw === ".") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toFixed(2);
}

export default function PosPage() {
  const { token } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [chargeMode, setChargeMode] = useState<"full" | "deposit">("full");
  const [notes, setNotes] = useState("");
  const [tenderInput, setTenderInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showQr, setShowQr] = useState(false);
  const [lastCash, setLastCash] = useState<{ tendered: number; change: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .services(token)
      .then((s) => {
        const active = s.filter((x: any) => x.is_active);
        setServices(active);
        if (!serviceId && active[0]) setServiceId(String(active[0].id));
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const service = services.find((s) => String(s.id) === serviceId);
  const amountDue = useMemo(() => {
    if (!service) return 0;
    if (chargeMode === "deposit" && Number(service.deposit_amount || 0) > 0) {
      return Number(service.deposit_amount || 0);
    }
    return Number(service.price_amount || 0);
  }, [service, chargeMode]);
  const currency = service?.currency || "MYR";
  const tendered = parseMoney(tenderInput);
  const changeDue = Math.max(0, tendered - amountDue);
  const balanceDue = Math.max(0, amountDue - tendered);
  const canTakeCash = Boolean(serviceId) && tendered + 1e-9 >= amountDue && amountDue > 0;

  function resetSaleForm(keepService = true) {
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setTenderInput("");
    if (!keepService) setServiceId(services[0] ? String(services[0].id) : "");
  }

  function selectService(id: number) {
    setServiceId(String(id));
    setResult(null);
    setShowQr(false);
    setLastCash(null);
    setError("");
    // Reset tender when switching services so change math stays clear
    setTenderInput("");
  }

  function appendDigit(digit: string) {
    setTenderInput((prev) => {
      if (digit === ".") {
        if (prev.includes(".")) return prev;
        return prev ? `${prev}.` : "0.";
      }
      if (prev === "0") return digit;
      // limit to 2 decimal places
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      if (prev.length >= 10) return prev;
      return `${prev}${digit}`;
    });
  }

  function backspace() {
    setTenderInput((prev) => prev.slice(0, -1));
  }

  function clearTender() {
    setTenderInput("");
  }

  function setExact() {
    setTenderInput(formatMoney(amountDue));
  }

  function addQuick(amount: number) {
    setTenderInput(formatMoney(tendered + amount));
  }

  async function checkout(method: "cash" | "qr") {
    if (!token || !serviceId) return;
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
        service_id: Number(serviceId),
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        payment_method: method,
        charge_mode: chargeMode,
        notes: saleNotes || null,
      });
      setResult(sale);
      if (method === "qr") {
        setShowQr(true);
      } else {
        setLastCash({ tendered, change: changeDue });
        resetSaleForm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid pos-shell">
      <section className="panel pos-services-panel">
        <div className="bookings-toolbar">
          <div>
            <h1>Walk-in POS</h1>
            <p>Tap a service, then settle with cash or QR.</p>
          </div>
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
              disabled={!services.some((s) => Number(s.deposit_amount || 0) > 0)}
            >
              Deposit
            </button>
          </div>
        </div>

        {services.length === 0 ? (
          <p className="muted">No active services yet. Add some under Services.</p>
        ) : (
          <div className="pos-service-grid">
            {services.map((s) => {
              const selected = String(s.id) === serviceId;
              const price =
                chargeMode === "deposit" && Number(s.deposit_amount || 0) > 0
                  ? Number(s.deposit_amount)
                  : Number(s.price_amount);
              const disabled = chargeMode === "deposit" && Number(s.deposit_amount || 0) <= 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`pos-service-btn ${selected ? "selected" : ""}`}
                  disabled={disabled}
                  onClick={() => selectService(s.id)}
                >
                  <strong>{s.name}</strong>
                  <span className="pos-service-meta">
                    {s.duration_minutes} min · {s.currency} {Number(s.price_amount).toFixed(2)}
                  </span>
                  <span className="pos-service-price">
                    {chargeMode === "deposit" && Number(s.deposit_amount || 0) > 0
                      ? `Deposit ${s.currency} ${price.toFixed(2)}`
                      : `${s.currency} ${price.toFixed(2)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="pos-customer-row">
          <label>
            Customer
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in"
            />
          </label>
          <label>
            Phone
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            Note
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
      </section>

      <section className="panel pos-checkout-panel">
        {showQr && result?.payment_url ? (
          <QrPayPanel
            paymentUrl={result.payment_url}
            amountLabel={`${result.currency} ${Number(result.amount_due).toFixed(2)}`}
            subtitle={`${result.booking?.service?.name || "Sale"} · Ref #${result.booking?.id}`}
            onPaid={() => {
              setResult((prev: any) =>
                prev
                  ? {
                      ...prev,
                      already_paid: true,
                      booking: {
                        ...prev.booking,
                        payment_status:
                          chargeMode === "deposit" ? "deposit_paid" : "paid",
                      },
                    }
                  : prev,
              );
            }}
            onClose={() => {
              setShowQr(false);
              resetSaleForm(true);
            }}
          />
        ) : (
          <>
            <div className="pos-due-board">
              <div>
                <span className="muted">Selected</span>
                <strong>{service?.name || "Choose a service"}</strong>
              </div>
              <div className="pos-due-amount">
                <span className="muted">Amount due</span>
                <em>
                  {currency} {formatMoney(amountDue)}
                </em>
              </div>
            </div>

            <div className="pos-calc">
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

              <div className="pos-quick-notes">
                {QUICK_NOTES.map((n) => (
                  <button key={n} type="button" onClick={() => addQuick(n)}>
                    +{n}
                  </button>
                ))}
                <button type="button" onClick={setExact}>
                  Exact
                </button>
              </div>

              <div className="pos-keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={key === "⌫" ? "pos-key wide" : "pos-key"}
                    onClick={() => {
                      if (key === "⌫") backspace();
                      else appendDigit(key);
                    }}
                  >
                    {key}
                  </button>
                ))}
                <button type="button" className="pos-key danger" onClick={clearTender}>
                  C
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
                disabled={busy || !serviceId || amountDue <= 0}
                onClick={() => checkout("qr")}
              >
                Show QR pay
              </button>
            </div>

            {lastCash && result?.already_paid ? (
              <div className="pos-receipt">
                <strong>Cash sale recorded</strong>
                <div>
                  #{result.booking?.id} · {result.booking?.service?.name}
                </div>
                <div className="muted">
                  Tendered {currency} {formatMoney(lastCash.tendered)} · Change {currency}{" "}
                  {formatMoney(lastCash.change)}
                </div>
              </div>
            ) : null}

            {result && !result.already_paid && !showQr ? (
              <div className="pos-receipt">
                <strong>Sale created</strong>
                <div className="muted">
                  #{result.booking?.id} · {result.booking?.payment_status}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
