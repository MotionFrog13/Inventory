import type { ReactNode } from "react";
import UiIcon, { type IconName } from "./UiIcon";

export default function GuideCard({ title, children, icon = "info" }: { title: string; children: ReactNode; icon?: IconName }) {
  return (
    <aside className="guide-card" aria-label={title}>
      <span className="guide-icon"><UiIcon name={icon} size={19} /></span>
      <div><p className="guide-title">{title}</p><div className="guide-description">{children}</div></div>
    </aside>
  );
}
