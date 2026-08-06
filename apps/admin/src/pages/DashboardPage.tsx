import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

export default function DashboardPage() {
  const t = useT();
  const { token, user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  useEffect(() => {
    if (!token) return;
    api
      .dashboard(token)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">{t("common.loading")}</div>;

  if (isPlatformAdmin) {
    const cards = [
      [t("overview.vendors"), data.vendors_total],
      [t("overview.activeVendors"), data.vendors_active],
      [t("overview.allBookings"), data.bookings_total],
      [t("overview.openChats"), data.open_conversations],
      [t("overview.customers"), data.customers_total],
    ];
    return (
      <div className="grid page-scroll">
        <div>
          <h1>{t("overview.platformTitle")}</h1>
          <p>{t("overview.platformHint")}</p>
        </div>
        <div className="grid stats">
          {cards.map(([label, value]) => (
            <div className="panel stat" key={label as string}>
              <span className="muted">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2>{t("overview.next")}</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            {t("overview.createVendorHint")}
          </p>
          <Link className="btn btn-signal" to="/vendors">
            {t("overview.manageVendors")}
          </Link>
        </div>
      </div>
    );
  }

  const cards = [
    [t("overview.bookings"), data.bookings_total],
    [t("overview.confirmed"), data.bookings_confirmed],
    [t("overview.today"), data.bookings_today],
    [t("overview.openChats"), data.open_conversations],
    [t("overview.services"), data.services_active],
    [t("overview.customers"), data.customers_total],
  ];

  return (
    <div className="grid page-scroll">
      <div>
        <h1>{t("overview.vendorTitle")}</h1>
        <p>{t("overview.vendorHint")}</p>
      </div>
      <div className="grid stats">
        {cards.map(([label, value]) => (
          <div className="panel stat" key={label as string}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="grid split-2">
        <div className="panel">
          <h2>{t("overview.bookingsCalendar")}</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            {t("overview.bookingsCalendarHint")}
          </p>
          <Link className="btn" to="/bookings">
            {t("overview.openBookings")}
          </Link>
        </div>
        <div className="panel">
          <h2>{t("overview.walkInPos")}</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            {t("overview.walkInPosHint")}
          </p>
          <Link className="btn btn-signal" to="/pos">
            {t("overview.openPos")}
          </Link>
        </div>
        <div className="panel">
          <h2>{t("overview.salesReports")}</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            {t("overview.salesReportsHint")}
          </p>
          <Link className="btn" to="/reports">
            {t("overview.openReports")}
          </Link>
        </div>
      </div>
    </div>
  );
}
