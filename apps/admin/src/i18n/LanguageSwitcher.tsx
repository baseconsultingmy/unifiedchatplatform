import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";

export default function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const current = locales.find((l) => l.code === locale) || locales[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`lang-switcher ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="lang-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("lang.title")}
        title={t("lang.title")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lang-switcher-globe" aria-hidden>
          文A
        </span>
        <span className="lang-switcher-code">{current.short}</span>
      </button>
      {open ? (
        <ul className="lang-switcher-menu" role="listbox" aria-label={t("lang.label")}>
          {locales.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === locale}>
              <button
                type="button"
                className={l.code === locale ? "on" : ""}
                onClick={() => {
                  setLocale(l.code);
                  setOpen(false);
                }}
              >
                <span className="lang-switcher-short">{l.short}</span>
                <span>{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
