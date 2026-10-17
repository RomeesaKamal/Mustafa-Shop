import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfigured } from "./firebase";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setError("");
    setBusy(true);

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
        });

        const idToken = result.credential?.idToken;

        if (!idToken) {
          throw new Error("Google did not return an ID token.");
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (e) {
      console.error("Google sign-in error:", e);
      setError(e.message || "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseConfigured) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-mark" style={{ margin: "0 auto 14px" }}>
            MS
          </div>
          <h1>Mustafa&apos;s Shop</h1>
          <p className="login-note">
            Google sign-in is not configured. Check src/firebase.js.
          </p>
        </div>
        <LoginStyles />
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-mark" style={{ margin: "0 auto 14px" }}>
          MS
        </div>
        <h1>Mustafa&apos;s Shop</h1>
        <p className="login-note">
          Sign in with Google to open your shop. Your account can access its
          shop data across devices.
        </p>
        <button
          className="btn primary block"
          onClick={handleGoogleSignIn}
          disabled={busy}
        >
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
      .login-screen {
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--bg, #f6f6f4);
      }
      .login-card {
        width: 100%;
        max-width: 360px;
        background: var(--card, #fff);
        border: 1px solid var(--line, #e5e5e0);
        border-radius: 18px;
        padding: 28px 24px;
        text-align: center;
      }
      .login-card h1 {
        font-size: 1.25rem;
        margin: 0 0 8px;
      }
      .login-note {
        font-size: 0.9rem;
        color: var(--ink-soft, #70706a);
        margin: 0 0 18px;
        line-height: 1.4;
      }
      .login-error {
        color: var(--bad, #c0392b);
        font-size: 0.85rem;
        margin-top: 10px;
        overflow-wrap: anywhere;
      }
    `}</style>
  );
}
