import { useState } from "react";
import { ArrowRight, Globe2, Lock, ShieldCheck, User } from "lucide-react";

export default function Login({ onLogin, error }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onLogin(username.trim(), password);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1726] font-['DM_Sans'] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#0B1726_0%,#214560_55%,#0B1726_100%)]" />
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_25%,#2292A4_0,transparent_28%),radial-gradient(circle_at_80%_20%,#C8A84A_0,transparent_22%)]" />

          <svg
            className="absolute bottom-10 right-10 h-[420px] w-[480px] opacity-[0.16]"
            viewBox="0 0 480 420"
            fill="none"
          >
            <path
              d="M120 40 L200 20 L300 50 L380 120 L420 200 L400 310 L320 380 L220 400 L140 360 L80 280 L60 180 Z"
              fill="#4E7492"
              stroke="#C8A84A"
              strokeWidth="2"
            />
            <circle cx="240" cy="200" r="5" fill="#C8A84A" />
            <circle cx="180" cy="150" r="4" fill="#2292A4" />
            <circle cx="300" cy="250" r="4" fill="#2292A4" />
            <circle cx="200" cy="280" r="4" fill="#C8A84A" />
          </svg>

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#2292A4]">
              <ShieldCheck size={22} />
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em]">
                KS-CCC
              </p>
              <p className="text-xs text-white/55">
                Kaduna State Climate Command Centre
              </p>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-[#C8A84A]/35 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#C8A84A]">
              <span className="h-2 w-2 rounded-full bg-[#C8A84A]" />
              Internal Command Access
            </div>

            <h1 className="font-['Playfair_Display'] text-6xl font-black leading-tight tracking-tight">
              Climate intelligence
              <br />
              <span className="text-[#C8A84A]">for coordinated action</span>
            </h1>

            <p className="mt-6 max-w-xl text-base font-light leading-8 text-white/70">
              Secure access for authorised staff to manage climate risk data,
              greenhouse gas inventory, climate projects, reports and audit-ready
              evidence.
            </p>
          </div>

          <div className="relative z-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">
                Module
              </p>
              <p className="mt-2 font-bold">Climate Risk</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">
                Module
              </p>
              <p className="mt-2 font-bold">GHG Inventory</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">
                Module
              </p>
              <p className="mt-2 font-bold">Reports Centre</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-[#DFE3E4] px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-6 flex justify-center lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#2292A4] text-white">
                  <ShieldCheck size={22} />
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#0B1726]">
                    KS-CCC
                  </p>
                  <p className="text-xs text-slate-500">
                    Kaduna Climate Command Centre
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-[#CAD2D7] bg-white p-6 shadow-xl sm:p-8"
            >
              <div className="mb-8">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#214560] text-white">
                  <Lock size={24} />
                </div>

                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2292A4]">
                  Authorised Access
                </p>

                <h1 className="mt-2 font-['Playfair_Display'] text-4xl font-bold text-[#0B1726]">
                  Sign in
                </h1>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Use your authorised platform credentials to access the internal
                  command centre.
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[#0B1726]">
                    Username
                  </span>

                  <div className="flex items-center rounded-lg border border-[#CAD2D7] bg-white px-4 focus-within:border-[#2292A4] focus-within:ring-2 focus-within:ring-[#2292A4]/10">
                    <User size={18} className="mr-3 text-slate-400" />
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Enter username"
                      autoComplete="username"
                      className="h-13 w-full border-0 bg-transparent py-4 text-sm text-[#0B1726] outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[#0B1726]">
                    Password
                  </span>

                  <div className="flex items-center rounded-lg border border-[#CAD2D7] bg-white px-4 focus-within:border-[#2292A4] focus-within:ring-2 focus-within:ring-[#2292A4]/10">
                    <Lock size={18} className="mr-3 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="h-13 w-full border-0 bg-transparent py-4 text-sm text-[#0B1726] outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !username.trim() || !password.trim()}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[#2292A4] px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#1d7f90] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
                {!isSubmitting && <ArrowRight size={18} />}
              </button>

              <div className="mt-6 rounded-lg border border-[#CAD2D7] bg-[#DFE3E4]/45 p-4">
                <p className="text-xs leading-6 text-slate-600">
                  The public transparency portal does not require login.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/public";
                    }}
                    className="rounded-md border border-[#214560] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#214560] transition hover:bg-[#214560] hover:text-white"
                  >
                    Public Home
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/public/reports";
                    }}
                    className="rounded-md bg-[#2292A4] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#1d7f90]"
                  >
                    Public Reports
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Globe2 size={14} />
              <span>Secure internal access · KS-CCC</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}