import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { enMessages } from "./locales/en";
import { zhMessages } from "./locales/zh";

export type Locale = "en" | "zh";

const STORAGE_KEY = "dropout.locale";

const dictionaries = {
  en: enMessages,
  zh: zhMessages,
} as const;

type MessageKey = keyof typeof enMessages;

function normalizeLocale(locale?: string | null): Locale | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("en")) return "en";
  return null;
}

function detectLocale(): Locale {
  if (typeof navigator !== "undefined") {
    return normalizeLocale(navigator.language) ?? "en";
  }
  return "en";
}

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const locale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  if (locale) return locale;
  return detectLocale();
}

export function setStoredLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, locale);
  }
}

export function translate(
  key: MessageKey,
  params?: Record<string, string | number | null | undefined>,
  locale = getStoredLocale(),
) {
  const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, token: string) =>
    String(params[token] ?? ""),
  );
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    setStoredLocale(locale);
  }, [locale]);

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale: setLocaleState,
        t: (key, params, requestedLocale) =>
          translate(key, params, requestedLocale ?? locale),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return context;
}
