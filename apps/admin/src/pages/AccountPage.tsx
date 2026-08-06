import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

export default function AccountPage() {
  const t = useT();
  const { token, user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || "");
    setEmail(user?.email || "");
  }, [user]);

  const hasPassword = user?.has_password !== false;
  const provider = user?.auth_provider || "password";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      if (hasPassword && !currentPassword.trim()) {
        throw new Error("Enter your current password to save changes");
      }
      if (newPassword && newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters");
      }
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error("New password confirmation does not match");
      }
      await api.updateAccount(token, {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        current_password: currentPassword || undefined,
        new_password: newPassword || null,
      });
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(
        newPassword
          ? "Account updated. Use your new password next time you sign in."
          : "Account updated.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid page-scroll" style={{ gap: "1rem", maxWidth: 560 }}>
      <section className="panel" style={{ padding: "1.1rem 1.2rem" }}>
        <div className="bookings-toolbar">
          <div>
            <h1 style={{ margin: 0 }}>{t("account.title")}</h1>
            <p>
              {t("account.subtitle")}
              {provider.includes("google") ? t("account.signedInWithGoogle") : ""}
            </p>
          </div>
        </div>

        <form className="form" onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            {t("account.displayName")}
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label>
            {t("account.loginEmail")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          {hasPassword ? (
            <label>
              {t("account.currentPassword")}
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder={t("account.currentPasswordPlaceholder")}
              />
            </label>
          ) : (
            <p className="muted">{t("account.googleAccountHint")}</p>
          )}
          <label>
            {hasPassword ? t("account.newPassword") : t("account.setPassword")}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={
                hasPassword ? t("account.keepPasswordPlaceholder") : t("common.optional")
              }
              minLength={8}
            />
          </label>
          <label>
            {t("account.confirmNewPassword")}
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={t("account.confirmPasswordPlaceholder")}
            />
          </label>

          {error ? <div className="error">{error}</div> : null}
          {saved ? <p className="pos-status-msg">{saved}</p> : null}

          <button className="btn" disabled={busy}>
            {busy ? t("common.saving") : t("account.save")}
          </button>
        </form>
      </section>
    </div>
  );
}
