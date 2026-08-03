export type IndustryKey = "health_beauty" | "fnb" | "retail" | "general";

export type IndustryProfile = {
  key: IndustryKey;
  label: string;
  catalogNoun: string; // Services / Menu / Products
  catalogNounSingular: string;
  posTitle: string;
  posHint: string;
  categoryHints: string[];
  showDuration: boolean;
  showDeposit: boolean;
  supportsCartQty: boolean;
};

const PROFILES: Record<IndustryKey, IndustryProfile> = {
  health_beauty: {
    key: "health_beauty",
    label: "Health & Beauty",
    catalogNoun: "Services",
    catalogNounSingular: "Service",
    posTitle: "Counter / POS",
    posHint: "Tap treatments or add-ons into the ticket, then settle cash or QR.",
    categoryHints: ["Treatments", "Add-ons", "Tattoo", "Packages"],
    showDuration: true,
    showDeposit: true,
    supportsCartQty: true,
  },
  fnb: {
    key: "fnb",
    label: "Food & Beverage",
    catalogNoun: "Menu",
    catalogNounSingular: "Item",
    posTitle: "Kiosk POS",
    posHint: "Build an order from the menu, adjust quantities, then take payment.",
    categoryHints: ["Food", "Drinks", "Snacks", "Combos"],
    showDuration: false,
    showDeposit: false,
    supportsCartQty: true,
  },
  retail: {
    key: "retail",
    label: "Retail",
    catalogNoun: "Products",
    catalogNounSingular: "Product",
    posTitle: "Retail POS",
    posHint: "Ring up products with quantities, then settle cash or QR.",
    categoryHints: ["General", "Skincare", "Merchandise"],
    showDuration: false,
    showDeposit: false,
    supportsCartQty: true,
  },
  general: {
    key: "general",
    label: "General",
    catalogNoun: "Catalog",
    catalogNounSingular: "Item",
    posTitle: "POS",
    posHint: "Add items to the ticket, then settle with cash or QR.",
    categoryHints: ["General", "Services", "Products"],
    showDuration: true,
    showDeposit: true,
    supportsCartQty: true,
  },
};

export function normalizeIndustry(raw?: string | null): IndustryKey {
  const value = (raw || "general").toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "health_beauty" || value === "wellness" || value === "beauty" || value === "spa" || value === "salon" || value === "tattoo") {
    return "health_beauty";
  }
  if (value === "fnb" || value === "food" || value === "food_beverage" || value === "fb" || value === "kiosk") {
    return "fnb";
  }
  if (value === "retail" || value === "shop") return "retail";
  if (value in PROFILES) return value as IndustryKey;
  return "general";
}

export function industryProfile(raw?: string | null): IndustryProfile {
  return PROFILES[normalizeIndustry(raw)];
}

export const INDUSTRY_OPTIONS: { value: IndustryKey; label: string }[] = [
  { value: "health_beauty", label: "Health & Beauty" },
  { value: "fnb", label: "Food & Beverage" },
  { value: "retail", label: "Retail" },
  { value: "general", label: "General" },
];
