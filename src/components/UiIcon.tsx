import type { SVGProps } from "react";

const paths = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  box: "m21 8-9-5-9 5v9l9 5 9-5ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5",
  tool: "M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4Z",
  transfer: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
  building: "M4 21V5l8-2v18M12 8h8v13M2 21h20M7 7v1m0 3v1m0 3v1m9-4v1m0 3v1",
  chart: "M3 3v18h18M7 16v-4m5 4V7m5 9v-7",
  layers: "m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8m5 9v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  history: "M3 11a9 9 0 1 1 2.7 7M3 4v7h7m2-4v5l3 2",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "M19 12H5m6-6-6 6 6 6",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  info: "M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  document: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 12h8m-8 4h8",
  warning: "m12 3 10 18H2Zm0 6v5m0 3h.01",
  clock: "M12 8v4l3 2m7-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  check: "m5 12 4 4L19 6",
  edit: "m16 3 5 5-12 12H4v-5ZM14 5l5 5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  lock: "M5 10h14v11H5ZM8 10V7a4 4 0 0 1 8 0v3m-4 4v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "m3 3 18 18M10 5a12 12 0 0 1 2 0c6 0 10 7 10 7a20 20 0 0 1-3 4M6 6a21 21 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4",
  logout: "M9 3H4v18h5m5-14 5 5-5 5m-6-5h11",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  calendar: "M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4",
} as const;

export type IconName = keyof typeof paths;

export default function UiIcon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
