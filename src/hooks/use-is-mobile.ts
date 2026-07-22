"use client";

import { useEffect, useState } from "react";

// Matches Tailwind's `sm` breakpoint — true below 640px.
export function useIsMobile(query = "(max-width: 639px)") {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
