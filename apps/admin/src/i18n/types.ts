export type Locale = "en" | "ms" | "id" | "th" | "zh";

export type Dict = Record<string, unknown>;

export const LOCALES: {
  code: Locale;
  label: string;
  short: string;
  dir?: "ltr" | "rtl";
}[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "ms", label: "Bahasa Melayu", short: "BM" },
  { code: "id", label: "Bahasa Indonesia", short: "ID" },
  { code: "th", label: "ไทย", short: "TH" },
  { code: "zh", label: "中文", short: "中文" },
];

export const LOCALE_STORAGE_KEY = "baseapp.locale";
