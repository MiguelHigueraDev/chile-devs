import { useCallback, useEffect, useRef } from "react";

type DismissEvent = { preventDefault: () => void };

/**
 * Prevents a parent sheet from closing when a stacked child sheet is open, and
 * briefly after the child closes (mobile touchend can land on the parent's
 * close button at the same screen position once inert is removed).
 */
export function useStackedSheetDismissGuard(childOpen: boolean) {
  const suppressDismissRef = useRef(false);
  const prevChildOpenRef = useRef(childOpen);

  useEffect(() => {
    const wasOpen = prevChildOpenRef.current;
    prevChildOpenRef.current = childOpen;

    if (!wasOpen || childOpen) {
      return;
    }

    suppressDismissRef.current = true;
    const id = window.setTimeout(() => {
      suppressDismissRef.current = false;
    }, 350);
    return () => clearTimeout(id);
  }, [childOpen]);

  const blockOutsideDismiss = useCallback(
    (event: DismissEvent) => {
      if (childOpen || suppressDismissRef.current) {
        event.preventDefault();
      }
    },
    [childOpen],
  );

  const handleOpenChange = useCallback(
    (open: boolean, onClose: () => void) => {
      if (!open && !childOpen && !suppressDismissRef.current) {
        onClose();
      }
    },
    [childOpen],
  );

  return {
    handleOpenChange,
    blockOutsideDismiss,
  };
}
