import React, { useState } from "react";

type Props = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible-card ${open ? "open" : ""}`}>
      <button
        type="button"
        className="collapsible-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className={`collapsible-chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      <div className="collapsible-content">
        <div className="collapsible-inner">
          {children}
        </div>
      </div>
    </section>
  );
}
