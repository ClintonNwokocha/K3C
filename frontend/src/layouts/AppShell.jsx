import {
  CloudSun,
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
    icon: Home,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer", "viewer"],
  },
  {
    key: "risk",
    name: "Climate Risk Map",
    icon: CloudSun,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer", "viewer"],
  },
  {
    key: "ghg",
    name: "GHG Inventory",
    icon: Leaf,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer"],
  },
  {
    key: "projects",
    name: "Project Portfolio",
    icon: FolderKanban,
    allowedRoles: ["admin", "analyst", "sector_focal_point", "reviewer", "viewer"],
  },
  {
    key: "reports",
    name: "Reports Centre",
    icon: FileText,
    allowedRoles: ["admin", "analyst", "reviewer", "viewer"],
  },
  {
    key: "administration",
    name: "Administration",
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 w-72 bg-slate-950 text-white">
        <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500">
            <ShieldCheck size={24} />
          </div>

          <div>
            <h1 className="text-lg font-bold leading-tight">KS-CCC</h1>
            <p className="text-xs text-slate-300">Climate Command Center</p>
          </div>
        </div>

        <nav className="space-y-1 px-4 py-6">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onPageChange(item.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
                  isActive
                    ? "bg-emerald-500 text-white shadow"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-4">
          <div className="rounded-2xl bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Current Role
            </p>

            <p className="mt-1 font-semibold text-white">{formatRole(role)}</p>

            <p className="mt-1 text-xs text-slate-400">
              {currentUser?.username || "Signed-in user"}
            </p>
          </div>
        </div>
      </aside>

      <div className="pl-72">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-slate-200 bg-white px-8">
          <div>
            <p className="text-sm text-slate-500">Kaduna State</p>
            <h2 className="text-xl font-bold">Climate Command Center</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600 md:block">
              Foundation setup active
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Gauge size={20} />
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}