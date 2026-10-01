import { useCallback, useSyncExternalStore } from "react";

/**
 * Batas tata letak ponsel — WAJIB sama dengan media query di `globals.css`
 * (di bawah breakpoint `md` Tailwind, 768px). Di bawah batas ini sidebar
 * menjadi laci (drawer) yang tertutup secara bawaan.
 */
export const MOBILE_MEDIA_QUERY = "(max-width: 767.98px)";

/** `true` bila media query cocok; selalu `false` saat render di server. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
