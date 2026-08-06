/** ISO country → ISO currency for BaseApp markets. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  MY: "MYR",
  TH: "THB",
  SG: "SGD",
  ID: "IDR",
};

export const COUNTRY_TIMEZONE: Record<string, string> = {
  MY: "Asia/Kuala_Lumpur",
  TH: "Asia/Bangkok",
  SG: "Asia/Singapore",
  ID: "Asia/Jakarta",
};

export const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "MY", label: "Malaysia (MYR)" },
  { value: "TH", label: "Thailand (THB)" },
  { value: "SG", label: "Singapore (SGD)" },
  { value: "ID", label: "Indonesia (IDR)" },
];

export function currencyForCountry(country?: string | null): string {
  const code = (country || "MY").trim().toUpperCase().slice(0, 2);
  return COUNTRY_CURRENCY[code] || "MYR";
}

export function timezoneForCountry(country?: string | null): string {
  const code = (country || "MY").trim().toUpperCase().slice(0, 2);
  return COUNTRY_TIMEZONE[code] || COUNTRY_TIMEZONE.MY;
}

export function shopCurrency(tenant?: { currency?: string | null; country?: string | null } | null): string {
  if (tenant?.currency) return String(tenant.currency).toUpperCase();
  return currencyForCountry(tenant?.country);
}
