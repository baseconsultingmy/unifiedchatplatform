import { useEffect, useMemo, useState } from "react";
import QrPayPanel from "../components/QrPayPanel";
import SaleReceipt from "../components/SaleReceipt";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile, type IndustryKey } from "../industry";
import { useT } from "../i18n";

type CartLine = {
  key: string;
  serviceId: number;
  quantity: number;
  remarks?: string;
  optionIds: number[];
  unitPrice: number;
  modLabels: string[];
  ticketLineId?: number;
};
type PayMethod = "cash" | "qr" | "card";
type CheckoutStep =
  | null
  | "customer"
  | "destination"
  | "find-table"
  | "payment"
  | "cash"
  | "qr"
  | "done"
  | "customize";

const TABLE_PRESETS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];

function parseMoney(raw: string): number {
  if (!raw || raw === ".") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toFixed(2);
}

function roundUpTender(amount: number, step: number): number {
  if (amount <= 0) return step;
  return Math.ceil(amount / step) * step;
}

function printKitchenSlip(slipText: string, title = "Kitchen") {
  const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body{font-family:ui-monospace,Menlo,Consolas,monospace;padding:16px;white-space:pre-wrap;font-size:14px}
      @media print{body{padding:0}}
    </style></head><body>${slipText.replace(/</g, "&lt;")}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 250);
}

const POS_TITLE_KEYS: Record<IndustryKey, string> = {
  health_beauty: "pos.titleCounter",
  fnb: "pos.titleKitchen",
  retail: "pos.titleRetail",
  general: "pos.title",
};

export default function PosPage() {
  const t = useT();
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const fast = profile.posFastCheckout;
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [category, setCategory] = useState("All");
  const [menuQuery, setMenuQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [chargeMode, setChargeMode] = useState<"full" | "deposit">("full");
  const [step, setStep] = useState<CheckoutStep>(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [customTable, setCustomTable] = useState("");
  const [activeTicketId, setActiveTicketId] = useState<number | null>(null);
  const [payMode, setPayMode] = useState<"takeaway" | "table">("takeaway");
  const [tableSearch, setTableSearch] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [tenderInput, setTenderInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [lastCash, setLastCash] = useState<{ tendered: number; change: number } | null>(null);
  const [customizeItem, setCustomizeItem] = useState<any | null>(null);
  const [pickedOptions, setPickedOptions] = useState<Record<number, number[]>>({});
  const [customRemark, setCustomRemark] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [statusMsg, setStatusMsg] = useState("");

  async function refreshCatalog() {
    if (!token) return;
    const [s, c] = await Promise.all([api.services(token), api.customers(token)]);
    setServices(s.filter((x: any) => x.is_active));
    setCustomers(c);
  }

  async function refreshTickets() {
    if (!token || !fast) return;
    try {
      setTickets(await api.posTickets(token, "open"));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!token) return;
    refreshCatalog()
      .then(() => refreshTickets())
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (step === "customize") {
        setStep(null);
        setCustomizeItem(null);
      } else if (step === "cash") setStep("payment");
      else if (step === "payment") {
        if (activeTicketId) {
          setOrderConfirmed(false);
          setStep(null);
        } else if (fast) setStep("destination");
        else setStep("customer");
      } else if (step === "destination") unlockCart();
      else if (step === "find-table") {
        setStep(null);
        setOrderConfirmed(false);
        setTableSearch("");
      } else if (step === "customer") setStep(null);
      else if (step === "qr" || step === "done") resetSale();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, fast, activeTicketId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.category) set.add(String(s.category));
    }
    return ["All", ...Array.from(set).sort()];
  }, [services]);

  const visibleServices = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    return services.filter((s) => {
      if (category !== "All" && (s.category || "General") !== category) return false;
      if (!q) return true;
      return (
        String(s.name || "")
          .toLowerCase()
          .includes(q) ||
        String(s.category || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [services, category, menuQuery]);

  const cartDetails = useMemo(() => {
    return cart
      .map((line) => {
        const service = services.find((s) => s.id === line.serviceId);
        if (!service) return null;
        return {
          ...line,
          service,
          unit: line.unitPrice,
          lineTotal: line.unitPrice * line.quantity,
        };
      })
      .filter(Boolean) as Array<CartLine & { service: any; unit: number; lineTotal: number }>;
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
  const canTakeCash = amountDue > 0 && tendered + 1e-9 >= amountDue;
  const depositAllowed =
    profile.showDeposit &&
    cartDetails.length === 1 &&
    cartDetails[0].quantity === 1 &&
    Number(cartDetails[0].service.deposit_amount || 0) > 0;

  const selectedCustomer = customerId ? customers.find((c) => c.id === customerId) : null;
  const guestLabel =
    selectedCustomer?.name ||
    customerName.trim() ||
    (payMode === "table" && tableLabel ? `Table ${tableLabel}` : "") ||
    (fast ? "Walk-in" : "Walk-in guest");
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

  const filteredTickets = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        String(t.table_label || "")
          .toLowerCase()
          .includes(q) || String(t.id).includes(q),
    );
  }, [tickets, tableSearch]);

  const occupiedTables = useMemo(() => {
    const set = new Set<string>();
    for (const t of tickets) {
      const label = String(t.table_label || "").trim().toLowerCase();
      if (label) set.add(label);
    }
    return set;
  }, [tickets]);

  const cashQuickAmounts = useMemo(() => {
    const exact = Number(amountDue.toFixed(2));
    const opts = [exact, roundUpTender(exact, 5), roundUpTender(exact, 10), 20, 50, 100];
    const uniq: number[] = [];
    for (const n of opts) {
      const v = Number(n.toFixed(2));
      if (v + 1e-9 >= exact && !uniq.includes(v)) uniq.push(v);
    }
    return uniq.slice(0, 5);
  }, [amountDue]);

  function resetSale() {
    setCart([]);
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setTenderInput("");
    setCustomerQuery("");
    setMenuQuery("");
    setChargeMode("full");
    setOrderConfirmed(false);
    setStep(null);
    setResult(null);
    setLastCash(null);
    setError("");
    setStatusMsg("");
    setCustomizeItem(null);
    setActiveTicketId(null);
    setTableLabel("");
    setCustomTable("");
    setPayMode("takeaway");
    setTableSearch("");
  }

  function computeUnit(service: any, optionIds: number[]) {
    let unit = Number(service.price_amount || 0);
    const labels: string[] = [];
    for (const g of service.modifiers || []) {
      for (const o of g.options || []) {
        if (optionIds.includes(o.id)) {
          unit += Number(o.price_delta || 0);
          labels.push(o.name);
        }
      }
    }
    return { unit, labels };
  }

  function openCustomize(service: any) {
    const groups = service.modifiers || [];
    if (!fast || !groups.length) {
      pushLine(service, [], "", 1);
      return;
    }
    const initial: Record<number, number[]> = {};
    for (const g of groups) {
      const first = (g.options || [])[0];
      if (g.required || g.min_select > 0) {
        initial[g.id] = first ? [first.id] : [];
      } else {
        initial[g.id] = [];
      }
    }
    setCustomizeItem(service);
    setPickedOptions(initial);
    setCustomRemark("");
    setCustomQty(1);
    setStep("customize");
  }

  function toggleOption(group: any, optionId: number) {
    setPickedOptions((prev) => {
      const cur = prev[group.id] || [];
      const max = Number(group.max_select || 1);
      if (max <= 1) return { ...prev, [group.id]: [optionId] };
      if (cur.includes(optionId)) {
        return { ...prev, [group.id]: cur.filter((id) => id !== optionId) };
      }
      if (cur.length >= max) return prev;
      return { ...prev, [group.id]: [...cur, optionId] };
    });
  }

  function confirmCustomize() {
    if (!customizeItem) return;
    for (const g of customizeItem.modifiers || []) {
      const picked = pickedOptions[g.id] || [];
      const min = Number(g.min_select || 0);
      if ((g.required || min > 0) && picked.length < Math.max(min, g.required ? 1 : 0)) {
        setError(`Choose ${g.name}`);
        return;
      }
    }
    const optionIds = Object.values(pickedOptions).flat();
    pushLine(customizeItem, optionIds, customRemark.trim(), customQty);
    setCustomizeItem(null);
    setStep(null);
    setError("");
  }

  function pushLine(service: any, optionIds: number[], remarks: string, quantity: number) {
    const { unit, labels } = computeUnit(service, optionIds);
    const remarkText = [labels.join(", "), remarks].filter(Boolean).join(" · ");
    const key = `${service.id}:${optionIds.slice().sort().join("-")}:${remarkText}`;
    setResult(null);
    setLastCash(null);
    setError("");
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          serviceId: service.id,
          quantity,
          remarks: remarkText || undefined,
          optionIds,
          unitPrice: unit,
          modLabels: labels,
        },
      ];
    });
  }

  function setQty(key: string, quantity: number) {
    if (orderConfirmed || (step && step !== "customize")) return;
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantity } : l));
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
    if (activeTicketId) {
      void proceedLoadedTicketPayment();
      return;
    }
    setOrderConfirmed(true);
    setPayMode("takeaway");
    if (fast) {
      setStep("destination");
      return;
    }
    setStep("customer");
  }

  function unlockCart() {
    setOrderConfirmed(false);
    setStep(null);
    setTenderInput("");
    setError("");
    if (!activeTicketId) setPayMode("takeaway");
  }

  function releaseLoadedTicket() {
    setActiveTicketId(null);
    setTableLabel("");
    setPayMode("takeaway");
    setStatusMsg("");
    setOrderConfirmed(false);
    setStep(null);
  }

  function proceedToPayment(withCustomer: boolean) {
    if (!withCustomer && !customerName.trim() && !customerId) {
      setCustomerName("Walk-in");
    }
    setStep("payment");
    setTenderInput("");
    setError("");
  }

  function chooseTakeaway() {
    setPayMode("takeaway");
    setTableLabel("Takeaway");
    setActiveTicketId(null);
    setCustomerName((n) => n || "Walk-in");
    setStep("payment");
    setTenderInput("");
    setError("");
  }

  async function chooseTable(label: string) {
    const table = label.trim();
    if (!token || !table || cartDetails.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const ticket = await api.createPosTicket(token, {
        table_label: table,
        notes: notes.trim() || null,
        lines: saleItemsPayload().map(({ service_id, quantity, remarks, option_ids }) => ({
          service_id,
          quantity,
          remarks,
          option_ids,
        })),
      });
      const sent = await api.sendKitchen(token, ticket.id);
      printKitchenSlip(sent.slip_text, `Table ${table}`);
      setStatusMsg(`Table ${table} · sent to kitchen · pay anytime from Pay table`);
      setCart([]);
      setOrderConfirmed(false);
      setStep(null);
      setNotes("");
      setCustomTable("");
      setActiveTicketId(null);
      await refreshTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not park table order");
    } finally {
      setBusy(false);
    }
  }

  async function openFindTable() {
    setError("");
    setTableSearch("");
    await refreshTickets();
    setStep("find-table");
  }

  function selectTicketToPay(ticket: any) {
    setActiveTicketId(ticket.id);
    setTableLabel(ticket.table_label || "");
    setPayMode("table");
    setCustomerName(`Table ${ticket.table_label}`);
    setCustomerId(null);
    setCustomerPhone("");
    setNotes(ticket.notes || "");
    setCart(
      (ticket.lines || []).map((ln: any) => {
        const optionIds = (ln.mods || [])
          .map((m: any) => m.option_id)
          .filter((id: unknown): id is number => typeof id === "number");
        const modLabels = (ln.mods || []).map((m: any) => m.name);
        return {
          key: `t-${ticket.id}-${ln.id}`,
          serviceId: ln.service_id,
          quantity: ln.quantity,
          remarks: ln.remarks || undefined,
          optionIds,
          unitPrice: Number(ln.unit_price || 0),
          modLabels,
          ticketLineId: ln.id,
        };
      }),
    );
    setOrderConfirmed(false);
    setStep(null);
    setTenderInput("");
    setError("");
    setStatusMsg(
      `Table ${ticket.table_label} loaded — check with customer, edit or add items, then pay`,
    );
    setResult(null);
    setLastCash(null);
  }

  async function proceedLoadedTicketPayment() {
    if (!token || !activeTicketId || cartDetails.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const before = tickets.find((t) => t.id === activeTicketId);
      const beforeQty = (before?.lines || []).reduce(
        (n: number, ln: any) => n + Number(ln.quantity || 0),
        0,
      );
      const afterQty = cartDetails.reduce((n, l) => n + l.quantity, 0);
      const hadNewOrExtra = cartDetails.some((l) => !l.ticketLineId) || afterQty > beforeQty;

      await api.replacePosTicketLines(token, activeTicketId, {
        lines: saleItemsPayload().map(({ service_id, quantity, remarks, option_ids }) => ({
          service_id,
          quantity,
          remarks,
          option_ids,
        })),
        notes: notes.trim() || null,
      });

      if (hadNewOrExtra) {
        const sent = await api.sendKitchen(token, activeTicketId);
        printKitchenSlip(sent.slip_text, `Table ${tableLabel}`);
      }

      // Refresh cart keys from synced ticket so later pays stay linked
      const fresh = await api.posTickets(token, "open");
      setTickets(fresh);
      const synced = fresh.find((t: any) => t.id === activeTicketId);
      if (synced) {
        setCart(
          (synced.lines || []).map((ln: any) => {
            const optionIds = (ln.mods || [])
              .map((m: any) => m.option_id)
              .filter((id: unknown): id is number => typeof id === "number");
            return {
              key: `t-${synced.id}-${ln.id}`,
              serviceId: ln.service_id,
              quantity: ln.quantity,
              remarks: ln.remarks || undefined,
              optionIds,
              unitPrice: Number(ln.unit_price || 0),
              modLabels: (ln.mods || []).map((m: any) => m.name),
              ticketLineId: ln.id,
            };
          }),
        );
      }

      setOrderConfirmed(true);
      setPayMode("table");
      setStep("payment");
      setTenderInput("");
      setStatusMsg(`Table ${tableLabel} · ready to pay`);
      await refreshTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update table order");
    } finally {
      setBusy(false);
    }
  }

  function choosePayment(method: PayMethod) {
    setError("");
    if (method === "card") return;
    if (method === "cash") {
      setTenderInput("");
      setStep("cash");
      return;
    }
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

  function saleItemsPayload() {
    return cartDetails.map((l) => ({
      service_id: l.serviceId,
      quantity: l.quantity,
      remarks: l.remarks || null,
      option_ids: l.optionIds,
      unit_price: l.unitPrice,
    }));
  }

  async function checkout(method: "cash" | "qr") {
    if (!token) return;
    if (!activeTicketId && cartDetails.length === 0) return;
    if (method === "cash" && !canTakeCash) {
      setError("Cash received must cover the amount due");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const saleNotes = [
        tableLabel ? `Table ${tableLabel}` : payMode === "takeaway" ? "Takeaway" : null,
        notes.trim(),
        method === "cash"
          ? `Cash received ${currency} ${formatMoney(tendered)}; change ${currency} ${formatMoney(changeDue)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const sale = await api.posSale(token, {
        items: saleItemsPayload(),
        ticket_id: activeTicketId || undefined,
        customer_id: customerId,
        customer_name: customerName || (payMode === "takeaway" ? "Takeaway" : null),
        customer_phone: customerPhone || null,
        payment_method: method,
        charge_mode: depositAllowed && chargeMode === "deposit" ? "deposit" : "full",
        notes: saleNotes || null,
        table_label: tableLabel || (payMode === "takeaway" ? "Takeaway" : null),
      });
      setResult(sale);
      if (method === "qr") {
        setStep("qr");
      } else {
        setLastCash({ tendered, change: changeDue });
        setStep("done");
      }
      await refreshTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
      if (method === "qr") setStep("payment");
    } finally {
      setBusy(false);
    }
  }

  const locked = orderConfirmed || Boolean(step && step !== "customize");
  const openTicketCount = tickets.length;

  return (
    <div className={`pos-shell page-fill ${fast ? "pos-fnb pos-fnb-clean" : ""}`}>
      <section className="panel pos-catalog page-panel">
        <div className="pos-catalog-head">
          <div>
            <h1>{t(POS_TITLE_KEYS[profile.key])}</h1>
            <p>{fast ? t("pos.fastHint") : profile.posHint}</p>
          </div>
          <div className="pos-catalog-tools">
            {fast ? (
              <button
                type="button"
                className="pos-pay-table-btn"
                onClick={openFindTable}
                disabled={busy}
              >
                {t("pos.payTable")}
                {openTicketCount ? ` (${openTicketCount})` : ""}
              </button>
            ) : null}
            {fast ? (
              <label className="pos-menu-search">
                <span className="muted">{t("pos.search")}</span>
                <input
                  value={menuQuery}
                  onChange={(e) => setMenuQuery(e.target.value)}
                  placeholder="Milo, teh…"
                  disabled={locked}
                />
              </label>
            ) : null}
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
          <div className={`pos-service-grid ${locked ? "locked" : ""} ${fast ? "dense" : ""}`}>
            {visibleServices.map((s) => {
              const inCart = cart.filter((l) => l.serviceId === s.id);
              const qty = inCart.reduce((n, l) => n + l.quantity, 0);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`pos-service-btn ${qty ? "selected" : ""}`}
                  onClick={() => openCustomize(s)}
                  disabled={locked}
                >
                  {qty ? <span className="pos-qty-badge">×{qty}</span> : null}
                  <strong>{s.name}</strong>
                  <span className="pos-service-meta">
                    {s.category || "General"}
                    {(s.modifiers || []).length ? " · customise" : ""}
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
            <h2>
              {activeTicketId && tableLabel ? `Table ${tableLabel}` : profile.posTicketNoun}
            </h2>
            <p className="muted">
              {activeTicketId
                ? itemCount
                  ? `${itemCount} item${itemCount === 1 ? "" : "s"} · review before pay`
                  : "Add items, then pay"
                : itemCount
                  ? `${itemCount} item${itemCount === 1 ? "" : "s"}`
                  : `Tap ${profile.catalogNounSingular.toLowerCase()}s to start`}
            </p>
          </div>
          <div className="pos-register-head-actions">
            {activeTicketId ? (
              <button
                type="button"
                className="btn secondary"
                onClick={releaseLoadedTicket}
                disabled={busy || Boolean(step && step !== "customize")}
              >
                Unload
              </button>
            ) : null}
            <button
              type="button"
              className="btn secondary"
              onClick={resetSale}
              disabled={!cart.length && !result && step !== "done"}
            >
              {t("pos.clear")}
            </button>
          </div>
        </div>

        {statusMsg ? <p className="pos-status-msg">{statusMsg}</p> : null}

        {profile.posShowOrderNote && !locked ? (
          <label className="pos-field">
            Kitchen note
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </label>
        ) : null}

        <div className="pos-register-body">
          {cartDetails.length === 0 ? (
            <div className="pos-register-empty muted">
              {fast ? "Build the order, then confirm." : "Tap services on the left to build the cart."}
            </div>
          ) : (
            <div className="pos-register-lines">
              {cartDetails.map((line) => (
                <div key={line.key} className="pos-register-line">
                  <div className="pos-register-line-main">
                    <strong>{line.service.name}</strong>
                    <span className="muted">
                      {currency} {formatMoney(line.unit)}
                      {line.remarks ? ` · ${line.remarks}` : ""}
                    </span>
                  </div>
                  <div className="pos-qty">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setQty(line.key, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setQty(line.key, line.quantity + 1)}
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

        <div className={`pos-ticket-footer ${orderConfirmed ? "locked" : ""}`}>
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
            <span>{t("pos.total")}</span>
            <strong>
              {currency} {formatMoney(amountDue)}
            </strong>
          </div>

          {!orderConfirmed ? (
            <button
              type="button"
              className="btn pos-charge-btn"
              disabled={cartDetails.length === 0 || amountDue <= 0 || busy}
              onClick={startConfirmOrder}
            >
              {activeTicketId ? t("pos.proceedToPayment") : t("pos.confirmOrder")}
              {amountDue > 0 ? ` · ${currency} ${formatMoney(amountDue)}` : ""}
            </button>
          ) : null}
          {error && !step ? <div className="error">{error}</div> : null}
        </div>
      </aside>

      {/* Customise */}
      {step === "customize" && customizeItem ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>{customizeItem.name}</h2>
                <p>
                  {customizeItem.currency} {Number(customizeItem.price_amount).toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setStep(null);
                  setCustomizeItem(null);
                }}
              >
                Cancel
              </button>
            </div>
            {(customizeItem.modifiers || []).map((g: any) => (
              <div key={g.id} style={{ marginBottom: "0.85rem" }}>
                <strong>{g.name}</strong>
                <div className="pos-mod-options">
                  {(g.options || []).map((o: any) => {
                    const selected = (pickedOptions[g.id] || []).includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={`pos-mod-option ${selected ? "active" : ""}`}
                        onClick={() => toggleOption(g, o.id)}
                      >
                        {o.name}
                        {Number(o.price_delta) ? (
                          <span className="muted"> +{Number(o.price_delta).toFixed(2)}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="btn-row" style={{ alignItems: "end" }}>
              <label className="pos-field" style={{ flex: 1 }}>
                Extra remark
                <input
                  value={customRemark}
                  onChange={(e) => setCustomRemark(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="pos-field" style={{ width: "5rem" }}>
                Qty
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={customQty}
                  onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            </div>
            {error ? <div className="error">{error}</div> : null}
            <button type="button" className="btn pos-charge-btn" onClick={confirmCustomize}>
              Add to order
            </button>
          </div>
        </div>
      ) : null}

      {/* Destination: Takeaway vs Table */}
      {step === "destination" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal pos-dest-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>Where is this order?</h2>
                <p>
                  {currency} {formatMoney(amountDue)} · {itemCount} item
                  {itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <button type="button" className="btn secondary" onClick={unlockCart}>
                Back
              </button>
            </div>

            <button
              type="button"
              className="pos-dest-takeaway"
              disabled={busy}
              onClick={chooseTakeaway}
            >
              <strong>Takeaway</strong>
              <span>Go straight to payment</span>
            </button>

            <p className="pos-dest-label">Or send to a table · kitchen first, pay later</p>
            <div className="pos-dest-tables">
              {TABLE_PRESETS.map((t) => {
                const busyTable = occupiedTables.has(t.toLowerCase());
                return (
                  <button
                    key={t}
                    type="button"
                    className={`pos-dest-table ${busyTable ? "busy" : ""}`}
                    disabled={busy}
                    onClick={() => chooseTable(t)}
                  >
                    {t}
                    {busyTable ? <small>open</small> : null}
                  </button>
                );
              })}
            </div>
            <div className="pos-dest-custom">
              <input
                value={customTable}
                onChange={(e) => setCustomTable(e.target.value)}
                placeholder="Custom table…"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customTable.trim()) {
                    e.preventDefault();
                    void chooseTable(customTable.trim());
                  }
                }}
              />
              <button
                type="button"
                disabled={busy || !customTable.trim()}
                onClick={() => chooseTable(customTable.trim())}
              >
                Send
              </button>
            </div>
            {error ? <div className="error">{error}</div> : null}
            {busy ? <p className="muted">Sending to kitchen…</p> : null}
          </div>
        </div>
      ) : null}

      {/* Find open table order to pay */}
      {step === "find-table" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>Pay table</h2>
                <p>Search open orders by table number</p>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setStep(null);
                  setOrderConfirmed(false);
                  setTableSearch("");
                }}
              >
                Close
              </button>
            </div>
            <input
              className="pos-ticket-search"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search table or order #…"
              autoFocus
            />
            <div className="pos-ticket-pick-list">
              {filteredTickets.length === 0 ? (
                <p className="muted">No open table orders.</p>
              ) : (
                filteredTickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="pos-ticket-pick"
                    onClick={() => selectTicketToPay(t)}
                  >
                    <strong>{t.table_label}</strong>
                    <span>
                      #{t.id} · {(t.lines || []).length} item
                      {(t.lines || []).length === 1 ? "" : "s"}
                    </span>
                    <em>
                      {t.currency} {Number(t.total_amount).toFixed(2)}
                    </em>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {step === "customer" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>Customer information</h2>
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
            </div>
            <div className="btn-row pos-actions">
              <button type="button" className="btn" onClick={() => proceedToPayment(true)}>
                Confirm &amp; pay
              </button>
              <button type="button" className="btn secondary" onClick={() => proceedToPayment(false)}>
                Skip and proceed to payment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "payment" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>Choose payment</h2>
                <p>
                  {guestLabel} · {currency} {formatMoney(amountDue)}
                </p>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (activeTicketId) {
                    setOrderConfirmed(false);
                    setStep(null);
                  } else if (fast) setStep("destination");
                  else setStep("customer");
                }}
              >
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
            </div>
            {error ? <div className="error">{error}</div> : null}
          </div>
        </div>
      ) : null}

      {step === "cash" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>Cash received</h2>
                <p>
                  Amount due {currency} {formatMoney(amountDue)}
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
              <div className="btn-row pos-cash-quick">
                {cashQuickAmounts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="btn secondary"
                    onClick={() => setTenderInput(formatMoney(n))}
                  >
                    {n === Number(amountDue.toFixed(2)) ? "Exact" : formatMoney(n)}
                  </button>
                ))}
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
            </div>
            {error ? <div className="error">{error}</div> : null}
            <button
              type="button"
              className="btn pos-charge-btn"
              disabled={busy || !canTakeCash}
              onClick={() => checkout("cash")}
            >
              Take cash &amp; issue receipt
            </button>
          </div>
        </div>
      ) : null}

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
              onPaid={() => setStep("done")}
              onClose={resetSale}
            />
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="modal-backdrop" role="presentation" onClick={resetSale}>
          <div
            className="modal-card booking-modal pos-flow-modal receipt-modal"
            role="dialog"
            aria-modal="true"
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
