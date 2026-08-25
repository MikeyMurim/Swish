"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import Icon from "../Icon";

type Mode = "sign-in" | "sign-up";
type Position = "Guard" | "Forward";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState<Position>("Guard");
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
          data: { display_name: fullName.trim(), position },
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
    <div className="min-h-screen relative bg-background text-on-background px-4 flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-container via-background to-background"
      />

      <button
        onClick={() => router.back()}
        aria-label="Back"
        className="fixed top-6 left-6 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-surface-container border border-surface-variant text-on-surface hover:border-primary transition-colors"
      >
        <Icon name="arrow_back" />
      </button>

      <div className="w-full max-w-sm z-10 relative">
        <div className="mb-stack-lg text-center">
          <h1 className="font-headline text-headline-lg italic font-black text-primary tracking-tighter">
            SWISH
          </h1>
          <p className="font-body text-label-sm text-secondary uppercase tracking-widest mt-1">
            {mode === "sign-in" ? "The Home Court" : "Join The Home Court"}
          </p>
        </div>

        <div className="bg-surface-container rounded-xl border border-surface-variant/50 shadow-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary-container to-transparent opacity-50" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md relative z-10">
            {mode === "sign-up" && (
              <div>
                <label className="font-body text-label-sm text-secondary uppercase block mb-1">Full Name</label>
                <div className="relative">
                  <Icon name="person" filled className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full bg-surface-container-high border-b-2 border-surface-variant text-on-surface pl-10 pr-4 py-3 font-body outline-none focus:border-primary-container transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">Email</label>
              <div className="relative">
                <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@court.com"
                  className="w-full bg-surface-container-high border-b-2 border-surface-variant text-on-surface pl-10 pr-4 py-3 font-body outline-none focus:border-primary-container transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-body text-label-sm text-secondary uppercase">Password</label>
                {mode === "sign-in" && (
                  <a href="#" className="font-body text-label-sm text-primary hover:text-primary-fixed-dim transition-colors">
                    Forgot Password?
                  </a>
                )}
              </div>
              <div className="relative">
                <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-surface-container-high border-b-2 border-surface-variant text-on-surface pl-10 pr-4 py-3 font-body outline-none focus:border-primary-container transition-colors"
                />
              </div>
            </div>

            {mode === "sign-up" && (
              <div>
                <label className="font-body text-label-sm text-secondary uppercase block mb-2">Position</label>
                <div className="flex gap-2">
                  {(["Guard", "Forward"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPosition(option)}
                      className={`px-5 py-2 rounded-full font-body text-label-md transition-colors ${
                        position === option
                          ? "bg-primary-container text-on-primary-container"
                          : "bg-surface-variant text-secondary hover:text-on-surface"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="font-body text-label-sm text-error">{error}</p>}
            {message && <p className="font-body text-label-sm text-primary">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 font-body text-label-md py-3 rounded-lg uppercase font-black bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-60 transition-all flex justify-center items-center gap-2 group"
            >
              {loading ? (
                <Icon name="sync" className="animate-spin" />
              ) : (
                <>
                  {mode === "sign-in" ? "Sign In" : "Create Account"}
                  <Icon name="arrow_forward" className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-stack-lg text-center">
          <button
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError("");
              setMessage("");
            }}
            className="font-body text-label-sm text-secondary hover:text-primary transition-colors"
          >
            {mode === "sign-in" ? "Don't have an account? " : "Already have an account? "}
            <span className="font-body text-label-md text-primary uppercase ml-1">
              {mode === "sign-in" ? "Sign Up instead" : "Sign In instead"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
