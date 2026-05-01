export const locales = ["zh", "en", "id"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "id";

export const localeNames: Record<Locale, string> = {
  zh: "中文",
  en: "English",
  id: "Indonesia",
};
