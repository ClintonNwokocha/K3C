import {
  CloudSun,
  ExternalLink,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  Leaf,
  LogOut,
  Settings,
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
    name: "Climate Intelligence Map",
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

  const visibleNavItems = navItems.filter((item) =>
    canSeeNavItem(item, currentUser)
  );

  const activeNavItem = navItems.find((item) => item.key === activePage);

  return (
    <div className="min-h-screen bg-slate-100 font-['DM_Sans'] text-[#030454]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-80 flex-col bg-[#030454] text-white shadow-2xl">
        <div className="border-b border-white/10 px-5 py-6">
          <button
            type="button"
            onClick={() => onPageChange("dashboard")}
            className="flex w-full items-center"
            aria-label="Go to dashboard"
          >
            <OfficialLogo
              variant="light"
              className="max-w-[245px]"
              compact
            />
          </button>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#F3F74B]">
              Internal Command System
            </p>

            <p className="mt-2 text-sm leading-6 text-white/65">
              Climate Intelligence, GHG inventory, project tracking, reports and
              audit-ready evidence.
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onPageChange(item.key)}
                className={`group flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition ${
                  isActive
                    ? "bg-[#F3F74B] text-[#030454]"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                    isActive
                      ? "bg-[#009B35] text-white"
                      : "bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                </span>

                <span>
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

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white/70 transition hover:border-[#F3F74B]/70 hover:text-white"
          >
            <ExternalLink size={14} />
            Public Portal
          </button>
        </div>
      </aside>

      <div className="pl-80">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-8 backdrop-blur">
          <div>
            <h2 className="text-xl font-black text-[#030454]">
              {activeNavItem?.name || "Climate Command Centre"}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {activeNavItem?.description || "Kaduna climate intelligence"}
            </p>
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
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}