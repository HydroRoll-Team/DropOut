import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
};

/**
 * Detect language from config or browser.
 * Called once at init; re-init when user changes language setting.
 */
function detectLanguage(): string {
  // Check browser / system locale
  const browserLang = navigator.language;
  if (browserLang.startsWith("zh")) return "zh-CN";
  return "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Switch language at runtime. Called from settings store when
 * `language` config changes.
 */
export function setLanguage(lang: string) {
  if (lang === "auto") {
    i18n.changeLanguage(detectLanguage());
  } else if (resources[lang as keyof typeof resources]) {
    i18n.changeLanguage(lang);
  } else {
    i18n.changeLanguage("en");
  }
}

export default i18n;
