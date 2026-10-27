import { useEffect, type RefObject } from "react";
export function useDialog(
  ref: RefObject<HTMLDialogElement | null>,
  open = true,
  scope?: unknown,
) {
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      queueMicrotask(() => {
        if (document.querySelector("dialog[open]")) return;
        const target =
          opener?.isConnected &&
          opener !== document.body &&
          !opener.closest("[inert]")
            ? opener
            : document.querySelector<HTMLElement>("main[tabindex]");
        target?.focus({ preventScroll: true });
      });
    };
  }, [ref, open, scope]);
}
