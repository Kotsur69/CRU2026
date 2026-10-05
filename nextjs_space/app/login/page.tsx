"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Sign-in form. Nothing here is a security boundary: lengths, `required` and the
 * error text are conveniences, and every rule is enforced again on the server in
 * lib/auth.ts + lib/login-guard.ts, whatever the browser sends.
 */
const MAX_LOGIN_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 72;

const INPUT_CLASS =
  "w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });
    setLoading(false);
    if (!res || res.error) {
      // Deliberately one message for every failure: wrong login, wrong password and
      // a locked account must look the same, or the form leaks which logins exist.
      setError(
        "Nieprawidłowy login lub hasło. Po 5 nieudanych próbach logowanie jest blokowane na 15 minut.",
      );
      setPassword("");
      return;
    }
    router.push("/umowy");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-gradient p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl">
        <h1 className="font-heading text-2xl font-semibold text-primary">
          AMDS CRU
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Rejestr umów — zaloguj się
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="login" className="mb-1 block text-sm font-medium">Login</label>
            <input
              id="login"
              name="login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className={INPUT_CLASS}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_LOGIN_LENGTH}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">Hasło</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
              autoComplete="current-password"
              maxLength={MAX_PASSWORD_LENGTH}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Logowanie…" : "Zaloguj"}
          </button>
        </form>
      </div>
    </div>
  );
}
