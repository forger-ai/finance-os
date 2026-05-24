/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { initialLocale, loadForgerRuntimeContext, type Locale } from "@/api/locale";
import { en } from "./en";
import { es } from "./es";

type Widen<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer Item)[]
          ? readonly Widen<Item>[]
          : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof es>;

const dictionaries: Record<Locale, Dictionary> = { es, en };
const I18nContext = createContext<Dictionary>(es);
const LocaleContext = createContext<Locale>("es");

function cloneDictionary<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneDictionary(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneDictionary(nestedValue)]),
    ) as T;
  }
  return value;
}

const baseSpanishDictionary = cloneDictionary(es) as Dictionary;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => initialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    void loadForgerRuntimeContext(controller.signal)
      .then((context) => {
        if (context.source === "desktop") {
          setLocale(context.locale);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const value = useMemo(() => {
    const dictionary = locale === "es" ? baseSpanishDictionary : dictionaries[locale] ?? baseSpanishDictionary;
    Object.assign(es, dictionary);
    return dictionary;
  }, [locale]);
  return (
    <LocaleContext.Provider value={locale}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useI18n(): Dictionary {
  return useContext(I18nContext);
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
