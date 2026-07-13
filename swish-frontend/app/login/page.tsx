"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Icon from "../Icon";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Covers two cases: someone who's already signed in landing on this page,
  // and someone arriving back here after clicking the confirmation link in
  // their email (Supabase's client picks up the session from the URL
  // automatically, this just moves them on once that happens).
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "sign-in") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.push("/");
    } else {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      setLoading(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setMessage("Check your email to confirm your account. Clicking the link will bring you back here signed in.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-4">
      <div className="w-full max-w-sm bg-surface-container rounded-2xl border border-surface-variant/50 shadow-2xl p-8">
        <h1 className="font-headline text-headline-lg italic font-black text-primary tracking-tighter text-center">
          SWISH
        </h1>
        <p className="font-body text-label-sm text-secondary uppercase tracking-widest text-center mt-1 mb-8">
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="font-body text-label-sm text-secondary uppercase block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
            />
          </div>

          <div>
            <label className="font-body text-label-sm text-secondary uppercase block mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
            />
          </div>

          {error && <p className="font-body text-label-sm text-error">{error}</p>}
          {message && <p className="font-body text-label-sm text-primary">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 font-body text-label-md py-3 rounded-lg uppercase font-black bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-60 transition-all flex justify-center items-center gap-2"
          >
            {loading ? <Icon name="sync" className="animate-spin" /> : mode === "sign-in" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError("");
            setMessage("");
          }}
          className="mt-6 w-full font-body text-label-sm text-secondary hover:text-primary text-center transition-colors"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}