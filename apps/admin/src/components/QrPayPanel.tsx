import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { api } from "../api";

type Props = {
  paymentUrl: string;
  amountLabel: string;
  subtitle?: string;
  onPaid?: () => void;
  onClose?: () => void;
};

function tokenFromUrl(url: string): string | null {
  try {
    const parts = url.replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

export default function QrPayPanel({
  paymentUrl,
  amountLabel,
  subtitle,
  onPaid,
  onClose,
}: Props) {
  const [dataUrl, setDataUrl] = useState("");
  const [status, setStatus] = useState("waiting");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(paymentUrl, {
      width: 240,
      margin: 1,
      color: { dark: "#14201c", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not render QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [paymentUrl]);

  useEffect(() => {
    const token = tokenFromUrl(paymentUrl);
    if (!token) return;
    let stopped = false;
    let notified = false;
    const tick = async () => {
      try {
        const s = await api.payStatus(token);
        if (stopped) return;
        if (s.payment_status === "paid" || s.payment_status === "deposit_paid") {
          setStatus(s.payment_status);
          if (!notified) {
            notified = true;
            onPaid?.();
          }
          return;
        }
        setStatus(s.payment_status || "waiting");
      } catch {
        /* keep polling */
      }
    };
    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [paymentUrl, onPaid]);

  const paid = status === "paid" || status === "deposit_paid";

  return (
    <div className="qr-panel">
      <div className="qr-panel-head">
        <div>
          <h3>{paid ? "Payment received" : "Scan to pay"}</h3>
          <p className="muted">{subtitle || "Customer scans with their phone camera"}</p>
        </div>
        {onClose ? (
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <div className="qr-amount">{amountLabel}</div>
      {error ? <div className="error">{error}</div> : null}
      {dataUrl ? (
        <img className="qr-image" src={dataUrl} alt="Payment QR code" />
      ) : (
        <div className="muted">Generating QR…</div>
      )}
      <div className={`qr-status ${paid ? "ok" : ""}`}>
        {paid ? "Paid — you can close this" : "Waiting for payment…"}
      </div>
      <a className="muted qr-link" href={paymentUrl} target="_blank" rel="noreferrer">
        Open pay page
      </a>
    </div>
  );
}
