// Straight-line distance in miles, used to show "Distance" on a court card
// when the browser will share the user's location. Not driving distance.
export function haversineMiles(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function directionsUrl([lng, lat]: [number, number]): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
