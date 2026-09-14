import { useEffect, useState } from "react";

// True once `active` has been true for `delayMs` without
// clearing. Used to add a "taking longer than expected" note
// to slow loads without guessing at per-request timing.

export default function useSlowFlag(active, delayMs = 15000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);

      return undefined;
    }

    const timer = setTimeout(() => setSlow(true), delayMs);

    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}
