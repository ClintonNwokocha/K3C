import { useState } from "react";
import { ArrowRight, Globe2, Lock, User } from "lucide-react";
import OfficialLogo from "../components/OfficialLogo";

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
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#030454_0%,#030454_58%,#009B35_160%)]" />
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_25%,#009B35_0,transparent_28%),radial-gradient(circle_at_80%_20%,#F3F74B_0,transparent_22%)]" />

          <div className="relative z-10 flex items-center">
            <OfficialLogo
              variant="light"
              className="max-w-[430px]"
            />
          </div>

          <div className="relative z-10 max-w-2xl">
            <p className="mb-6 text-xs font-black uppercase tracking-[0.18em] text-[#F3F74B]">
              Internal Command Access
            </p>

            <h1 className="font-['Playfair_Display'] text-6xl font-black leading-tight tracking-tight">
              Climate intelligence
              <br />
              <span className="text-[#F3F74B]">for coordinated action</span>
            </h1>

            <p className="mt-6 max-w-xl text-base font-light leading-8 text-white/75">
              Secure access for authorised staff to manage Climate Intelligence data,
              greenhouse gas inventory, climate projects, reports and
              audit-ready evidence.
            </p>
          </div>

          <div className="relative z-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">
                Module
              </p>
              <p className="mt-2 font-bold">Climate Intelligence</p>
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

        <section className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-6 flex justify-center lg:hidden">
              <OfficialLogo
                variant="dark"
                className="max-w-[340px]"
                compact
              />
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
            >
              <div className="mb-8">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#030454] text-white">
                  <Lock size={24} />
                </div>

                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
                  Authorised Access
                </p>

                <h1 className="mt-2 font-['Playfair_Display'] text-4xl font-bold text-[#030454]">
                  Sign in
                </h1>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Use your authorised platform credentials to access the
                  internal command centre.
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
                      className="h-13 w-full border-0 bg-transparent py-4 text-sm text-[#030454] outline-none placeholder:text-slate-400"
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
                      className="h-13 w-full border-0 bg-transparent py-4 text-sm text-[#030454] outline-none placeholder:text-slate-400"
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
                    className="rounded-md bg-[#030454] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#02033d]"
                  >
                    Public Reports
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Globe2 size={14} />
              <span>Secure internal access · KCCC</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}