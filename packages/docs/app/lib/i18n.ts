import { defineI18n } from "fumadocs-core/i18n";

export const i18n = defineI18n({
  defaultLanguage: "zh",
  languages: ["zh", "en"],
  hideLocale: "default-locale",
  parser: "dir", // 使用目录结构 (content/zh/*, content/en/*)
});

export type Locale = (typeof i18n.languages)[number];

export function resolveLocale(value: string | undefined): Locale | null {
  if (!value) {
    return i18n.defaultLanguage as Locale;
  }

  return i18n.languages.includes(value as Locale) ? (value as Locale) : null;
}
