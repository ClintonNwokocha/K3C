// Phase 1 + 2A — minimum viable public visitor analytics, plus a small set
// of KCCC-specific interaction events (Umami).
//
// Scope: anonymous page-view + interaction counting for the public portal
// only.
// - No authentication/session data (no tokens, no usernames) is ever read or sent.
// - No localStorage contents are read.
// - No form contents are read.
// - Only the page path + document title are sent for page views; query
//   strings are stripped before anything reaches Umami, since we cannot
//   guarantee they never carry sensitive values.
// - Phase 2A custom events (see PUBLIC_EVENT_NAMES below) carry only plain,
//   reviewed string identifiers (an LGA name/code, an indicator key, a
//   report/project id) — never raw URLs, full objects, or API payloads.
// - Tutorial-video tracking and an analytics dashboard remain deferred to a
//   later phase and are intentionally NOT implemented here.
//
// The Umami property (URL + website ID) is owned and provisioned by the
// KCCC client, not the developer — this module only ever consumes
// client-supplied configuration, never a hardcoded endpoint.
//
// Configuration is entirely environment-driven (see .env.example) and
// analytics is disabled by default. Any missing/invalid configuration, a
// blocked tracking script, or an Umami outage must never break the app —
// every entry point below fails silently (no thrown errors, no console
// noise for end users).

const ANALYTICS_ENABLED_FLAG = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
const UMAMI_URL = (import.meta.env.VITE_UMAMI_URL || "").trim();
const UMAMI_WEBSITE_ID = (import.meta.env.VITE_UMAMI_WEBSITE_ID || "").trim();

// Explicit allow-list — only these exact pathnames are ever sent to
// analytics. "/" is intentionally excluded here because it is dual-purpose
// (public Staff Login screen when signed out, authenticated app shell when
// signed in); the caller is responsible for confirming the Login screen is
// what actually rendered before tracking "/".
export const PUBLIC_ANALYTICS_ROUTES = [
  "/public",
  "/public/climate-intelligence",
  "/public/climate-risk",
  "/public/climate-atlas",
  "/public/ghg-inventory",
  "/public/projects",
  "/public/reports",
];

export const PUBLIC_LOGIN_PATH = "/";

// Phase 2A KCCC-specific interaction events. Exported as constants so call
// sites cannot introduce a typo'd event name; do not rename these values —
// they are the exact names required by the analytics spec.
export const PUBLIC_EVENT_NAMES = {
  LGA_SELECTED: "lga_selected",
  INDICATOR_SELECTED: "indicator_selected",
  REPORT_DOWNLOADED: "report_downloaded",
  PROJECT_VIEWED: "project_viewed",
};

export function isAnalyticsConfigured() {
  return Boolean(
    ANALYTICS_ENABLED_FLAG &&
      UMAMI_URL &&
      UMAMI_WEBSITE_ID &&
      /^https?:\/\//i.test(UMAMI_URL)
  );
}

export function isTrackablePublicPath(pathname) {
  return (
    PUBLIC_ANALYTICS_ROUTES.includes(pathname) || pathname === PUBLIC_LOGIN_PATH
  );
}

let umamiScriptPromise = null;

// Loads the Umami tracker script (client-provided instance URL + website
// ID) with automatic tracking disabled, so we control exactly what gets
// sent per page load rather than letting the script capture the raw
// location (which may include a query string) on its own. Resolves once
// window.umami is available, or resolves to null if the script fails to
// load / is blocked — callers must treat null as "do nothing further".
function loadUmamiScript() {
  if (umamiScriptPromise) {
    return umamiScriptPromise;
  }

  umamiScriptPromise = new Promise((resolve) => {
    try {
      const baseUrl = UMAMI_URL.endsWith("/") ? UMAMI_URL : `${UMAMI_URL}/`;

      const script = document.createElement("script");
      script.defer = true;
      script.src = `${baseUrl}script.js`;
      script.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
      // We call umami.track() ourselves with a sanitized URL, so disable
      // the script's own automatic pageview (which would otherwise send
      // the raw location, including any query string).
      script.setAttribute("data-auto-track", "false");
      // Respect the browser's Do Not Track signal.
      script.setAttribute("data-do-not-track", "true");

      // A blocked/failed script load must never surface as an application
      // error — resolve to null so the caller silently no-ops.
      script.onerror = () => resolve(null);
      script.onload = () => resolve(window.umami || null);

      const firstScript = document.getElementsByTagName("script")[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }
    } catch {
      resolve(null);
    }
  });

  return umamiScriptPromise;
}

/**
 * Track a single public page view. Safe to call unconditionally — it is a
 * no-op unless analytics is enabled/configured AND the given pathname is on
 * the public allow-list. Never throws.
 */
export function trackPublicPageView(pathname, documentTitle) {
  try {
    if (!isAnalyticsConfigured() || !isTrackablePublicPath(pathname)) {
      return;
    }

    // Only the path is sent — no origin, no query string, no hash — so we
    // never forward values we have not explicitly reviewed.
    const title = documentTitle || document.title;

    loadUmamiScript()
      .then((umami) => {
        if (!umami || typeof umami.track !== "function") {
          return;
        }

        umami.track((props) => ({
          ...props,
          url: pathname,
          title,
        }));
      })
      .catch(() => {
        // Analytics must never break the portal.
      });
  } catch {
    // Analytics must never break the portal.
  }
}

/**
 * Track a single KCCC-specific public interaction event (Phase 2A — see
 * PUBLIC_EVENT_NAMES). Safe to call unconditionally from any public
 * component — it is a no-op unless analytics is enabled/configured AND the
 * page the call happens from is on the public allow-list. Never throws,
 * never blocks the caller (fire-and-forget; the caller's own action, e.g.
 * a download or a selection, must proceed regardless of analytics outcome).
 *
 * `eventData` must be a small plain object of already-reviewed string/
 * number identifiers only (e.g. { lga, lga_code }, { indicator },
 * { report }, { project }) — never a raw URL, full API object, or anything
 * derived from window.location.search/hash.
 */
export function trackPublicEvent(eventName, eventData) {
  try {
    if (
      !isAnalyticsConfigured() ||
      !isTrackablePublicPath(window.location.pathname)
    ) {
      return;
    }

    loadUmamiScript()
      .then((umami) => {
        if (!umami || typeof umami.track !== "function") {
          return;
        }

        umami.track(eventName, eventData);
      })
      .catch(() => {
        // Analytics must never break the portal.
      });
  } catch {
    // Analytics must never break the portal.
  }
}
