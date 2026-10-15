"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Mounts a slip for printing and keeps it on the page until the print
 * lifecycle ends. `window.print()` can return while the dialog is still
 * reading the document, so the slip is removed on `afterprint`, never right
 * after the call.
 */
export function usePrintSlip<T>() {
  const [printing, setPrinting] = useState<T | null>(null);

  useEffect(() => {
    const clear = () => setPrinting(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  const print = useCallback((value: T) => {
    // The slip must be on the page before the print dialog reads it.
    flushSync(() => setPrinting(value));
    window.print();
  }, []);

  return { printing, print };
}
