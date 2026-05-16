"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setPending(false);

    if (!response.ok) {
      setError("Accès refusé.");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-6 shadow-premium">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-violetx/20 text-violetx">
          <LockKeyhole size={20} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Dashboard prive</h1>
          <p className="text-sm text-slate-400">xavierfenaux.com/dashboard</p>
        </div>
      </div>

      <label className="mb-3 block text-sm text-slate-300">
        Login
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-white outline-none ring-violetx/60 focus:ring-2"
          autoComplete="username"
        />
      </label>

      <label className="mb-4 block text-sm text-slate-300">
        Mot de passe
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-white outline-none ring-violetx/60 focus:ring-2"
          type="password"
          autoComplete="current-password"
        />
      </label>

      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-violetx px-4 py-2 text-sm font-semibold text-white transition hover:bg-violetx/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Connexion..." : "Entrer"}
      </button>
    </form>
  );
}
