# Interface languages

English (`en`) is the default for every new visitor. Bahasa Indonesia (`id`) is available on the login page and in the application header. The selection is saved for one year in the `inventory-language` cookie and is independent of the authentication session. Browser language detection does not override the English default. Unknown cookie values fall back to English.

Server Components read the preference with `getI18n()` from `src/lib/i18n/server.ts`. The root layout passes it to `LanguageProvider`, so the HTML language, metadata and first render agree. Client Components use `useI18n()`. Changing the language updates the cookie and refreshes Server Components while preserving client state and the current URL.

## Adding interface copy

The keys in `src/lib/i18n/en.json` are the existing Indonesian fallback text; the values are English translations. Add both when introducing a new message. Use `t(key)` for fixed copy and `t(key, [value])` for placeholders such as `{0}`. Keep placeholders identical in both languages. Do not build sentences by concatenating translated words when a complete message will work.

```tsx
const { t } = useI18n();
return <button>{t("Simpan Perubahan")}</button>;
```

```tsx
const { t, locale } = await getI18n();
return <p>{t("Garansi akan habis dalam {0} hari ({1}).", [days, formatDate(expiry, locale)])}</p>;
```

Translate only application copy. Asset names, organization/division/outlet names, notes, incident descriptions, and historical activity details are user data and must remain unchanged. Use the locale-aware `roleLabel`, `divisionScopeLabel`, and `branchScopeLabel` helpers to preserve embedded names. Use `formatDate` / `formatDateTime` with an explicit locale; the time zone remains `Asia/Jakarta` for both languages.

API error codes, authorization rules, status enum values, and existing response contracts remain stable. The interface translates displayed validation messages, including known dynamic quantities/names; unknown diagnostic messages pass through. Monthly report labels use the language cookie without changing the query scope.

## Verification

`npm run test:unit` covers default/fallback locale selection, interpolation, dynamic validation messages, placeholder parity, date formatting, and preserving user names. Also check both languages in the browser: switch on login, refresh, sign in, navigate to server/client pages, open a form and an approval dialog, then check the mobile header. Run the normal type, lint, build, integration and HTTP QA checks.
