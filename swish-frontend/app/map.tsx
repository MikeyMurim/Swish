"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/useAuth";
import { useFavourites } from "../lib/useFavourites";
import Icon from "./Icon";
import CourtMedia from "./CourtMedia";
import { checkIn } from "./checkin";
import { toggleCourtJoin } from "./joins";
import { effectiveStatusTone, isCourtFull, type Court } from "./courts";
import { haversineMiles } from "./geo";
import CheckInModal from "./CheckInModal";

type MapCourt = Court & {
  latitude: number;
  longitude: number;
  joined_count: number;
};

type TypeFilter = "all" | "indoor" | "outdoor";

function buildMarkerElement(court: MapCourt, highlight: boolean) {
  const wrapper = document.createElement("div");
  wrapper.className = "relative flex items-center justify-center cursor-pointer";

  if (highlight) {
    const ring = document.createElement("div");
    ring.className = "absolute w-12 h-12 bg-primary-container rounded-full opacity-30 live-marker";
    wrapper.appendChild(ring);

    const center = document.createElement("div");
    center.className =
      "relative w-10 h-10 bg-primary-container text-on-primary-container rounded-full flex items-center justify-center shadow-2xl border-2 border-white/20";
    center.innerHTML = '<span class="material-symbols-outlined fill-icon">sports_basketball</span>';
    wrapper.appendChild(center);

    const label = document.createElement("div");
    label.className =
      "absolute -bottom-8 bg-surface-container-high px-3 py-1 rounded-full border border-surface-variant whitespace-nowrap shadow-xl";
    label.innerHTML = `<span class="font-body text-label-sm text-white">${court.name}</span>`;
    wrapper.appendChild(label);
  } else {
    const dot = document.createElement("div");
    dot.className =
      "w-8 h-8 bg-secondary-container text-secondary rounded-full flex items-center justify-center border border-white/10 opacity-70 hover:opacity-100 transition-opacity";
    dot.innerHTML = '<span class="material-symbols-outlined">sports_basketball</span>';
    wrapper.appendChild(dot);
  }

  return wrapper;
}

export default function Map() {
  const { user } = useAuth();
  const { favouriteIds, toggleFavourite } = useFavourites(user);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const [courts, setCourts] = useState<MapCourt[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState("");
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [joinedCourtIds, setJoinedCourtIds] = useState<Set<number>>(new Set());
  const [joining, setJoining] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: "carto-dark-layer",
            type: "raster",
            source: "carto-dark",
            minzoom: 0,
            maxzoom: 18,
          },
        ],
      },
      center: [151.15, -33.8], // Sydney
      zoom: 11,
    });

    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
      (err) => console.warn("Location denied:", err)
    );

    return () => {
      map.current?.remove();
    };
  }, []);

  // 2. Fetch Courts & Realtime
  useEffect(() => {
    const fetchCourts = async () => {
      // PostGIS geography values are returned as encoded spatial data by a
      // normal select. The RPC converts them to marker-ready coordinates.
      const { data, error } = await supabase.rpc("get_courts_for_map");
      if (error) {
        console.error("Error fetching courts:", error);
        return;
      }
      if (data) setCourts(data as MapCourt[]);
    };
    fetchCourts();

    const courtsChannel = supabase
      .channel("realtime-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "courts" }, () => {
        fetchCourts(); // Force a clean refetch to keep data perfectly in sync
      })
      .subscribe();

    const joinsChannel = supabase
      .channel("realtime-map-joins")
      .on("postgres_changes", { event: "*", schema: "public", table: "court_joins" }, () => {
        fetchCourts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(courtsChannel);
      supabase.removeChannel(joinsChannel);
    };
  }, []);

  // 2b. Track which courts the signed-in user has joined
  useEffect(() => {
    if (!user) return;

    const fetchMyJoins = async () => {
      const { data } = await supabase.from("court_joins").select("court_id").eq("user_id", user.id);
      setJoinedCourtIds(new Set((data ?? []).map((row) => row.court_id)));
    };
    fetchMyJoins();

    const channel = supabase
      .channel("realtime-map-my-joins")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "court_joins", filter: `user_id=eq.${user.id}` },
        fetchMyJoins
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const selectedCourt = useMemo(
    () => courts.find((c) => c.id === selectedCourtId) ?? null,
    [courts, selectedCourtId]
  );

  const filteredCourts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return courts.filter((court) => {
      if (typeFilter !== "all" && (court.court_type ?? "outdoor") !== typeFilter) return false;
      if (!query) return true;
      return (
        court.name.toLowerCase().includes(query) ||
        (court.address ?? "").toLowerCase().includes(query)
      );
    });
  }, [courts, searchQuery, typeFilter]);

  // 3. Render Markers
  useEffect(() => {
    if (!map.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    filteredCourts.forEach((court) => {
      const { longitude: lng, latitude: lat } = court;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

      const highlight = effectiveStatusTone(court) === "live" || selectedCourtId === court.id;
      const element = buildMarkerElement(court, highlight);

      const marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map.current!);

      element.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedCourtId(court.id);
        setCheckInMessage("");
        setAddressCopied(false);
        map.current?.flyTo({ center: [lng, lat], zoom: 14 });
      });

      markersRef.current.push(marker);
    });
  }, [filteredCourts, selectedCourtId]);

  // 4. Handle Check In (now takes the status chosen in the modal)
  const handleCheckIn = async (status: string) => {
    if (!selectedCourt) return;
    setCheckingIn(true);
    setCheckInMessage("");

    const result = await checkIn(selectedCourt.id, userLocation, status);

    setCheckingIn(false);
    setCheckInMessage(result.ok ? "Checked in successfully!" : result.message);
  };

  const handleToggleJoin = async () => {
    if (!selectedCourt) return;
    if (!user) {
      setCheckInMessage("Sign in to join pick-up.");
      return;
    }

    setJoining(true);
    const isJoined = joinedCourtIds.has(selectedCourt.id);
    const { error } = await toggleCourtJoin(selectedCourt.id, user.id, isJoined);
    setJoining(false);

    if (!error) {
      setJoinedCourtIds((current) => {
        const next = new Set(current);
        if (isJoined) next.delete(selectedCourt.id);
        else next.add(selectedCourt.id);
        return next;
      });
    }
  };

  const handleCopyAddress = async () => {
    if (!selectedCourt?.address) return;
    try {
      await navigator.clipboard.writeText(selectedCourt.address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      setCheckInMessage("Could not copy address.");
    }
  };

  const goToMyLocation = () => {
    if (userLocation) {
      map.current?.flyTo({ center: userLocation, zoom: 14 });
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(loc);
        map.current?.flyTo({ center: loc, zoom: 14 });
      },
      () => setCheckInMessage("Could not get your location.")
    );
  };

  const selectedIsJoined = selectedCourt ? joinedCourtIds.has(selectedCourt.id) : false;
  const selectedCapacity = selectedCourt?.capacity ?? null;
  const selectedJoinedCount = selectedCourt?.joined_count ?? 0;
  const selectedIsFull =
    !!selectedCourt && selectedCapacity !== null && selectedJoinedCount >= selectedCapacity && !selectedIsJoined;
  const distanceMiles =
    selectedCourt && userLocation
      ? haversineMiles(userLocation, [selectedCourt.longitude, selectedCourt.latitude])
      : null;

  return (
    // STRICT absolute positioning forces the container to exist
    <div className="absolute inset-0 w-full h-full bg-background overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0 map-dark-filter" />

      {/* Floating Search Bar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-container-margin z-40">
        <div className="bg-surface-container-high/90 backdrop-blur-xl border border-surface-variant rounded-full shadow-2xl flex items-center px-6 h-14">
          <Icon name="search" className="text-primary" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none focus:ring-0 w-full text-on-surface font-body placeholder:text-secondary-fixed-dim/50 ml-4 outline-none"
            placeholder="Search by name or address"
            type="text"
          />
        </div>
      </div>

      {/* Filter Chips */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex gap-2 z-40 overflow-x-auto max-w-full px-container-margin no-scrollbar">
        {(["all", "indoor", "outdoor"] as TypeFilter[]).map((option) => (
          <button
            key={option}
            onClick={() => setTypeFilter(option)}
            className={`px-4 py-1.5 rounded-full font-body text-label-sm whitespace-nowrap backdrop-blur-md border transition-colors capitalize ${
              typeFilter === option
                ? "bg-primary-container/10 border-primary text-primary"
                : "bg-surface-container-high/80 border-surface-variant text-secondary-fixed-dim hover:bg-surface-variant"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Zoom & GPS Controls */}
      <div className="absolute bottom-10 left-6 z-40 flex flex-col gap-2">
        <button
          onClick={() => map.current?.zoomIn()}
          aria-label="Zoom in"
          className="w-12 h-12 bg-surface-container-high border border-surface-variant rounded-xl flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors shadow-lg"
        >
          <Icon name="add" />
        </button>
        <button
          onClick={() => map.current?.zoomOut()}
          aria-label="Zoom out"
          className="w-12 h-12 bg-surface-container-high border border-surface-variant rounded-xl flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors shadow-lg"
        >
          <Icon name="remove" />
        </button>
        <button
          onClick={goToMyLocation}
          aria-label="Go to my location"
          className="w-12 h-12 bg-primary-container text-on-primary-container rounded-xl flex items-center justify-center hover:brightness-110 transition-colors shadow-lg mt-2"
        >
          <Icon name="my_location" />
        </button>
      </div>

      {/* Court Detail Panel */}
      {selectedCourt && (
        <div className="absolute bottom-0 right-0 w-full md:w-96 md:h-full bg-surface-container-low border-l border-surface-variant z-50 flex flex-col shadow-2xl">
          <div className="relative flex-shrink-0">
            <CourtMedia court={selectedCourt} className="h-56" />
            <button
              onClick={() => setSelectedCourtId(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-black/50 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-black/70 transition-colors z-10"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-stack-md">
            <div>
              <h2 className="font-headline text-headline-md text-on-surface">{selectedCourt.name}</h2>
              {selectedCourt.address && (
                <p className="font-body text-label-sm text-secondary mt-1">{selectedCourt.address}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-container-high p-3 rounded-xl border border-surface-variant">
                <p className="font-body text-label-sm text-secondary uppercase mb-1">Status</p>
                <p className={`font-body font-bold text-label-md ${isCourtFull(selectedCourt) ? "text-error" : "text-green-400"}`}>
                  {selectedCourt.status || "Unknown"}
                </p>
              </div>
              <div className="bg-surface-container-high p-3 rounded-xl border border-surface-variant">
                <p className="font-body text-label-sm text-secondary uppercase mb-1">Players</p>
                <p className="font-body font-bold text-label-md text-primary">
                  {selectedCapacity !== null
                    ? `${selectedJoinedCount}/${selectedCapacity}`
                    : selectedJoinedCount}
                </p>
              </div>
              <div className="bg-surface-container-high p-3 rounded-xl border border-surface-variant">
                <p className="font-body text-label-sm text-secondary uppercase mb-1">Distance</p>
                <p className="font-body font-bold text-label-md">
                  {distanceMiles !== null ? `${distanceMiles.toFixed(1)} mi` : "—"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleToggleJoin}
                disabled={joining || selectedIsFull}
                className={`w-full font-body py-3 rounded-lg font-black uppercase disabled:opacity-50 transition-all ${
                  selectedIsJoined
                    ? "bg-surface-variant text-on-surface hover:brightness-110"
                    : "bg-primary-container text-on-primary-container hover:brightness-110"
                }`}
              >
                {joining ? "..." : selectedIsFull ? "Full" : selectedIsJoined ? "Leave Pick-up" : "Join Pick-up"}
              </button>

              <button
                onClick={() => setShowCheckInModal(true)}
                disabled={checkingIn || isCourtFull(selectedCourt)}
                className="w-full bg-surface-container-high border border-surface-variant text-on-surface font-body py-3 rounded-lg font-black uppercase disabled:opacity-50 hover:bg-surface-variant transition-colors"
              >
                {checkingIn ? "Checking In..." : isCourtFull(selectedCourt) ? "Court is Full" : "Check In"}
              </button>
            </div>

            {checkInMessage && (
              <p className="text-center font-body text-label-md text-secondary">{checkInMessage}</p>
            )}
          </div>

          <div className="p-6 bg-surface-container-low border-t border-surface-variant flex-shrink-0">
            <div className="flex gap-4">
              <button
                onClick={handleCopyAddress}
                disabled={!selectedCourt.address}
                className="flex-1 bg-primary-container text-on-primary-container font-body py-4 rounded-lg uppercase font-black shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Icon name={addressCopied ? "check" : "content_copy"} />
                {addressCopied ? "Copied!" : "Copy Address"}
              </button>
              <button
                onClick={() => toggleFavourite(selectedCourt.id)}
                aria-label={favouriteIds.has(selectedCourt.id) ? "Remove from favourites" : "Add to favourites"}
                className={`w-14 h-14 rounded-lg border flex items-center justify-center transition-colors ${
                  favouriteIds.has(selectedCourt.id)
                    ? "border-primary bg-primary-container text-on-primary-container"
                    : "border-surface-variant text-primary hover:bg-surface-variant"
                }`}
              >
                <Icon name="favorite" filled={favouriteIds.has(selectedCourt.id)} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckInModal && selectedCourt && (
        <CheckInModal
          court={selectedCourt}
          onClose={() => setShowCheckInModal(false)}
          onConfirm={handleCheckIn}
        />
      )}
    </div>
  );
}
