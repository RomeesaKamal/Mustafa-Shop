import { useState } from "react";
import { signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth, googleProvider, firebaseConfigured } from "./firebase";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setError("");
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      // Popups are blocked on some phone browsers — fall back to a full-page redirect.
      if (e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request") {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (e2) {
          setError("Could not open Google sign-in. Please try again.");
        }
      } else if (e.code !== "auth/popup-closed-by-user") {
        setError("Sign-in didn't go through. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseConfigured) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-mark" style={{ margin: "0 auto 14px" }}>MS</div>
          <h1>Mustafa&apos;s Shop</h1>
          <p className="login-note">
            Google sign-in isn&apos;t set up yet. Open <code>src/firebase.js</code> and paste in your Firebase
            project&apos;s config values, then reload.
          </p>
        </div>
        <LoginStyles />
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-mark" style={{ margin: "0 auto 14px" }}>MS</div>
        <h1>Mustafa&apos;s Shop</h1>
        <p className="login-note">Sign in with Google to open your shop. The same account shows the same data on every device.</p>
        <button className="btn primary block" onClick={handleGoogleSignIn} disabled={busy}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </div>
      <LoginStyles />
    </div>
  );
}

function LoginStyles() {
  return (
    <style>{`
      .login-screen { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg, #f6f6f4); }
      .login-card { width: 100%; max-width: 360px; background: var(--card, #fff); border: 1px solid var(--line, #e5e5e0); border-radius: 18px; padding: 28px 24px; text-align: center; }
      .login-card h1 { font-size: 1.25rem; margin: 0 0 8px; }
      .login-note { font-size: 0.9rem; color: var(--ink-soft, #70706a); margin: 0 0 18px; line-height: 1.4; }
      .login-error { color: var(--bad, #c0392b); font-size: 0.85rem; margin-top: 10px; }
    `}</style>
  );
}
