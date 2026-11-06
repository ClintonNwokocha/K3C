import { createContext } from "react";

// Optional manual motion override, provided only by pages that render a
// user-facing Motion On/Off control (currently just the homepage). Pages
// that never render a MotionProvider get `null` from useContext, which
// useScrollReveal/useMotionEnabled treat as "no override — defer to
// prefers-reduced-motion", so this is fully backwards compatible with the
// other public pages.
export const MotionContext = createContext(null);
