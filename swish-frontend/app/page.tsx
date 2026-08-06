"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { SideNav, BottomNav } from "./NavShell";
import Icon from "./Icon";
import { checkIn } from "./checkin";
import { statusTone, type Court } from "./courts";
import { haversineMiles } from "./geo";
import CheckInModal from "./CheckInModal";
import { useAuth } from "../lib/useAuth";

const DISTANCE_OPTIONS = [
  { label: "Any distance", value: null },
  { label: "Within 5 kilometres", value: 5 },
  { label: "Within 10 kilometres", value: 10 },
  { label: "Within 25 kilometres", value: 25 },
];

export default function HomeFeed() {
  const { user } = useAuth();
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<Record<number, boolean>>({});
  const [checkInMessage, setCheckInMessage] = useState<Record<number, string>>({});
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null);
  const [modalCourt, setModalCourt] = useState<Court | null>(null);
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchCourts = async () => {
      const { data, error } = await supabase.from("courts").select("*");
      if (error) console.error("Error fetching courts:", error);
      if (data) setCourts(data as Court[]);
      setLoading(false);
    };
    fetchCourts();

    const channel = supabase
      .channel("realtime-courts-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCourts((current) => [...current, payload.new as Court]);
          } else if (payload.eventType === "UPDATE") {
            setCourts((current) =>
              current.map((c) => (c.id === (payload.new as Court).id ? (payload.new as Court) : c))
            );
          } else if (payload.eventType === "DELETE") {
            setCourts((current) => current.filter((c) => c.id !== (payload.old as Court).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("favourite_courts")
      .select("court_id")
      .eq("user_id", user.id)
      .then(({ data }) => setFavouriteIds(new Set((data ?? []).map((row) => row.court_id))));
  }, [user]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
      () => {}
    );
  }, []);

  const visibleCourts = useMemo(() => {
    if (distanceFilter === null || !userLocation) return courts;
    return courts.filter((court) => {
      const coords = court.location?.coordinates;
      if (!coords) return true;
      return haversineMiles(userLocation, coords) <= distanceFilter;
    });
  }, [courts, distanceFilter, userLocation]);

  const executeCheckIn = async (courtId: number, status: string) => {
    setCheckingIn((c) => ({ ...c, [courtId]: true }));
    setCheckInMessage((c) => ({ ...c, [courtId]: "" }));

    const result = await checkIn(courtId, userLocation, status);

    setCheckingIn((c) => ({ ...c, [courtId]: false }));
    if (!result.ok) {
      setCheckInMessage((c) => ({ ...c, [courtId]: result.message }));
    } else {
      setCheckInMessage((c) => ({ ...c, [courtId]: "Checked in." }));
      setTimeout(() => {
        setCheckInMessage((c) => ({ ...c, [courtId]: "" }));
      }, 3000);
    }
  };

  const toggleFavourite = async (courtId: number) => {
    if (!user) {
      setCheckInMessage((current) => ({ ...current, [courtId]: "Sign in to save favourite courts." }));
      return;
    }

    const isFavourite = favouriteIds.has(courtId);
    const { error } = isFavourite
      ? await supabase.from("favourite_courts").delete().eq("court_id", courtId).eq("user_id", user.id)
      : await supabase.from("favourite_courts").insert({ court_id: courtId, user_id: user.id });

    if (!error) {
      setFavouriteIds((current) => {
        const next = new Set(current);
        if (isFavourite) next.delete(courtId);
        else next.add(courtId);
        return next;
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <SideNav />

      <main className="flex-1 md:ml-64 pb-24 md:pb-8">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md px-container-margin py-4 md:px-8 border-b border-surface-variant/30">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="font-headline text-headline-md uppercase tracking-tight">
              Courts Nearby
            </h2>
            <div className="relative">
              <select
                value={distanceFilter ?? ""}
                onChange={(e) => setDistanceFilter(e.target.value ? Number(e.target.value) : null)}
                className="appearance-none bg-surface-container-high border-b border-surface-variant focus:border-primary-container text-on-surface font-body text-label-md px-4 py-2 pr-10 rounded-lg outline-none transition-all cursor-pointer"
              >
                {DISTANCE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ""}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Icon
                name="expand_more"
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary text-lg"
              />
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-container-margin md:px-8 mt-stack-md flex flex-col gap-4">
          {loading ? (
            <div className="text-center text-secondary py-10 animate-pulse font-body">
              Loading courts near you...
            </div>
          ) : visibleCourts.length === 0 ? (
            <div className="text-center text-secondary py-10 font-body">
              No courts found.
            </div>
          ) : (
            visibleCourts.map((court) => {
              const tone = statusTone(court.status);

              return (
                <article
                  key={court.id}
                  className="bg-surface-container rounded-xl border border-surface-variant/50 hover:border-primary/50 transition-all duration-300 shadow-lg p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-xl bg-surface-container-high p-3">
                      <Icon name="sports_basketball" className="text-3xl! text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                        <h3 className="font-headline text-headline-md text-on-surface uppercase leading-none">
                          {court.name}
                        </h3>
                        {court.address && (
                          <p className="font-body text-label-sm text-secondary mt-1 normal-case">
                            {court.address}
                          </p>
                        )}
                        <p className="font-body text-label-sm text-secondary mt-2">
                          Added by {court.added_by || "the Swish community"}
                        </p>
                        </div>
                        <span
                          className={`font-body text-label-sm px-3 py-1 rounded-full uppercase font-bold border ${
                            tone === "live"
                              ? "bg-primary-container text-on-primary-container border-transparent animate-pulse"
                              : tone === "full"
                              ? "bg-surface-container-highest text-error border-error/30"
                              : "bg-surface-container-highest text-primary border-primary/20"
                          }`}
                        >
                          {court.status ?? "Unknown"}
                        </span>
                      </div>
                      <a
                        href={`/map-view?court=${court.id}`}
                        className="mt-3 font-body text-label-sm text-secondary hover:text-primary flex items-center gap-1"
                      >
                        <Icon name="location_on" className="text-sm!" />
                        View on map
                      </a>
                      <div className="mt-4 flex flex-col gap-2">
                      <div className="flex gap-3">
                        <button
                          onClick={() => setModalCourt(court)}
                          disabled={checkingIn[court.id]}
                          className="flex-1 font-body text-label-md py-3 rounded-lg uppercase font-black active:scale-95 transition-all bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-60"
                        >
                          {checkingIn[court.id] ? "Processing..." : "Update Status"}
                        </button>
                        <button
                          onClick={() => toggleFavourite(court.id)}
                          aria-label={favouriteIds.has(court.id) ? "Remove from favourites" : "Add to favourites"}
                          className={`w-12 rounded-lg border transition-colors ${
                            favouriteIds.has(court.id)
                              ? "border-primary bg-primary-container text-on-primary-container"
                              : "border-surface-variant text-secondary hover:text-primary"
                          }`}
                        >
                          <Icon name="favorite" filled={favouriteIds.has(court.id)} />
                        </button>
                      </div>
                      {checkInMessage[court.id] && (
                        <p className="font-body text-label-sm text-secondary">
                          {checkInMessage[court.id]}
                        </p>
                      )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </main>

      <BottomNav />

      {modalCourt && (
        <CheckInModal
          court={modalCourt}
          onClose={() => setModalCourt(null)}
          onConfirm={(status) => executeCheckIn(modalCourt.id, status)}
        />
      )}
    </div>
  );
}
