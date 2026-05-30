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
  ShieldCheck,
} from "lucide-react";
import { canAccessAdministration } from "../utils/permissions";

const navItems = [
  {
    key: "dashboard",
    name: "Executive Dashboard",
    description: "Command overview",
    icon: Home,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer", "viewer"],
  },
  {
    key: "risk",
    name: "Climate Risk Map",
    description: "LGA risk intelligence",
    icon: CloudSun,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer", "viewer"],
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
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer", "viewer"],
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
    <div className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#0B1726]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-80 flex-col bg-[#0B1726] text-white shadow-2xl">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2292A4]">
              <ShieldCheck size={24} />
            </div>

            <div>
              <h1 className="text-lg font-black tracking-tight">KS-CCC</h1>
              <p className="text-xs text-white/50">
                Kaduna Climate Command Centre
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C8A84A]">
              Internal Command System
            </p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Climate risk, GHG inventory, project tracking, reports and audit
              evidence.
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
                    ? "bg-[#214560] text-white ring-1 ring-[#4E7492]"
                    : "text-white/65 hover:bg-white/8 hover:text-white"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                    isActive
                      ? "bg-[#2292A4] text-white"
                      : "bg-white/5 text-white/50 group-hover:bg-white/10 group-hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                </span>

                <span>
                  <span className="block text-sm font-bold">{item.name}</span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      isActive ? "text-white/65" : "text-white/35"
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
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white/70 transition hover:border-[#C8A84A]/60 hover:text-white"
          >
            <ExternalLink size={14} />
            Public Portal
          </button>
        </div>
      </aside>

      <div className="pl-80">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#CAD2D7] bg-white/95 px-8 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4E7492]">
              Kaduna State
            </p>

            <h2 className="mt-1 text-xl font-black text-[#0B1726]">
              {activeNavItem?.name || "Climate Command Centre"}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden rounded-full border border-[#CAD2D7] bg-[#DFE3E4]/45 px-4 py-2 text-sm font-semibold text-[#214560] md:block">
              Foundation setup active
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#214560] text-white">
              <Gauge size={19} />
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full border border-[#CAD2D7] bg-white px-4 py-2 text-sm font-semibold text-[#214560] transition hover:border-[#2292A4] hover:text-[#2292A4]"
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