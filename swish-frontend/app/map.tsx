"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";
import { checkIn } from "./checkin";
import { isCourtFull, type Court } from "./courts";
import CheckInModal from "./CheckInModal";

export default function Map() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState("");
  const [showCheckInModal, setShowCheckInModal] = useState(false);

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
      const { data, error } = await supabase.from("courts").select("*");
      if (error) {
        console.error("Error fetching courts:", error);
        return;
      }
      if (data) setCourts(data as Court[]);
    };
    fetchCourts();

    const channel = supabase
      .channel("realtime-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "courts" }, () => {
        fetchCourts(); // Force a clean refetch to keep data perfectly in sync
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Render Markers
  useEffect(() => {
    if (!map.current) return;

    // Clear old markers before drawing new ones
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    courts.forEach((court) => {
      const coords = court.location?.coordinates;
      if (!coords || coords.length < 2) return;

      const [lng, lat] = coords;

      // Using native MapLibre markers for guaranteed rendering
      const marker = new maplibregl.Marker({ color: "#ff5f1f" })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      marker.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedCourt(court);
        setCheckInMessage("");
        map.current?.flyTo({ center: [lng, lat], zoom: 14 });
      });

      markersRef.current.push(marker);
    });
  }, [courts]);

  // 4. Handle Check In (now takes the status chosen in the modal)
  const handleCheckIn = async (status: string) => {
    if (!selectedCourt) return;
    setCheckingIn(true);
    setCheckInMessage("");

    const result = await checkIn(selectedCourt.id, userLocation, status);

    setCheckingIn(false);
    setCheckInMessage(result.ok ? "Checked in successfully!" : result.message);
  };

  return (
    // STRICT absolute positioning forces the container to exist
    <div className="absolute inset-0 w-full h-full bg-background overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0 map-dark-filter" />

      {/* Simplified Side Panel */}
      {selectedCourt && (
        <div className="absolute bottom-0 right-0 w-full md:w-96 md:h-full bg-surface-container border-l border-surface-variant z-10 flex flex-col shadow-2xl p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-headline text-headline-md text-on-surface">{selectedCourt.name}</h2>
              {selectedCourt.address && (
                <p className="font-body text-label-sm text-secondary mt-1">{selectedCourt.address}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedCourt(null)}
              className="w-10 h-10 flex items-center justify-center bg-surface-variant rounded-full hover:brightness-110"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="mb-6 p-4 bg-surface-container-high rounded-xl border border-surface-variant">
            <p className="font-body text-label-sm text-secondary uppercase mb-1">Current Status</p>
            <p className={`font-bold text-headline-md ${isCourtFull(selectedCourt) ? "text-error" : "text-green-400"}`}>
              {selectedCourt.status || "Unknown"}
            </p>
          </div>

          <button
            onClick={() => setShowCheckInModal(true)}
            disabled={checkingIn || isCourtFull(selectedCourt)}
            className="w-full bg-primary-container text-on-primary-container font-body py-4 rounded-lg font-black uppercase disabled:opacity-50 hover:brightness-110"
          >
            {checkingIn ? "Checking In..." : isCourtFull(selectedCourt) ? "Court is Full" : "Check In"}
          </button>

          {checkInMessage && (
            <p className="mt-4 text-center font-body text-label-md text-secondary">
              {checkInMessage}
            </p>
          )}
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