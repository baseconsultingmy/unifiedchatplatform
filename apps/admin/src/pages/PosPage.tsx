import { useEffect, useState, type FormEvent } from "react";
import QrPayPanel from "../components/QrPayPanel";
import { api } from "../api";
import { useAuth } from "../auth";

export default function PosPage() {
  const { token } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [chargeMode, setChargeMode] = useState<"full" | "deposit">("full");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .services(token)
      .then((s) => {
        setServices(s.filter((x: any) => x.is_active));
        if (s[0]) setServiceId(String(s[0].id));
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const service = services.find((s) => String(s.id) === serviceId);
  const amountDue =
    chargeMode === "deposit" && Number(service?.deposit_amount || 0) > 0
      ? Number(service?.deposit_amount || 0)
      : Number(service?.price_amount || 0);
  const currency = service?.currency || "MYR";

  async function checkout(method: "cash" | "qr") {
    if (!token || !serviceId) return;
    setError("");
    setBusy(true);
    setResult(null);
    setShowQr(false);
    try {
      const sale = await api.posSale(token, {
        service_id: Number(serviceId),
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        payment_method: method,
        charge_mode: chargeMode,
        notes: notes || null,
      });
      setResult(sale);
      if (method === "qr") setShowQr(true);
      if (method === "cash") {
        setCustomerName("");
        setCustomerPhone("");
        setNotes("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className="grid split-2">
      <section className="panel">
        <h1>Walk-in POS</h1>
        <p>Record a counter sale — cash now, or show a QR for the customer to pay.</p>

        <form className="form" onSubmit={onSubmit} style={{ marginTop: "1rem" }}>
          <label>
            Service
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.currency} {s.price_amount}
                  {Number(s.deposit_amount) > 0 ? ` (deposit ${s.deposit_amount})` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="segmented">
            <button
              type="button"
              className={chargeMode === "full" ? "active" : ""}
              onClick={() => setChargeMode("full")}
            >
              Full amount
            </button>
            <button
              type="button"
              className={chargeMode === "deposit" ? "active" : ""}
              onClick={() => setChargeMode("deposit")}
              disabled={!service || Number(service.deposit_amount || 0) <= 0}
            >
              Deposit only
            </button>
          </div>

          <div className="pos-total">
            <span className="muted">Amount due</span>
            <strong>
              {currency} {amountDue.toFixed(2)}
            </strong>
          </div>

          <label>
            Customer name
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in"
            />
          </label>
          <label>
            Phone (optional)
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="6012…"
            />
          </label>
          <label>
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>

          {error ? <div className="error">{error}</div> : null}

          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={busy || !serviceId}
              onClick={() => checkout("cash")}
            >
              Cash paid
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !serviceId}
              onClick={() => checkout("qr")}
            >
              Show QR pay
            </button>
          </div>
        </form>

        {result && !showQr ? (
          <div className="pos-receipt">
            <strong>Sale recorded</strong>
            <div className="muted">
              #{result.booking?.id} · {result.booking?.service?.name || "Service"} ·{" "}
              {result.already_paid ? "paid" : result.booking?.payment_status}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
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
                          prev.payment_method === "qr" && chargeMode === "deposit"
                            ? "deposit_paid"
                            : "paid",
                      },
                    }
                  : prev,
              );
            }}
            onClose={() => {
              setShowQr(false);
              setCustomerName("");
              setCustomerPhone("");
              setNotes("");
            }}
          />
        ) : (
          <div className="pos-idle">
            <h2>QR payments</h2>
            <p>
              Tap <strong>Show QR pay</strong> to create the sale and display a scannable checkout
              link. The panel updates automatically when the customer pays on their phone.
            </p>
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Demo mode uses BaseApp hosted checkout. HitPay / DuitNow QR can replace this later.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
