import english from "./en.json";

export type Locale = "en" | "id";
export const LANGUAGE_COOKIE = "inventory-language";
export const DEFAULT_LOCALE: Locale = "en";
export function resolveLocale(value?: string | null): Locale {
  return value === "id" ? "id" : DEFAULT_LOCALE;
}
export function intlLocale(locale: Locale): string {
  return locale === "id" ? "id-ID" : "en-GB";
}

const messages: Record<string, string> = english;
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(messages)
  .filter(([key]) => /\{\d+\}/.test(key) && key.replace(/\{\d+\}/g, "").length >= 12)
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, "").length - a.replace(/\{\d+\}/g, "").length)
  .map(([key, value]) => {
    const indexes: number[] = [];
    const parts = key.split(/(\{\d+\})/).map((part) => {
      const match = /^\{(\d+)\}$/.exec(part);
      if (!match) return escapePattern(part);
      indexes.push(Number(match[1]));
      return "([\\s\\S]+?)";
    });
    return { expression: new RegExp(`^${parts.join("")}$`), value, indexes };
  });

function interpolate(message: string, values: readonly unknown[]): string {
  return message.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value ?? "");
  });
}

function decodeCopy(message: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ldquo: "“", rdquo: "”" };
  return message.replace(/&(amp|lt|gt|quot|apos|nbsp|ldquo|rdquo);/g, (_, entity: string) => entities[entity]);
}

/** Translate application copy only. Never pass user-authored names or descriptions. */
export function translate(key: string, locale: Locale = DEFAULT_LOCALE, values?: readonly unknown[]): string {
  if (locale === "id") return interpolate(decodeCopy(key), values ?? []);
  if (Object.hasOwn(messages, key)) return interpolate(messages[key], values ?? []);
  // API validation messages contain dynamic quantities/names; preserve captured data.
  for (const pattern of patterns) {
    const match = pattern.expression.exec(key);
    if (!match) continue;
    const captures: string[] = [];
    pattern.indexes.forEach((index, i) => { captures[index] = match[i + 1]; });
    return interpolate(pattern.value, captures);
  }
  return key;
}

export type Translate = (key: string, values?: readonly unknown[]) => string;
export function createTranslator(locale: Locale): Translate {
  return (key, values) => translate(key, locale, values);
}
