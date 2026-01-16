const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates distance between two geographic points
 * @param {{ lat: number, lng: number }} point1
 * @param {{ lat: number, lng: number }} point2
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(point1, point2) {
  const latDelta = toRadians(point2.lat - point1.lat);
  const lngDelta = toRadians(point2.lng - point1.lng);

  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
