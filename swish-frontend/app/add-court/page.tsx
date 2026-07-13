"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import { geocodeAddress } from "../../lib/geocode";
import { SideNav, BottomNav } from "../NavShell";
import Icon from "../Icon";

export default function AddCourtPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Initialise the preview map once the person is signed in and the
  // container has actually rendered. Depends on `user` rather than running
  // once on mount, since the very first render (while auth is still
  // loading) shows a loading screen with no map container in the DOM yet.
  useEffect(() => {
    if (!user || !mapContainer.current || map.current) return;

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
      zoom: 10,
    });
  }, [user]);

  const placeMarker = (lngVal: number, latVal: number) => {
    if (!map.current) return;

    if (marker.current) {
      marker.current.setLngLat([lngVal, latVal]);
      return;
    }

    marker.current = new maplibregl.Marker({ color: "#ff5f1f", draggable: true })
      .setLngLat([lngVal, latVal])
      .addTo(map.current);

    marker.current.on("dragend", () => {
      const pos = marker.current!.getLngLat();
      setLat(pos.lat);
      setLng(pos.lng);
      setNotice("Pin moved. That's where the court will be saved.");
    });
  };

  const handleSearch = async () => {
    setError("");
    setNotice("");

    if (!address.trim()) {
      setError("Enter an address first.");
      return;
    }

    setGeocoding(true);
    try {
      const result = await geocodeAddress(address.trim());
      setGeocoding(false);

      if (!result) {
        setError("Could not find that address. Try adding the suburb or postcode.");
        return;
      }

      setLat(result.lat);
      setLng(result.lng);
      setNotice(`Found: ${result.displayName}. Drag the pin if it's not quite right.`);
      placeMarker(result.lng, result.lat);
      map.current?.flyTo({ center: [result.lng, result.lat], zoom: 16 });
    } catch (err) {
      setGeocoding(false);
      setError(err instanceof Error ? err.message : "Address lookup failed.");
    }
  };

  const useMyLocation = () => {
    setError("");
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        setNotice("Using your current location. Drag the pin to fine-tune it.");
        placeMarker(longitude, latitude);
        map.current?.flyTo({ center: [longitude, latitude], zoom: 16 });
      },
      () => setError("Could not get your location. Search for an address instead.")
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Give the court a name.");
      return;
    }
    if (lat === null || lng === null) {
      setError("Search for an address or use your location first, so the pin has somewhere to sit.");
      return;
    }

    setSubmitting(true);

    // Supabase / PostGIS accepts a WKT string for a geography(Point) column,
    // so no RPC function is needed for a plain insert like this.
    const { error: insertError } = await supabase.from("courts").insert({
      name: name.trim(),
      address: address.trim() || null,
      location: `POINT(${lng} ${lat})`,
      status: "Empty",
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-secondary font-body">Loading...</div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-background px-4 text-center">
        <div>
          <p className="font-body text-body-lg mb-4">Sign in to add a court.</p>
          <a href="/login" className="font-body text-label-md text-primary uppercase font-bold">
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <SideNav />
      <main className="flex-1 md:ml-64 pb-24 md:pb-8 px-container-margin md:px-8 py-8">
        <div className="max-w-md mx-auto">
          <h2 className="font-headline text-headline-md uppercase tracking-tight mb-6">Add a Court</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">Court name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
              />
            </div>

            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">Address</label>
              <div className="flex gap-2">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 1 Cook Rd, Centennial Park NSW"
                  className="flex-1 bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={geocoding}
                  className="px-4 rounded-lg bg-surface-container-high border border-surface-variant text-on-surface font-body text-label-sm uppercase font-bold hover:border-primary-container disabled:opacity-60 flex items-center gap-1"
                >
                  {geocoding ? <Icon name="sync" className="animate-spin" /> : <Icon name="search" />}
                  Find
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={useMyLocation}
              className="font-body text-label-sm text-secondary hover:text-primary flex items-center gap-1 self-start"
            >
              <Icon name="my_location" className="text-sm!" />
              Or use my current location
            </button>

            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">
                Confirm the pin
              </label>
              <div
                ref={mapContainer}
                className="w-full h-64 rounded-xl overflow-hidden border border-surface-variant map-dark-filter"
              />
              <p className="font-body text-label-sm text-secondary mt-1">
                Drag the pin to fine-tune it once it appears.
              </p>
            </div>

            {error && <p className="font-body text-label-sm text-error">{error}</p>}
            {notice && !error && <p className="font-body text-label-sm text-primary">{notice}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 font-body text-label-md py-3 rounded-lg uppercase font-black bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-60 transition-all flex justify-center items-center gap-2"
            >
              {submitting ? <Icon name="sync" className="animate-spin" /> : "Add Court"}
            </button>
          </form>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}