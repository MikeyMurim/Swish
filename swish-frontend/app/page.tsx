"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { SideNav, BottomNav } from "./NavShell";
import Icon from "./Icon";
import { checkIn } from "./checkin";
import { isCourtFull, statusTone, type Court } from "./courts";
import { haversineMiles } from "./geo";
import CheckInModal from "./CheckInModal";

const DISTANCE_OPTIONS = [
  { label: "Any distance", value: null },
  { label: "Within 5 kilometres", value: 5 },
  { label: "Within 10 kilometres", value: 10 },
  { label: "Within 25 kilometres", value: 25 },
];

export default function HomeFeed() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<Record<number, boolean>>({});
  const [checkInMessage, setCheckInMessage] = useState<Record<number, string>>({});
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<number | null>(null);
  const [modalCourt, setModalCourt] = useState<Court | null>(null);

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
            <div className="col-span-full text-center text-secondary py-10 animate-pulse font-body">
              Loading courts near you...
            </div>
          ) : visibleCourts.length === 0 ? (
            <div className="col-span-full text-center text-secondary py-10 font-body">
              No courts found.
            </div>
          ) : (
            visibleCourts.map((court) => {
              const full = isCourtFull(court);
              const tone = statusTone(court.status);

              return (
                <article
                  key={court.id}
                  className="group relative bg-surface-container overflow-hidden rounded-xl border border-surface-variant/50 hover:border-primary/50 transition-all duration-300 shadow-lg"
                >
                  <div className="relative h-72 w-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-surface-container-high to-surface-container-low flex items-center justify-center">
                      <Icon name="sports_basketball" className="text-6xl! text-surface-variant" />
                    </div>
                    <div className="absolute inset-0 court-card-gradient" />

                    <div className="absolute top-4 left-4 flex gap-2">
                      <span
                        className={`font-body text-label-sm px-3 py-1 rounded-full uppercase font-bold border ${
                          tone === "live"
                            ? "bg-primary-container text-on-primary-container border-transparent animate-pulse"
                            : tone === "full"
                            ? "bg-surface-container-highest/80 text-error border-error/30 backdrop-blur-sm"
                            : "bg-surface-container-highest/80 text-primary border-primary/20 backdrop-blur-sm"
                        }`}
                      >
                        {court.status ?? "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <h3 className="font-headline text-headline-md text-on-surface uppercase leading-none">
                          {court.name}
                        </h3>
                        {court.address && (
                          <p className="font-body text-label-sm text-secondary mt-1 normal-case">
                            {court.address}
                          </p>
                        )}
                      </div>
                      <a
                        href={`/map-view?court=${court.id}`}
                        className="font-body text-label-sm text-secondary hover:text-primary flex items-center gap-1 shrink-0"
                      >
                        <Icon name="location_on" className="text-sm!" />
                        View on map
                      </a>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <div className="flex gap-3">
                        <button
                          onClick={() => setModalCourt(court)}
                          disabled={checkingIn[court.id]}
                          className="flex-1 font-body text-label-md py-3 rounded-lg uppercase font-black active:scale-95 transition-all bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-60"
                        >
                          {checkingIn[court.id] ? "Processing..." : "Update Status"}
                        </button>
                      </div>
                      {checkInMessage[court.id] && (
                        <p className="font-body text-label-sm text-secondary">
                          {checkInMessage[court.id]}
                        </p>
                      )}
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