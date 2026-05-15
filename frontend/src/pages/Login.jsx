import { useState } from "react";
import { ShieldCheck } from "lucide-react";

export default function Login({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await onLogin(username, password);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-white p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
            <ShieldCheck size={26} />
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-950">KS-CCC</h1>
            <p className="text-sm text-slate-500">
              Kaduna State Climate Command Center
            </p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-950">Sign in</h2>
        <p className="mt-2 text-sm text-slate-500">
          Use your authorised platform credentials.
        </p>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400">
          Public transparency portal will not require login.
        </p>
      </div>
    </main>
  );
}