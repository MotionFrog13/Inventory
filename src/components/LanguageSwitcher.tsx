"use client";

import { useI18n } from "./LanguageProvider";
import type { Locale } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const { locale, changeLanguage, pending } = useI18n();
  return (
    <label className="language-switcher">
      <span className="sr-only">{locale === "en" ? "Language" : "Bahasa"}</span>
      <select aria-label={locale === "en" ? "Language" : "Bahasa"} value={locale} disabled={pending}
        onChange={(event) => changeLanguage(event.target.value as Locale)}>
        <option value="en" lang="en">English</option>
        <option value="id" lang="id">Bahasa Indonesia</option>
      </select>
    </label>
  );
}
