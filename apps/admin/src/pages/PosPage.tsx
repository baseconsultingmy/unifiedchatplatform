import { useEffect, useMemo, useState } from "react";
import QrPayPanel from "../components/QrPayPanel";
import SaleReceipt from "../components/SaleReceipt";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

type CartLine = { serviceId: number; quantity: number };
type PayMethod = "cash" | "qr" | "card";
type CheckoutStep = null | "customer" | "payment" | "cash" | "qr" | "done";

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
  const [step, setStep] = useState<CheckoutStep>(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [tenderInput, setTenderInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (step === "cash") setStep("payment");
      else if (step === "payment") setStep("customer");
      else if (step === "customer") setStep(null);
      else if (step === "qr" || step === "done") resetSale();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

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

  const itemCount = cartDetails.reduce((n, l) => n + l.quantity, 0);
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

  const currency = cartDetails[0]?.service?.currency || result?.currency || "MYR";
  const tendered = parseMoney(tenderInput);
  const changeDue = Math.max(0, tendered - amountDue);
  const balanceDue = Math.max(0, amountDue - tendered);
  const canTakeCash = cartDetails.length > 0 && tendered + 1e-9 >= amountDue && amountDue > 0;
  const depositAllowed =
    profile.showDeposit &&
    cartDetails.length === 1 &&
    cartDetails[0].quantity === 1 &&
    Number(cartDetails[0].service.deposit_amount || 0) > 0;

  const selectedCustomer = customerId ? customers.find((c) => c.id === customerId) : null;
  const guestLabel = selectedCustomer?.name || customerName.trim() || "Walk-in guest";
  const guestPhone = selectedCustomer?.phone || customerPhone.trim() || "";

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

  function resetSale() {
    setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setTenderInput("");
    setCustomerQuery("");
    setChargeMode("full");
    setOrderConfirmed(false);
    setStep(null);
    setResult(null);
    setLastCash(null);
    setError("");
  }

  function addToCart(serviceId: number) {
    if (orderConfirmed || step) return;
    setResult(null);
    setLastCash(null);
    setError("");
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
    if (orderConfirmed || step) return;
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.serviceId !== serviceId);
      return prev.map((l) => (l.serviceId === serviceId ? { ...l, quantity } : l));
    });
  }

  function pickCustomer(c: any) {
    setCustomerId(c.id);
    setCustomerName(c.name || "");
    setCustomerPhone(c.phone || "");
    setCustomerQuery("");
  }

  function setWalkIn() {
    setCustomerId(null);
    setCustomerName("Walk-in");
    setCustomerPhone("");
    setCustomerQuery("");
  }

  function clearCustomer() {
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setCustomerQuery("");
  }

  function startConfirmOrder() {
    if (cartDetails.length === 0 || amountDue <= 0) return;
    setError("");
    setOrderConfirmed(true);
    setStep("customer");
  }

  function unlockCart() {
    setOrderConfirmed(false);
    setStep(null);
    setTenderInput("");
    setError("");
  }

  function proceedToPayment(withCustomer: boolean) {
    if (!withCustomer) {
      // skip customer — keep walk-in defaults if empty
      if (!customerName.trim() && !customerId) {
        setCustomerName("Walk-in");
      }
    }
    setStep("payment");
    setTenderInput("");
    setError("");
  }

  function choosePayment(method: PayMethod) {
    setError("");
    if (method === "card") return;
    if (method === "cash") {
      setTenderInput("");
      setStep("cash");
      return;
    }
    // QR — create sale then show QR
    void checkout("qr");
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
    try {
      const saleNotes = [
        notes.trim(),
        method === "cash"
          ? `Cash received ${currency} ${formatMoney(tendered)}; change ${currency} ${formatMoney(changeDue)}`
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
        setStep("qr");
      } else {
        setLastCash({ tendered, change: changeDue });
        setStep("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
      if (method === "qr") setStep("payment");
    } finally {
      setBusy(false);
    }
  }

  const locked = orderConfirmed || Boolean(step);

  return (
    <div className="pos-shell page-fill">
      <section className="panel pos-catalog page-panel">
        <div className="pos-catalog-head">
          <div>
            <h1>{profile.posTitle}</h1>
            <p>{profile.posHint}</p>
          </div>
        </div>

        <div className="pos-category-row">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`pos-chip ${category === c ? "active" : ""}`}
              onClick={() => setCategory(c)}
              disabled={locked}
            >
              {c}
            </button>
          ))}
        </div>

        {visibleServices.length === 0 ? (
          <p className="muted">No active {profile.catalogNoun.toLowerCase()} yet.</p>
        ) : (
          <div className={`pos-service-grid ${locked ? "locked" : ""}`}>
            {visibleServices.map((s) => {
              const inCart = cart.find((l) => l.serviceId === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`pos-service-btn ${inCart ? "selected" : ""}`}
                  onClick={() => addToCart(s.id)}
                  disabled={locked}
                >
                  <strong>{s.name}</strong>
                  <span className="pos-service-meta">
                    {s.category || "General"}
                    {profile.showDuration ? ` · ${s.duration_minutes} min` : ""}
                    {inCart ? ` · ×${inCart.quantity}` : ""}
                  </span>
                  <span className="pos-service-price">
                    {s.currency} {Number(s.price_amount).toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="panel pos-cart-side page-panel">
        <div className="pos-register-head">
          <div>
            <h2>Cart</h2>
            <p className="muted">
              {itemCount
                ? `${itemCount} item${itemCount === 1 ? "" : "s"} selected`
                : "Select items from POS"}
            </p>
          </div>
          <button
            type="button"
            className="btn secondary"
            onClick={resetSale}
            disabled={!cart.length && !result && step !== "done"}
          >
            New sale
          </button>
        </div>

        <div className="pos-register-body">
          {cartDetails.length === 0 ? (
            <div className="pos-register-empty muted">Tap services on the left to build the cart.</div>
          ) : (
            <div className="pos-register-lines">
              {cartDetails.map((line) => (
                <div key={line.serviceId} className="pos-register-line">
                  <div className="pos-register-line-main">
                    <strong>{line.service.name}</strong>
                    <span className="muted">
                      {currency} {formatMoney(line.unit)} each
                    </span>
                  </div>
                  <div className="pos-qty">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={locked}
                      onClick={() => setQty(line.serviceId, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={locked}
                      onClick={() => setQty(line.serviceId, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="pos-line-total">{formatMoney(line.lineTotal)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`pos-confirmed ${orderConfirmed ? "active" : ""}`}>
          <div className="pos-confirmed-head">
            <div>
              <h3>Confirmed order / booking</h3>
              <p className="muted">
                {orderConfirmed
                  ? "Locked for checkout — customer & payment next"
                  : "Review the cart, then confirm to continue"}
              </p>
            </div>
            {orderConfirmed && step !== "done" && step !== "qr" ? (
              <button type="button" className="btn secondary" onClick={unlockCart}>
                Edit cart
              </button>
            ) : null}
          </div>

          {cartDetails.length === 0 ? (
            <div className="muted">Nothing confirmed yet.</div>
          ) : (
            <ul className="pos-confirmed-list">
              {cartDetails.map((line) => (
                <li key={line.serviceId}>
                  <span>
                    {line.quantity}× {line.service.name}
                  </span>
                  <span>
                    {currency} {formatMoney(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {depositAllowed && !locked ? (
            <div className="segmented pos-charge-mode">
              <button
                type="button"
                className={chargeMode === "full" ? "active" : ""}
                onClick={() => setChargeMode("full")}
              >
                Full
              </button>
              <button
                type="button"
                className={chargeMode === "deposit" ? "active" : ""}
                onClick={() => setChargeMode("deposit")}
              >
                Deposit
              </button>
            </div>
          ) : null}

          <div className="pos-register-total">
            <span>
              {chargeMode === "deposit" && depositAllowed ? "Deposit due" : "Total due"}
            </span>
            <strong>
              {currency} {formatMoney(amountDue)}
            </strong>
          </div>

          {orderConfirmed ? (
            <div className="pos-customer-chip static">
              <div>
                <span className="muted">Customer</span>
                <strong>{guestLabel}</strong>
                <span className="muted">{guestPhone || "No phone yet"}</span>
              </div>
            </div>
          ) : null}

          {!orderConfirmed ? (
            <div className="btn-row pos-actions">
              <button
                type="button"
                className="btn"
                disabled={cartDetails.length === 0 || amountDue <= 0}
                onClick={startConfirmOrder}
              >
                Confirm order
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Step 1: Customer */}
      {step === "customer" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-customer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2 id="pos-customer-title">Customer information</h2>
                <p>Attach a guest, or skip and go straight to payment.</p>
              </div>
              <button type="button" className="btn secondary" onClick={unlockCart}>
                Cancel
              </button>
            </div>

            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={setWalkIn}>
                Walk-in
              </button>
              <button type="button" className="btn secondary" onClick={clearCustomer}>
                Clear
              </button>
            </div>

            <label className="pos-field">
              Search existing
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Name or phone"
                autoFocus
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
                <div className="muted">No matches — enter a new guest below.</div>
              ) : null}
            </div>

            <div className="pos-customer-fields">
              <label className="pos-field">
                Name
                <input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setCustomerId(null);
                  }}
                  placeholder="Walk-in"
                />
              </label>
              <label className="pos-field">
                Phone
                <input
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    setCustomerId(null);
                  }}
                  placeholder="6012…"
                />
              </label>
              <label className="pos-field">
                Note
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className="pos-customer-active">
              <span className="muted">Will charge</span>
              <strong>
                {currency} {formatMoney(amountDue)}
              </strong>
              <span className="muted">{guestLabel}</span>
            </div>

            <div className="btn-row pos-actions pos-flow-actions">
              <button type="button" className="btn" onClick={() => proceedToPayment(true)}>
                Confirm &amp; pay
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => proceedToPayment(false)}
              >
                Skip and proceed to payment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Step 2: Payment method */}
      {step === "payment" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-pay-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2 id="pos-pay-title">Choose payment</h2>
                <p>
                  {guestLabel} · {currency} {formatMoney(amountDue)}
                </p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setStep("customer")}>
                Back
              </button>
            </div>

            <div className="pos-pay-options">
              <button
                type="button"
                className="pos-pay-option"
                disabled={busy}
                onClick={() => choosePayment("cash")}
              >
                <strong>Cash</strong>
                <span className="muted">Enter cash received and calculate change</span>
              </button>
              <button
                type="button"
                className="pos-pay-option"
                disabled={busy}
                onClick={() => choosePayment("qr")}
              >
                <strong>QR pay</strong>
                <span className="muted">Show a payment QR for the customer</span>
              </button>
              <button type="button" className="pos-pay-option" disabled title="Coming soon">
                <strong>Card</strong>
                <span className="muted">Coming soon</span>
              </button>
            </div>

            {error ? <div className="error">{error}</div> : null}
            {busy ? <div className="muted">Preparing payment…</div> : null}
          </div>
        </div>
      ) : null}

      {/* Step 3a: Cash calculator */}
      {step === "cash" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-cash-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2 id="pos-cash-title">Cash received</h2>
                <p>
                  Amount due {currency} {formatMoney(amountDue)} — change prints on the receipt.
                </p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setStep("payment")}>
                Back
              </button>
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

              <div className="pos-keypad">
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
                Take cash &amp; issue receipt
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Step 3b: QR */}
      {step === "qr" && result?.payment_url ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
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
                setStep("done");
              }}
              onClose={() => {
                resetSale();
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Receipt / done */}
      {step === "done" && result ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={resetSale}
        >
          <div
            className="modal-card booking-modal pos-flow-modal receipt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-receipt-title"
            onClick={(e) => e.stopPropagation()}
          >
            <SaleReceipt
              token={token}
              shopName={user?.tenant?.name || "BaseApp"}
              bookingId={result.booking?.id}
              customerName={guestLabel}
              customerPhone={guestPhone}
              lineItems={result.line_items || []}
              currency={result.currency || currency}
              amountDue={Number(result.amount_due || 0)}
              paymentLabel={lastCash ? "Cash" : "QR / online"}
              cash={lastCash}
              paidAt={result.booking?.paid_at}
              onDone={resetSale}
              onClose={resetSale}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
