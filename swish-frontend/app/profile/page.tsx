"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import { SideNav, BottomNav } from "../NavShell";
import Icon from "../Icon";
import { statusTone, type Court } from "../courts";

type FavouriteRow = { court_id: number; courts: Court[] | Court | null };
type SessionRow = { court_id: number; check_in_time: string; courts: Court[] | Court | null };

function displayNameFor(email: string | undefined, metadata: Record<string, unknown>) {
  const name = metadata.display_name ?? metadata.full_name ?? metadata.name;
  return typeof name === "string" && name.trim() ? name : email?.split("@")[0] || "Swish player";
}

function oneCourt(value: Court[] | Court | null): Court | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function CourtCard({ court }: { court: Court }) {
  const tone = statusTone(court.status);
  return (
    <Link
      href={`/map-view?court=${court.id}`}
      className="group relative rounded-xl overflow-hidden border border-surface-variant/50 bg-surface-container-high aspect-4/3 hover:border-primary transition-colors"
    >
      <div className="absolute inset-0 flex items-center justify-center bg-surface-container-highest">
        <Icon name="sports_basketball" className="text-6xl! text-surface-variant group-hover:text-primary/40 transition-colors" />
      </div>
      <div className="absolute inset-0 court-card-gradient" />
      <div className="absolute bottom-0 left-0 w-full p-4 flex flex-col justify-end">
        <span
          className={`self-start mb-2 font-body text-label-sm px-2 py-0.5 rounded-full uppercase font-bold border ${
            tone === "live"
              ? "bg-primary-container text-on-primary-container border-transparent"
              : tone === "full"
              ? "bg-surface-container-highest/80 text-error border-error/30"
              : "bg-surface-container-highest/80 text-primary border-primary/20"
          }`}
        >
          {court.status ?? "Unknown"}
        </span>
        <h4 className="font-headline text-headline-md text-on-surface leading-none">{court.name}</h4>
        {court.address && <p className="font-body text-label-sm text-secondary mt-1">{court.address}</p>}
      </div>
    </Link>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState<string | null>(null);
  const [avatarUrlInput, setAvatarUrlInput] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Court[]>([]);
  const [recentCourts, setRecentCourts] = useState<Court[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("favourite_courts")
      .select("court_id, courts(*)")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (error) setMessage("Could not load favourite courts yet.");
        else setFavourites((data as unknown as FavouriteRow[] ?? []).flatMap((row) => {
          if (!row.courts) return [];
          return Array.isArray(row.courts) ? row.courts : [row.courts];
        }));
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("sessions")
      .select("court_id, check_in_time, courts(*)")
      .eq("user_id", user.id)
      .order("check_in_time", { ascending: false })
      .then(({ data }) => {
        const rows = (data as unknown as SessionRow[]) ?? [];
        const seen = new Set<number>();
        const courts: Court[] = [];
        for (const row of rows) {
          const court = oneCourt(row.courts);
          if (!court || seen.has(court.id)) continue;
          seen.add(court.id);
          courts.push(court);
          if (courts.length === 6) break;
        }
        setRecentCourts(courts);
      });
  }, [user]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName.trim(), avatar_url: avatarUrl.trim() },
    });
    setSaving(false);
    setMessage(error ? error.message : "Profile saved.");
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-secondary font-body">Loading...</div>;
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-on-background font-body"><Link href="/login" className="text-primary font-bold uppercase">Sign in to view your profile</Link></div>;
  }

  const metadata = user.user_metadata ?? {};
  const displayName = displayNameInput ?? displayNameFor(user.email, metadata);
  const avatarUrl = avatarUrlInput ?? (typeof metadata.avatar_url === "string" ? metadata.avatar_url : "");
  const position = typeof metadata.position === "string" ? metadata.position : "";
  const initials = displayName.slice(0, 1).toUpperCase() || "S";

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <SideNav />
      <main className="flex-1 md:ml-64 pb-24 md:pb-8 px-container-margin md:px-8 py-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-stack-lg">
          {/* Header */}
          <header className="flex flex-col md:flex-row items-center md:items-end gap-stack-lg pb-stack-lg border-b border-surface-variant/50">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-32 h-32 rounded-full object-cover border-4 border-surface-container-high shrink-0" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline text-5xl shrink-0">
                {initials}
              </div>
            )}
            <div className="flex flex-col items-center md:items-start flex-1 text-center md:text-left gap-2">
              <div className="flex items-center gap-stack-sm flex-wrap justify-center md:justify-start">
                <h2 className="font-headline text-headline-lg text-on-surface">{displayName}</h2>
                {position && (
                  <span className="bg-primary text-on-primary font-body text-label-sm px-3 py-1 rounded-full uppercase tracking-wider font-bold">
                    {position}
                  </span>
                )}
              </div>
              <p className="font-body text-label-sm text-secondary">{user.email}</p>
              <div className="flex gap-stack-sm mt-2">
                <button
                  onClick={() => setMessage("Coming soon.")}
                  className="bg-primary-container text-on-primary-container font-body text-label-md uppercase px-6 py-2 rounded-lg hover:brightness-110 transition-all"
                >
                  Message
                </button>
                <button
                  onClick={() => setMessage("Coming soon.")}
                  className="bg-transparent border border-surface-variant text-on-surface font-body text-label-md uppercase px-6 py-2 rounded-lg hover:border-primary transition-colors"
                >
                  Follow
                </button>
              </div>
            </div>
          </header>

          {/* Mutual Hoopers */}
          <section className="bg-surface-container rounded-xl border border-surface-variant/50 p-stack-md">
            <h3 className="font-headline text-headline-md text-primary mb-1 flex items-center gap-2">
              <Icon name="groups" className="text-2xl!" />
              Mutual Hoopers
            </h3>
            <p className="font-body text-label-sm text-secondary mb-stack-md">Coming soon — see who you&apos;ve both played with.</p>
            <div className="flex gap-3">
              {["A", "J", "S"].map((letter, i) => (
                <div key={i} className="w-12 h-12 rounded-full bg-surface-container-high border border-surface-variant flex items-center justify-center font-headline text-on-surface">
                  {letter}
                </div>
              ))}
            </div>
          </section>

          {/* Recent Courts */}
          <section>
            <h3 className="font-headline text-headline-md text-on-surface mb-stack-md">Recent Courts</h3>
            {recentCourts.length === 0 ? (
              <p className="font-body text-secondary">Check in at a court to see it here.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
                {recentCourts.map((court) => <CourtCard key={court.id} court={court} />)}
              </div>
            )}
          </section>

          {/* Favourite Courts */}
          <section>
            <h3 className="font-headline text-headline-md text-on-surface mb-stack-md">Favourite Courts</h3>
            {favourites.length === 0 ? (
              <p className="font-body text-secondary">Save courts from the feed to see them here.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
                {favourites.map((court) => <CourtCard key={court.id} court={court} />)}
              </div>
            )}
          </section>

          {/* Edit Profile */}
          <section className="bg-surface-container rounded-xl border border-surface-variant/50 p-stack-md">
            <h3 className="font-headline text-headline-md text-on-surface mb-stack-md">Edit Profile</h3>
            <form onSubmit={saveProfile} className="flex flex-col gap-4">
              <label className="font-body text-label-sm text-secondary uppercase">Display name<input value={displayName} onChange={(e) => setDisplayNameInput(e.target.value)} className="mt-1 w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface outline-none focus:border-primary-container" /></label>
              <label className="font-body text-label-sm text-secondary uppercase">Profile picture URL<input type="url" value={avatarUrl} onChange={(e) => setAvatarUrlInput(e.target.value)} placeholder="https://..." className="mt-1 w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface outline-none focus:border-primary-container" /></label>
              {message && <p className="font-body text-label-sm text-secondary">{message}</p>}
              <button disabled={saving} className="self-start px-5 py-3 rounded-lg bg-primary-container text-on-primary-container font-body font-black uppercase disabled:opacity-60">{saving ? "Saving..." : "Save profile"}</button>
            </form>
          </section>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
