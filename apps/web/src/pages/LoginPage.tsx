import { FormEvent, useState } from "react";
import { useAuth } from "../state/auth";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to login");
    }
  };

  return (
    <>
      <div className="shimmer-bar" aria-hidden />
      <div className="login-screen">
        <div className="login-bg" aria-hidden />
        <form className="login-box" onSubmit={onSubmit}>
          <div className="login-logo">⬡ GoldStream</div>
          <div className="login-tagline">Live Gold · Direct Sales Platform</div>
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="login-btn">
            Sign in
          </button>
          <div className="login-err" role={error ? "alert" : undefined}>
            {error}
          </div>
        </form>
      </div>
    </>
  );
}
