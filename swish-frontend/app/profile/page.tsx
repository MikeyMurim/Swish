"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import { SideNav, BottomNav } from "../NavShell";
import Icon from "../Icon";
import type { Court } from "../courts";

type FavouriteRow = { court_id: number; courts: Court[] | Court | null };

function displayNameFor(email: string | undefined, metadata: Record<string, unknown>) {
  const name = metadata.display_name ?? metadata.full_name ?? metadata.name;
  return typeof name === "string" && name.trim() ? name : email?.split("@")[0] || "Swish player";
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState<string | null>(null);
  const [avatarUrlInput, setAvatarUrlInput] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Court[]>([]);
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
  const initials = displayName.slice(0, 1).toUpperCase() || "S";
  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <SideNav />
      <main className="flex-1 md:ml-64 pb-24 md:pb-8 px-container-margin md:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-headline text-headline-md uppercase tracking-tight mb-6">Your Profile</h2>
          <section className="bg-surface-container rounded-xl border border-surface-variant/50 p-6">
            <div className="flex items-center gap-5 mb-6">
              {avatarUrl ? <img src={avatarUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-primary" /> : <div className="w-20 h-20 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline text-3xl">{initials}</div>}
              <div><p className="font-headline text-headline-sm">{displayName}</p><p className="font-body text-label-sm text-secondary">{user.email}</p></div>
            </div>
            <form onSubmit={saveProfile} className="flex flex-col gap-4">
              <label className="font-body text-label-sm text-secondary uppercase">Display name<input value={displayName} onChange={(e) => setDisplayNameInput(e.target.value)} className="mt-1 w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface outline-none focus:border-primary-container" /></label>
              <label className="font-body text-label-sm text-secondary uppercase">Profile picture URL<input type="url" value={avatarUrl} onChange={(e) => setAvatarUrlInput(e.target.value)} placeholder="https://..." className="mt-1 w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface outline-none focus:border-primary-container" /></label>
              {message && <p className="font-body text-label-sm text-secondary">{message}</p>}
              <button disabled={saving} className="self-start px-5 py-3 rounded-lg bg-primary-container text-on-primary-container font-body font-black uppercase disabled:opacity-60">{saving ? "Saving..." : "Save profile"}</button>
            </form>
          </section>
          <section className="mt-6"><h3 className="font-headline text-headline-sm uppercase mb-3">Favourite Courts</h3>{favourites.length === 0 ? <p className="font-body text-secondary">Save courts from the feed to see them here.</p> : <div className="flex flex-col gap-3">{favourites.map((court) => <Link key={court.id} href={`/map-view?court=${court.id}`} className="bg-surface-container rounded-xl border border-surface-variant/50 p-4 flex items-center gap-3 hover:border-primary"><Icon name="favorite" filled className="text-primary" /><div><p className="font-body font-bold">{court.name}</p><p className="font-body text-label-sm text-secondary">{court.address || court.status || "Court"}</p></div></Link>)}</div>}</section>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
