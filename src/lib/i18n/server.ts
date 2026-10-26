import "server-only";
import { cookies } from "next/headers";
import { createTranslator, LANGUAGE_COOKIE, resolveLocale } from "./index";

export async function getI18n() {
  const locale = resolveLocale((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { locale, t: createTranslator(locale) };
}
