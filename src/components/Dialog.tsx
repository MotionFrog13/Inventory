"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Native modal supplies focus trapping, background inertness, and focus restoration. */
export default function Dialog({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    // Layout cleanup closes the modal before React detaches it. A passive
    // cleanup runs too late for the browser to restore the opener's focus.
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={ref} className="app-dialog" aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
