// Milestone 1 presentation configuration.
//
// Controlled by VITE_PUBLIC_DEMO_MODE:
//   "full"        - normal application (default when unset)
//   "milestone1"  - public nav/homepage show only Home, Climate Intelligence,
//                    Staff Login; GHG/Projects/Reports stay in the codebase
//                    and remain reachable by direct URL, just hidden from nav.
//
// This is the single place demo-mode checks should live — pages/components
// should import isMilestoneOneDemo rather than reading import.meta.env directly.
export const DEMO_MODE = import.meta.env.VITE_PUBLIC_DEMO_MODE || "full";

export const isMilestoneOneDemo = DEMO_MODE === "milestone1";

if (import.meta.env.DEV) {
  console.log(`KCCC public mode: ${DEMO_MODE}`);
}
