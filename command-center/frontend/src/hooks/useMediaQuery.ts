// Subscribe to a CSS media query and re-render when it flips. Used to switch the
// shell between the desktop (left rail) and mobile (bottom bar, stacked tiles)
// layouts.

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True on phone-width viewports (the breakpoint the layout collapses at). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 760px)");
}
