export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

// Uses OpenStreetMap's free Nominatim search, biased toward Sydney/Australia
// since that's this app's coverage area. No API key needed, but Nominatim's
// usage policy caps this at roughly 1 request/second. Fine for a small app,
// worth revisiting if this ever needs to handle real traffic.
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    format: "json",
    q: address,
    countrycodes: "au",
    viewbox: "150.5,-33.4,151.5,-34.2",
    bounded: "0",
    limit: "1",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Address lookup failed. Try again in a moment.");
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const first = results[0];
  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    displayName: first.display_name as string,
  };
}