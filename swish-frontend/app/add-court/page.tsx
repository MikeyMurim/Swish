"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/useAuth";
import { geocodeAddress, searchAddresses, type GeocodeResult } from "../../lib/geocode";
import { SideNav, BottomNav } from "../NavShell";
import AuthGateModal from "../AuthGateModal";
import Icon from "../Icon";

export default function AddCourtPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);

  const [name, setName] = useState("");
  const [courtType, setCourtType] = useState<"indoor" | "outdoor">("outdoor");
  const [capacity, setCapacity] = useState("");
  const [isFree, setIsFree] = useState(true);
  const [priceAmount, setPriceAmount] = useState("");
  const [hasWater, setHasWater] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodeResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
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

  useEffect(() => {
    const query = address.trim();
    if (query.length < 3) {
      return;
    }

    // Nominatim's public endpoint permits roughly one request a second.
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        setAddressSuggestions(await searchAddresses(query));
      } catch {
        setAddressSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [address]);

  // Release the local preview URL when it's replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const handleImageSelect = (file: File | null) => {
    setImageFile(file);
    setImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  };

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

  const selectAddress = (result: GeocodeResult) => {
    setAddress(result.displayName);
    setAddressSuggestions([]);
    setLat(result.lat);
    setLng(result.lng);
    setNotice(`Found: ${result.displayName}. Drag the pin if it's not quite right.`);
    placeMarker(result.lng, result.lat);
    map.current?.flyTo({ center: [result.lng, result.lat], zoom: 16 });
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

    if (!user) return;

    if (!name.trim()) {
      setError("Give the court a name.");
      return;
    }
    if (lat === null || lng === null) {
      setError("Search for an address or use your location first, so the pin has somewhere to sit.");
      return;
    }

    setSubmitting(true);

    let uploadedImageUrl: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("court-images")
        .upload(path, imageFile);

      if (uploadError) {
        setSubmitting(false);
        setError(`Image upload failed: ${uploadError.message}`);
        return;
      }

      uploadedImageUrl = supabase.storage.from("court-images").getPublicUrl(path).data.publicUrl;
    }

    // The deployed courts table stores a GeoJSON point in its JSONB location
    // column. Keeping this shape is what lets the map read the new pin.
    const { error: insertError } = await supabase.from("courts").insert({
      name: name.trim(),
      address: address.trim() || null,
      location: { type: "Point", coordinates: [lng, lat] },
      status: "Empty",
      court_type: courtType,
      capacity: capacity.trim() ? Number(capacity) : null,
      image_url: uploadedImageUrl,
      is_free: isFree,
      price_amount: !isFree && priceAmount.trim() ? Number(priceAmount) : null,
      has_water: hasWater,
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
      <div className="flex min-h-screen bg-background text-on-background">
        <SideNav />
        <main className="flex-1 md:ml-64 pb-24 md:pb-8 px-container-margin md:px-8 py-8">
          <div className="max-w-md mx-auto flex flex-col gap-4 blur-sm opacity-40 pointer-events-none select-none" aria-hidden="true">
            <div className="h-8 w-40 bg-surface-container-high rounded" />
            <div className="h-12 w-full bg-surface-container-high rounded-lg" />
            <div className="h-12 w-full bg-surface-container-high rounded-lg" />
            <div className="h-64 w-full bg-surface-container-high rounded-xl" />
          </div>
          <AuthGateModal
            title="Log In to Add a Court"
            description="You need an account to add new courts to the map."
          />
        </main>
        <BottomNav />
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

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="font-body text-label-sm text-secondary uppercase block mb-1">Court type</label>
                <select
                  value={courtType}
                  onChange={(e) => setCourtType(e.target.value as "indoor" | "outdoor")}
                  className="w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
                >
                  <option value="outdoor">Outdoor</option>
                  <option value="indoor">Indoor</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="font-body text-label-sm text-secondary uppercase block mb-1">Capacity (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
                />
              </div>
            </div>

            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">Pricing</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsFree(true)}
                  className={`flex-1 rounded-lg px-4 py-3 font-body text-label-sm uppercase font-bold border transition-colors ${
                    isFree
                      ? "bg-primary-container text-on-primary-container border-primary"
                      : "bg-surface-container-high text-on-surface border-surface-variant hover:border-primary-container"
                  }`}
                >
                  Free
                </button>
                <button
                  type="button"
                  onClick={() => setIsFree(false)}
                  className={`flex-1 rounded-lg px-4 py-3 font-body text-label-sm uppercase font-bold border transition-colors ${
                    !isFree
                      ? "bg-primary-container text-on-primary-container border-primary"
                      : "bg-surface-container-high text-on-surface border-surface-variant hover:border-primary-container"
                  }`}
                >
                  Paid
                </button>
              </div>
              {!isFree && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  placeholder="e.g. 10.00"
                  className="w-full mt-2 bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body outline-none focus:border-primary-container"
                />
              )}
            </div>

            <label className="flex items-center gap-3 bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasWater}
                onChange={(e) => setHasWater(e.target.checked)}
                className="w-5 h-5 accent-primary-container"
              />
              <span className="font-body text-label-md text-on-surface">Water available on site</span>
            </label>

            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">Court photo (optional)</label>
              <div className="flex items-center gap-4">
                {imagePreviewUrl && (
                  <img
                    src={imagePreviewUrl}
                    alt="Court preview"
                    className="w-16 h-16 rounded-lg object-cover border border-surface-variant shrink-0"
                  />
                )}
                <div className="flex-1 flex gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 bg-surface-container-high border border-surface-variant rounded-lg px-4 py-3 text-on-surface font-body text-label-sm uppercase font-bold cursor-pointer hover:border-primary-container transition-colors">
                    <Icon name="upload" className="text-lg!" />
                    {imageFile ? "Change photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                  {imageFile && (
                    <button
                      type="button"
                      onClick={() => handleImageSelect(null)}
                      aria-label="Remove photo"
                      className="w-12 rounded-lg border border-surface-variant text-secondary hover:text-primary hover:border-primary-container transition-colors flex items-center justify-center"
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="font-body text-label-sm text-secondary uppercase block mb-1">Address</label>
              <div className="relative flex gap-2">
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setAddressSuggestions([]);
                    setSuggestionsLoading(false);
                    setError("");
                  }}
                  placeholder="e.g. 1 Cook Rd, Centennial Park NSW"
                  autoComplete="off"
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
                {(suggestionsLoading || addressSuggestions.length > 0) && (
                  <div className="absolute z-20 top-full left-0 right-16 mt-1 overflow-hidden rounded-lg border border-surface-variant bg-surface-container-high shadow-xl">
                    {suggestionsLoading ? (
                      <p className="px-4 py-3 font-body text-label-sm text-secondary">Finding addresses...</p>
                    ) : (
                      addressSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.lng}-${suggestion.lat}`}
                          type="button"
                          onClick={() => selectAddress(suggestion)}
                          className="w-full px-4 py-3 text-left font-body text-label-sm text-on-surface hover:bg-surface-variant transition-colors border-b border-surface-variant/40 last:border-b-0"
                        >
                          {suggestion.displayName}
                        </button>
                      ))
                    )}
                  </div>
                )}
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
