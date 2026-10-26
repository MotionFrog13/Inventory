"use client";

import { createContext, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createTranslator, DEFAULT_LOCALE, LANGUAGE_COOKIE, type Locale, type Translate } from "@/lib/i18n";

interface LanguageContextValue {
  locale: Locale;
  t: Translate;
  changeLanguage: (locale: Locale) => void;
  pending: boolean;
}
const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
  changeLanguage: () => {},
  pending: false,
});

export default function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  const [pending, startTransition] = useTransition();
  const t = useMemo(() => createTranslator(locale), [locale]);
  useEffect(() => { setLocale(initialLocale); }, [initialLocale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    t,
    pending,
    changeLanguage(next) {
      document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      setLocale(next);
      startTransition(() => { router.refresh(); });
    },
  }), [locale, pending, router, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() { return useContext(LanguageContext); }
