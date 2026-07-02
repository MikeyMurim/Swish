
export type Court = {
  id: number;
  name: string;
  status: string | null;
  updated_at?: string | null;

  location: {
    coordinates: [number, number]; // [lng, lat]
  } | null;
};

export function statusTone(status: string | null): "full" | "live" | "empty" | "neutral" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("full")) return "full";
  if (s.includes("live")) return "live";
  if (s.includes("empty")) return "empty";
  return "neutral";
}

export function isCourtFull(court: Court): boolean {
  return statusTone(court.status) === "full";
}
