"use client";
import { useI18n } from "@/components/LanguageProvider";
import type { ReactNode } from "react";
import UiIcon, { type IconName } from "./UiIcon";

export default function GuideCard({ title, children, icon = "info" }: { title: string; children: ReactNode; icon?: IconName }) {
  const { t } = useI18n();
  return (
    <aside className="guide-card" aria-label={typeof title === "string" ? t(title) : title}>
      <span className="guide-icon"><UiIcon name={icon} size={19} /></span>
      <div><p className="guide-title">{typeof title === "string" ? t(title) : title}</p><div className="guide-description">{children}</div></div>
    </aside>
  );
}
