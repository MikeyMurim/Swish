export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

async function searchNominatim(address: string, limit: number): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    format: "json",
    q: address,
    countrycodes: "au",
    viewbox: "150.5,-33.4,151.5,-34.2",
    bounded: "0",
    limit: String(limit),
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Address lookup failed. Try again in a moment.");
  }

  const results = (await response.json()) as NominatimResult[];
  return results.map((result) => ({
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
  }));
}

// Uses OpenStreetMap's free Nominatim search, biased toward Sydney/Australia
// since that's this app's coverage area. No API key needed, but Nominatim's
// usage policy caps this at roughly 1 request/second. Fine for a small app,
// worth revisiting if this ever needs to handle real traffic.
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const results = await searchNominatim(address, 1);
  return results[0] ?? null;
}

export async function searchAddresses(address: string): Promise<GeocodeResult[]> {
  return searchNominatim(address, 5);
}
