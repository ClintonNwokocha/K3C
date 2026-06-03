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
    <main className="min-h-screen bg-[#030454] font-['DM_Sans'] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#030454_0%,#05067a_55%,#030454_100%)]" />
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_25%,#009B35_0,transparent_28%),radial-gradient(circle_at_80%_20%,#F3F74B_0,transparent_22%)]" />

          <svg
            className="absolute bottom-10 right-10 h-[420px] w-[480px] opacity-[0.14]"
            viewBox="0 0 480 420"
            fill="none"
          >
            <path
              d="M120 40 L200 20 L300 50 L380 120 L420 200 L400 310 L320 380 L220 400 L140 360 L80 280 L60 180 Z"
              fill="#009B35"
              stroke="#F3F74B"
              strokeWidth="2"
            />
            <circle cx="240" cy="200" r="5" fill="#F3F74B" />
            <circle cx="180" cy="150" r="4" fill="#009B35" />
            <circle cx="300" cy="250" r="4" fill="#009B35" />
            <circle cx="200" cy="280" r="4" fill="#F3F74B" />
          </svg>

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#009B35]">
              <ShieldCheck size={22} />
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em]">
                KS-CCC
              </p>
              <p className="text-xs text-white/60">
                Kaduna State Climate Command Centre
              </p>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-[#F3F74B]/45 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F3F74B]">
              <span className="h-2 w-2 rounded-full bg-[#F3F74B]" />
              Internal Command Access
            </div>

            <h1 className="font-['Playfair_Display'] text-6xl font-black leading-tight tracking-tight">
              Climate intelligence
              <br />
              <span className="text-[#F3F74B]">for coordinated action</span>
            </h1>

            <p className="mt-6 max-w-xl text-base font-light leading-8 text-white/75">
              Secure access for authorised staff to manage climate risk data,
              greenhouse gas inventory, climate projects, reports and audit-ready
              evidence.
            </p>
          </div>

          <div className="relative z-10 grid gap-4 md:grid-cols-3">
            {["Climate Risk", "GHG Inventory", "Reports Centre"].map((item) => (
              <div
                key={item}
                className="rounded-lg border border-white/15 bg-white/5 p-4"
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                  Module
                </p>
                <p className="mt-2 font-bold">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-white px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-6 flex justify-center lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#009B35] text-white">
                  <ShieldCheck size={22} />
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#030454]">
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
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
            >
              <div className="mb-8">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#030454] text-white">
                  <Lock size={24} />
                </div>

                <h1 className="font-['Playfair_Display'] text-4xl font-bold text-[#030454]">
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
                  <span className="mb-2 block text-sm font-bold text-[#030454]">
                    Username
                  </span>

                  <div className="flex items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-[#009B35] focus-within:ring-2 focus-within:ring-[#009B35]/10">
                    <User size={18} className="mr-3 text-slate-400" />
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Enter username"
                      autoComplete="username"
                      className="h-14 w-full border-0 bg-transparent text-sm text-[#030454] outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[#030454]">
                    Password
                  </span>

                  <div className="flex items-center rounded-lg border border-slate-200 bg-white px-4 focus-within:border-[#009B35] focus-within:ring-2 focus-within:ring-[#009B35]/10">
                    <Lock size={18} className="mr-3 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="h-14 w-full border-0 bg-transparent text-sm text-[#030454] outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !username.trim() || !password.trim()}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[#009B35] px-5 py-4 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
                {!isSubmitting && <ArrowRight size={18} />}
              </button>

              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs leading-6 text-slate-600">
                  The public transparency portal does not require login.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/public";
                    }}
                    className="rounded-md border border-[#030454] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#030454] hover:text-white"
                  >
                    Public Home
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/public/reports";
                    }}
                    className="rounded-md bg-[#009B35] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
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