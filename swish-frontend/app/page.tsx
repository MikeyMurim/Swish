"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { SideNav, BottomNav } from "./NavShell";
import Icon from "./Icon";
import CourtMedia from "./CourtMedia";
import { checkIn } from "./checkin";
import { toggleCourtJoin } from "./joins";
import { effectivePlayerCount, type Court } from "./courts";
import { haversineMiles } from "./geo";
import CourtDetailModal from "./CourtDetailModal";
import AuthGateModal from "./AuthGateModal";
import { useAuth } from "../lib/useAuth";
import { useFavourites } from "../lib/useFavourites";

const DISTANCE_OPTIONS = [
  { label: "Any distance", value: null },
  { label: "Within 5 kilometres", value: 5 },
  { label: "Within 10 kilometres", value: 10 },
  { label: "Within 25 kilometres", value: 25 },
];

export default function HomeFeed() {
  const { user } = useAuth();
  const { favouriteIds, toggleFavourite } = useFavourites(user);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkInMessage, setCheckInMessage] = useState<Record<number, string>>({});
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null);
  const [modalCourt, setModalCourt] = useState<Court | null>(null);
  const [joinedCourtIds, setJoinedCourtIds] = useState<Set<number>>(new Set());
  const [joinCounts, setJoinCounts] = useState<Map<number, number>>(new Map());
  const [joining, setJoining] = useState<Record<number, boolean>>({});
  const [authGateOpen, setAuthGateOpen] = useState(false);

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
    const fetchJoins = async () => {
      const { data, error } = await supabase.from("court_joins").select("court_id, user_id");
      if (error) {
        console.error("Error fetching court joins:", error);
        return;
      }
      const counts = new Map<number, number>();
      const mine = new Set<number>();
      for (const row of data ?? []) {
        counts.set(row.court_id, (counts.get(row.court_id) ?? 0) + 1);
        if (user && row.user_id === user.id) mine.add(row.court_id);
      }
      setJoinCounts(counts);
      setJoinedCourtIds(mine);
    };
    fetchJoins();

    const channel = supabase
      .channel("realtime-court-joins-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "court_joins" }, () => {
        fetchJoins();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const executeCheckIn = async (courtId: number, status: string, playerCount?: number) => {
    setCheckInMessage((c) => ({ ...c, [courtId]: "" }));

    const result = await checkIn(courtId, userLocation, status, playerCount);

    if (!result.ok) {
      if (result.reason === "not-signed-in") {
        setAuthGateOpen(true);
      } else {
        setCheckInMessage((c) => ({ ...c, [courtId]: result.message }));
      }
    } else {
      setCheckInMessage((c) => ({ ...c, [courtId]: "Checked in." }));
      setTimeout(() => {
        setCheckInMessage((c) => ({ ...c, [courtId]: "" }));
      }, 3000);
    }
  };

  const handleConfirmCount = async (courtId: number, count: number, capacity: number | null) => {
    const status = capacity !== null && count >= capacity ? "full" : "live";
    await executeCheckIn(courtId, status, count);
  };

  const handleToggleJoin = async (courtId: number) => {
    if (!user) {
      setAuthGateOpen(true);
      return;
    }

    setJoining((current) => ({ ...current, [courtId]: true }));
    const isJoined = joinedCourtIds.has(courtId);
    const { error } = await toggleCourtJoin(courtId, user.id, isJoined);
    setJoining((current) => ({ ...current, [courtId]: false }));

    if (!error) {
      setJoinedCourtIds((current) => {
        const next = new Set(current);
        if (isJoined) next.delete(courtId);
        else next.add(courtId);
        return next;
      });
      setJoinCounts((current) => {
        const next = new Map(current);
        const count = next.get(courtId) ?? 0;
        next.set(courtId, isJoined ? Math.max(0, count - 1) : count + 1);
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

        <div className="max-w-5xl mx-auto px-container-margin md:px-8 mt-stack-md grid grid-cols-1 md:grid-cols-2 gap-gutter">
          {loading ? (
            <div className="md:col-span-2 text-center text-secondary py-10 animate-pulse font-body">
              Loading courts near you...
            </div>
          ) : visibleCourts.length === 0 ? (
            <div className="md:col-span-2 text-center text-secondary py-10 font-body">
              No courts found.
            </div>
          ) : (
            visibleCourts.map((court) => {
              const joinedCount = joinCounts.get(court.id) ?? 0;
              const reportedCount = effectivePlayerCount(court);
              const displayCount = reportedCount ?? joinedCount;
              const isJoined = joinedCourtIds.has(court.id);
              const capacity = court.capacity ?? null;
              const isFull = capacity !== null && displayCount >= capacity && !isJoined;

              return (
                <article
                  key={court.id}
                  onClick={() => setModalCourt(court)}
                  className="group relative bg-surface-container overflow-hidden rounded-xl border border-surface-variant/50 hover:border-primary/50 transition-all duration-300 shadow-lg cursor-pointer"
                >
                  <CourtMedia court={court} className="h-72" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-2">
                    <div className="flex justify-between items-end gap-3">
                      <div className="min-w-0">
                        <h3 className="font-headline text-headline-md text-on-surface uppercase leading-none truncate">
                          {court.name}
                        </h3>
                        {court.address && (
                          <p className="font-body text-label-sm text-secondary opacity-80 flex items-center gap-1 mt-1">
                            <Icon name="location_on" className="text-sm!" />
                            {court.address}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block font-headline text-headline-md text-primary">
                          {capacity !== null ? `${displayCount}/${capacity}` : displayCount}
                        </span>
                        <span className="block font-body text-label-sm text-secondary uppercase">
                          {isFull ? "Full" : "Players"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!user) {
                            setAuthGateOpen(true);
                            return;
                          }
                          handleToggleJoin(court.id);
                          setModalCourt(court);
                        }}
                        disabled={joining[court.id] || isFull}
                        className={`flex-1 font-body text-label-md py-3 rounded-lg uppercase font-black active:scale-95 transition-all disabled:opacity-50 ${
                          isJoined
                            ? "bg-surface-variant text-on-surface hover:brightness-110"
                            : "bg-primary-container text-on-primary-container hover:brightness-110"
                        }`}
                      >
                        {joining[court.id]
                          ? "..."
                          : isFull
                          ? "Full"
                          : isJoined
                          ? "Leave Pick-up"
                          : "Join Pick-up"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavourite(court.id);
                        }}
                        aria-label={favouriteIds.has(court.id) ? "Remove from favourites" : "Add to favourites"}
                        className={`w-12 rounded-lg border transition-colors flex items-center justify-center ${
                          favouriteIds.has(court.id)
                            ? "border-primary bg-primary-container text-on-primary-container"
                            : "border-secondary/30 text-secondary hover:text-primary"
                        }`}
                      >
                        <Icon name="favorite" filled={favouriteIds.has(court.id)} />
                      </button>
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
        <CourtDetailModal
          court={modalCourt}
          playerCount={effectivePlayerCount(modalCourt) ?? joinCounts.get(modalCourt.id) ?? 0}
          isFavourited={favouriteIds.has(modalCourt.id)}
          isSignedIn={!!user}
          onToggleFavourite={() => toggleFavourite(modalCourt.id)}
          onClose={() => setModalCourt(null)}
          onConfirmCount={(count) => handleConfirmCount(modalCourt.id, count, modalCourt.capacity ?? null)}
          onRequireAuth={() => setAuthGateOpen(true)}
          statusMessage={checkInMessage[modalCourt.id]}
        />
      )}

      {authGateOpen && (
        <AuthGateModal
          title="Sign In to Join"
          description="You need an account to join pick-up or report the player count."
          onClose={() => setAuthGateOpen(false)}
        />
      )}
    </div>
  );
}
