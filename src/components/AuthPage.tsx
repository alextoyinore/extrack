import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { useState } from "react";

export default function AuthPage({
  onAuthenticate,
}: {
  onAuthenticate: (mode: "login" | "register", email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await onAuthenticate(mode, email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not authenticate.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><span><Sparkles size={18} /></span> Extrack</div>
        <p className="eyebrow">Your personal finance workspace</p>
        <h1>{mode === "login" ? "Welcome back." : "Create your account."}</h1>
        <p className="auth-subtitle">{mode === "login" ? "Sign in to continue to your workspace." : "Your financial records will be private to your account."}</p>
        <label className="form-field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="form-field">
          <span>Password</span>
          <span className="password-input-wrap">
            <input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 8 : 1} />
            <button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </span>
        </label>
        {mode === "register" && <label className="form-field"><span>Confirm password</span><span className="password-input-wrap"><input type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} /><button className="password-visibility" type="button" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} onClick={() => setShowConfirmPassword((shown) => !shown)}>{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={16} /></button>
        <p className="auth-switch">{mode === "login" ? "New to Extrack?" : "Already have an account?"}{" "}<button type="button" onClick={() => { setError(""); setMode(mode === "login" ? "register" : "login"); }}> {mode === "login" ? "Create an account" : "Sign in"}</button></p>
      </form>
    </main>
  );
}
