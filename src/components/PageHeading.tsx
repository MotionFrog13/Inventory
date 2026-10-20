import type { ReactNode } from "react";

export default function PageHeading({ title, description, eyebrow, actions }: { title: ReactNode; description?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
