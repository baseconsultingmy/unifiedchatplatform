/** ISO country → ISO currency for BaseApp markets. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  MY: "MYR",
  TH: "THB",
  SG: "SGD",
  ID: "IDR",
};

export function currencyForCountry(country?: string | null): string {
  const code = (country || "MY").trim().toUpperCase().slice(0, 2);
  return COUNTRY_CURRENCY[code] || "MYR";
}

export function shopCurrency(tenant?: { currency?: string | null; country?: string | null } | null): string {
  if (tenant?.currency) return String(tenant.currency).toUpperCase();
  return currencyForCountry(tenant?.country);
}
