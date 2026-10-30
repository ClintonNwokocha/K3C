import { useEffect, useState } from "react";
import {
  CloudSun,
  ExternalLink,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  Leaf,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from "lucide-react";
import OfficialLogo from "../components/OfficialLogo";
import { canAccessAdministration } from "../utils/permissions";

const navItems = [
  {
    key: "dashboard",
    name: "Executive Dashboard",
    description: "Command overview",
    icon: Home,
    allowedRoles: [
      "admin",
      "analyst",
      "sector_focal_point",
      "reviewer",
      "viewer",
    ],
  },
  {
    key: "risk",
    name: "Climate Intelligence",
    description: "LGA risk intelligence",
    icon: CloudSun,
    allowedRoles: [
      "admin",
      "analyst",
      "sector_focal_point",
      "reviewer",
      "viewer",
    ],
  },
  {
    key: "ghg",
    name: "GHG Inventory",
    description: "Emissions tracking",
    icon: Leaf,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer"],
  },
  {
    key: "projects",
    name: "Project Portfolio",
    description: "Climate action tracking",
    icon: FolderKanban,
    allowedRoles: [
      "admin",
      "analyst",
      "sector_focal_point",
      "reviewer",
      "viewer",
    ],
  },
  {
    key: "reports",
    name: "Reports Centre",
    description: "Documents and evidence",
    icon: FileText,
    allowedRoles: ["admin", "analyst", "reviewer", "viewer"],
  },
  {
    key: "administration",
    name: "Administration",
    description: "Users and system settings",
    icon: Settings,
    allowedRoles: ["admin"],
  },
];

function formatRole(role) {
  const labels = {
    admin: "Admin",
    analyst: "Analyst",
    sector_focal_point: "Sector Focal Point",
    reviewer: "Reviewer",
    viewer: "Viewer",
    public: "Public",
  };

  return labels[role] || "Unknown";
}

// New key: no existing UI-preference persistence pattern exists in the app
// yet (localStorage is currently only used for auth tokens), but reusing
// localStorage itself keeps this consistent with that existing mechanism
// rather than introducing a new storage layer for one boolean.
const SIDEBAR_COLLAPSE_STORAGE_KEY = "kccc_sidebar_collapsed";

function canSeeNavItem(item, currentUser) {
  if (currentUser?.is_superuser) {
    return true;
  }

  if (item.key === "administration") {
    return canAccessAdministration(currentUser);
  }

  const role = currentUser?.profile?.role || "public";

  return item.allowedRoles.includes(role);
}

export default function AppShell({
  children,
  currentUser,
  onLogout,
  activePage,
  onPageChange,
}) {
  const role = currentUser?.profile?.role || "public";
  // Deliberately separate from mobileNavOpen: desktop collapse is a lg+-only
  // width preference, mobile open/close is a slide-in overlay at any width.
  // Conflating them would make the mobile overlay inherit desktop collapse
  // styling, which the task explicitly calls out to avoid.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_COLLAPSE_STORAGE_KEY,
        desktopCollapsed ? "1" : "0"
      );
    } catch {
      // Storage unavailable (private browsing, disabled storage, quota) -
      // the preference simply stays session-only for this visit.
    }
  }, [desktopCollapsed]);

  const visibleNavItems = navItems.filter((item) =>
    canSeeNavItem(item, currentUser)
  );

  const activeNavItem = navItems.find((item) => item.key === activePage);

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  function handleNavigate(pageKey) {
    onPageChange(pageKey);
    setMobileNavOpen(false);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 font-['DM_Sans'] text-[#030454]">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
        />
      )}

      <aside
        id="app-shell-nav"
        className={`fixed inset-y-0 left-0 z-40 flex w-80 flex-col bg-[#030454] text-white shadow-2xl transition-[transform,width] duration-200 ease-in-out motion-reduce:transition-none lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopCollapsed ? "lg:w-20" : "lg:w-80"}`}
      >
        <span className="sr-only" role="status" aria-live="polite">
          {desktopCollapsed ? "Sidebar collapsed" : "Sidebar expanded"}
        </span>

        <div
          className={`border-b border-white/10 px-5 py-4 ${
            desktopCollapsed ? "lg:px-2" : ""
          }`}
        >
          <div
            className={`flex items-center justify-between gap-2 ${
              desktopCollapsed ? "lg:flex-col lg:justify-center" : ""
            }`}
          >
            {/* Full logo: always shown on mobile (where desktop-collapse
                does not apply), hidden at lg+ only while collapsed. */}
            <button
              type="button"
              onClick={() => handleNavigate("dashboard")}
              className={`flex min-w-0 flex-1 items-center ${
                desktopCollapsed ? "lg:hidden" : ""
              }`}
              aria-label="Go to dashboard"
            >
              <OfficialLogo
                variant="light"
                className="max-w-[245px]"
                compact
              />
            </button>

            {/* Icon-only stand-in for the logo: only ever shown at lg+ while
                collapsed, never on mobile. */}
            <button
              type="button"
              onClick={() => handleNavigate("dashboard")}
              className={`${
                desktopCollapsed ? "hidden lg:flex" : "hidden"
              } h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-command-lime focus-visible:ring-offset-2 focus-visible:ring-offset-command-navy`}
              aria-label="Go to dashboard"
              title="Go to dashboard"
            >
              <Home size={20} />
            </button>

            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454] lg:hidden"
              aria-label="Close navigation menu"
            >
              <X size={20} />
            </button>

            {/* Desktop-only collapse toggle. Never rendered on mobile. */}
            <button
              type="button"
              onClick={() => setDesktopCollapsed((current) => !current)}
              aria-expanded={!desktopCollapsed}
              aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-command-lime focus-visible:ring-offset-2 focus-visible:ring-offset-command-navy lg:flex"
            >
              {desktopCollapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
          </div>

          <div
            className={`mt-3 rounded-xl border border-white/10 bg-white/5 p-3 ${
              desktopCollapsed ? "lg:hidden" : ""
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#F3F74B]">
              Internal Command System
            </p>

            <p className="mt-1.5 text-xs leading-5 text-white/65">
              Climate Intelligence, GHG inventory, project tracking, reports and
              audit-ready evidence.
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.key)}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.name}
                title={item.name}
                className={`group flex w-full items-start gap-3 rounded-xl px-4 py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454] ${
                  isActive
                    ? "bg-[#F3F74B] text-[#030454]"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                } ${desktopCollapsed ? "lg:justify-center lg:px-0" : ""}`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                    isActive
                      ? "bg-[#009B35] text-white"
                      : "bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white"
                  }`}
                >
                  <Icon size={16} />
                </span>

                <span className={desktopCollapsed ? "lg:hidden" : ""}>
                  <span className="block text-sm font-black">{item.name}</span>

                  <span
                    className={`mt-0.5 block text-xs ${
                      isActive ? "text-[#030454]/65" : "text-white/35"
                    }`}
                  >
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div
            className={`rounded-xl border border-white/10 bg-white/5 p-3 ${
              desktopCollapsed ? "lg:hidden" : ""
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
              Current Role
            </p>

            <p className="mt-1 font-bold text-white">{formatRole(role)}</p>

            <p className="mt-1 text-xs text-white/45">
              {currentUser?.username || "Signed-in user"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            title="Public Portal"
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white/70 transition-colors duration-200 hover:border-[#F3F74B]/70 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3F74B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030454] ${
              desktopCollapsed ? "lg:hidden" : ""
            }`}
          >
            <ExternalLink size={14} />
            Public Portal
          </button>

          {/* Icon-only stand-in, lg+ only, while collapsed. */}
          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            aria-label="Public Portal"
            title="Public Portal"
            className={`${
              desktopCollapsed ? "hidden lg:flex" : "hidden"
            } mt-2 w-full items-center justify-center rounded-xl border border-white/10 p-2.5 text-white/70 transition-colors duration-200 hover:border-command-lime/70 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-command-lime focus-visible:ring-offset-2 focus-visible:ring-offset-command-navy`}
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </aside>

      <div
        className={`transition-[padding-left] duration-200 ease-in-out motion-reduce:transition-none ${
          desktopCollapsed ? "lg:pl-20" : "lg:pl-80"
        }`}
        inert={mobileNavOpen ? true : undefined}
      >
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="shrink-0 rounded-lg border border-slate-200 p-2 text-[#030454] transition-colors duration-200 hover:border-[#009B35] hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35] focus-visible:ring-offset-2 lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              aria-controls="app-shell-nav"
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-[#030454]">
                {activeNavItem?.name || "Climate Command Centre"}
              </h2>

              <p className="mt-1 truncate text-sm text-slate-500">
                {activeNavItem?.description || "Kaduna climate intelligence"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#030454] md:block">
              Foundation setup active
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#030454] text-white">
              <Gauge size={19} />
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#030454] transition-colors duration-200 hover:border-[#009B35] hover:bg-[#009B35]/5 hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35] focus-visible:ring-offset-2"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <main className="overflow-x-hidden p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}