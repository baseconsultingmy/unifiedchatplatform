import { useRef, useState } from "react";
import { api } from "../api";

type CashInfo = { tendered: number; change: number } | null;

type Props = {
  token: string | null;
  shopName?: string;
  bookingId: number;
  customerName: string;
  customerPhone: string;
  lineItems: string[];
  currency: string;
  amountDue: number;
  paymentLabel: string;
  cash?: CashInfo;
  paidAt?: string | null;
  onDone?: () => void;
};

function formatMoney(n: number) {
  return n.toFixed(2);
}

export default function SaleReceipt({
  token,
  shopName = "BaseApp",
  bookingId,
  customerName,
  customerPhone,
  lineItems,
  currency,
  amountDue,
  paymentLabel,
  cash = null,
  paidAt,
  onDone,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentInfo, setSentInfo] = useState("");
  const [phoneOverride, setPhoneOverride] = useState("");

  const effectivePhone = (phoneOverride || customerPhone || "").trim();
  const canWhatsApp =
    effectivePhone.length >= 8 && !effectivePhone.toLowerCase().startsWith("walkin-");

  function onPrint() {
    document.body.classList.add("printing-receipt");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-receipt"), 300);
  }

  async function onSendWhatsApp() {
    if (!token) return;
    setError("");
    setSentInfo("");
    setBusy(true);
    try {
      const res = await api.sendPosReceipt(token, bookingId, {
        phone: canWhatsApp ? effectivePhone : undefined,
        cash_received: cash ? cash.tendered : undefined,
        change: cash ? cash.change : undefined,
      });
      setSentInfo(`Sent to WhatsApp ${res.sent_to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send receipt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sale-receipt">
      <div className="bookings-toolbar no-print">
        <div>
          <h2 id="pos-receipt-title">Sale receipt</h2>
          <p>Booking #{bookingId}</p>
        </div>
      </div>

      <div className="receipt-print-root" ref={printRef}>
        <div className="pos-receipt-sheet">
          <div className="pos-receipt-brand">
            <strong>{shopName}</strong>
            <span className="muted">Official receipt</span>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">Booking</span>
            <strong>#{bookingId}</strong>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">When</span>
            <span>{paidAt ? new Date(paidAt).toLocaleString() : new Date().toLocaleString()}</span>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">Customer</span>
            <strong>{customerName}</strong>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">Phone</span>
            <span>{effectivePhone || "—"}</span>
          </div>
          <ul className="pos-confirmed-list">
            {lineItems.map((line, idx) => (
              <li key={`${line}-${idx}`}>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="pos-receipt-row total">
            <span>Total</span>
            <strong>
              {currency} {formatMoney(amountDue)}
            </strong>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">Payment</span>
            <strong>{paymentLabel}</strong>
          </div>
          {cash ? (
            <>
              <div className="pos-receipt-row">
                <span className="muted">Cash received</span>
                <strong>
                  {currency} {formatMoney(cash.tendered)}
                </strong>
              </div>
              <div className="pos-receipt-row">
                <span className="muted">Change</span>
                <strong>
                  {currency} {formatMoney(cash.change)}
                </strong>
              </div>
            </>
          ) : null}
          <p className="pos-receipt-thanks muted">Thank you for your visit.</p>
        </div>
      </div>

      <div className="no-print pos-receipt-actions">
        {!canWhatsApp ? (
          <label className="pos-field">
            WhatsApp number to send
            <input
              value={phoneOverride}
              onChange={(e) => setPhoneOverride(e.target.value)}
              placeholder="6012…"
            />
          </label>
        ) : null}

        {error ? <div className="error">{error}</div> : null}
        {sentInfo ? <div className="pos-receipt ok">{sentInfo}</div> : null}

        <div className="btn-row pos-actions">
          <button type="button" className="btn secondary" onClick={onPrint}>
            Print
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || !canWhatsApp}
            onClick={onSendWhatsApp}
            title={canWhatsApp ? "Send receipt on WhatsApp" : "Enter a WhatsApp number first"}
          >
            {busy ? "Sending…" : "Send to WhatsApp"}
          </button>
        </div>
        {onDone ? (
          <div className="btn-row pos-actions">
            <button type="button" className="btn" onClick={onDone}>
              New sale
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
