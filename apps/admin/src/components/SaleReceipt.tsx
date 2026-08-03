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

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length >= 9) {
    digits = `60${digits.slice(1)}`;
  }
  return digits;
}

function buildReceiptText(props: {
  shopName: string;
  bookingId: number;
  customerName: string;
  customerPhone: string;
  lineItems: string[];
  currency: string;
  amountDue: number;
  paymentLabel: string;
  cash: CashInfo;
  paidAt?: string | null;
}) {
  const when = props.paidAt
    ? new Date(props.paidAt).toLocaleString()
    : new Date().toLocaleString();
  const lines = [
    `${props.shopName} — receipt`,
    `Booking #${props.bookingId}`,
    `When: ${when}`,
    `Customer: ${props.customerName}`,
  ];
  if (props.customerPhone && !props.customerPhone.toLowerCase().startsWith("walkin-")) {
    lines.push(`Phone: ${props.customerPhone}`);
  }
  lines.push("", "Items:");
  for (const item of props.lineItems) lines.push(`• ${item}`);
  lines.push("", `Total: ${props.currency} ${formatMoney(props.amountDue)}`);
  lines.push(`Payment: ${props.paymentLabel}`);
  if (props.cash) {
    lines.push(`Cash received: ${props.currency} ${formatMoney(props.cash.tendered)}`);
    lines.push(`Change: ${props.currency} ${formatMoney(props.cash.change)}`);
  }
  lines.push("", "Thank you!");
  return lines.join("\n");
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
  const [phoneOverride, setPhoneOverride] = useState(() =>
    customerPhone && !customerPhone.toLowerCase().startsWith("walkin-") ? customerPhone : "",
  );

  const effectivePhone = phoneOverride.trim();
  const normalized = normalizePhone(effectivePhone);
  const canWhatsApp = normalized.length >= 8;

  function onPrint() {
    document.body.classList.add("printing-receipt");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-receipt"), 300);
  }

  function openWaLink(phone: string, body: string, apiWaUrl?: string | null) {
    const url =
      apiWaUrl || `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function onSendWhatsApp() {
    if (!canWhatsApp) {
      setError("Enter a valid WhatsApp number (e.g. 60123456789)");
      return;
    }
    setError("");
    setSentInfo("");
    setBusy(true);

    const localBody = buildReceiptText({
      shopName,
      bookingId,
      customerName,
      customerPhone: effectivePhone,
      lineItems,
      currency,
      amountDue,
      paymentLabel,
      cash,
      paidAt,
    });

    try {
      if (!token) throw new Error("Not signed in");
      const res = await api.sendPosReceipt(token, bookingId, {
        phone: normalized,
        cash_received: cash ? cash.tendered : undefined,
        change: cash ? cash.change : undefined,
      });
      if (res.delivered_via === "api") {
        setSentInfo(res.message || `Sent to WhatsApp ${res.sent_to}`);
      } else {
        openWaLink(res.sent_to || normalized, res.body || localBody, res.wa_url);
        setSentInfo(
          res.message
            ? `WhatsApp opened — tap Send. (${res.message})`
            : "WhatsApp opened with the receipt — tap Send to deliver.",
        );
      }
    } catch (err) {
      // Last-resort local fallback if the API call itself fails
      openWaLink(normalized, localBody);
      setSentInfo("WhatsApp opened with the receipt — tap Send to deliver.");
      setError(err instanceof Error ? err.message : "");
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
        <label className="pos-field">
          WhatsApp number
          <input
            value={phoneOverride}
            onChange={(e) => setPhoneOverride(e.target.value)}
            placeholder="60123456789"
          />
        </label>

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
