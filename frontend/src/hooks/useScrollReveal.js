import { useEffect, useRef, useState } from "react";

// Shared scroll-triggered entrance reveal, used across the public pages
// (homepage, projects, reports, GHG inventory) wherever the approved
// reference designs use a fade/rise-in-on-scroll treatment.
//
// Returns [ref, isVisible] — attach `ref` to the element and drive its
// transition classes off `isVisible`, e.g.:
//
//   const [ref, visible] = useScrollReveal();
//   <div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
//
// - Respects prefers-reduced-motion: when the user has it set, the
//   element reports visible immediately and no observer is attached, so
//   consumers never need their own reduced-motion branching.
// - Fires once: after the element has entered the viewport it stays
//   revealed (matches the reference designs' one-shot reveal behaviour)
//   and the observer disconnects, so re-renders never restart it.
// - Safe if the element is never scrolled into view (SSR-less SPA, so no
//   hydration concerns) and cleans up the observer on unmount.
// Reduced-motion / no-IntersectionObserver-support decision is made once,
// synchronously, as a lazy useState initializer — never inside the effect
// body — so there is no setState-during-effect cascade to avoid.
function getsInitialVisibility() {
  if (typeof window === "undefined") return false;
  if (typeof IntersectionObserver === "undefined") return true;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function useScrollReveal({ threshold = 0.12, rootMargin = "0px" } = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(getsInitialVisibility);

  useEffect(() => {
    if (isVisible) return undefined;

    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [threshold, rootMargin, isVisible]);

  return [ref, isVisible];
}

// Tailwind class fragment shared by every reveal consumer, so the same
// timing/easing is used everywhere rather than each page inventing its
// own. motion-reduce: guards are redundant with the hook's own
// reduced-motion short-circuit, but kept here too in case a consumer
// renders isVisible=true before the hook's effect has run (first paint).
export function revealClasses(isVisible, extra = "") {
  return [
    "transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none",
    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
