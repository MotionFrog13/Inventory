"use client";
import { useI18n } from "@/components/LanguageProvider";
import { ASSET_STATUS_LABELS, ASSET_STATUS_COLORS, STATUS_COLOR_FALLBACK, cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const { t } = useI18n();
  const label = ASSET_STATUS_LABELS[status] || status;
  const colorClass = ASSET_STATUS_COLORS[status] || STATUS_COLOR_FALLBACK;

  return (
    <span
      className={cn(
        "status-badge",
        colorClass,
        size === "sm" && "status-badge-sm"
      )}
    >
      {t(label)}
    </span>
  );
}
