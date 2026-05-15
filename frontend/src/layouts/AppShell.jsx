import {
  BarChart3,
  CloudSun,
  FileText,
  FolderKanban,
  Gauge,
  Home,
  Leaf,
  Settings,
  ShieldCheck,
} from "lucide-react";

const navItems = [
  { name: "Executive Dashboard", icon: Home, active: true },
  { name: "Climate Risk Map", icon: CloudSun },
  { name: "GHG Inventory", icon: Leaf },
  { name: "Project Portfolio", icon: FolderKanban },
  { name: "Reports Centre", icon: FileText },
  { name: "Administration", icon: Settings },
];

export default function AppShell({ children }) {
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
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
                  item.active
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
            <p className="mt-1 font-semibold text-white">Admin</p>
            <p className="mt-1 text-xs text-slate-400">
              Full system access during development
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

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Gauge size={20} />
            </div>
          </div>
        </header>

        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}