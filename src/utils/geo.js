/**
 * src/utils/geo.js
 * Geographic utility functions.
 */

const EARTH_R_KM = 6371.0088;

/**
 * Haversine great-circle distance in kilometres.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a));
}

/**
 * Travel time in minutes given distance and speed (km/h).
 * @param {number} km
 * @param {number} speedKmh
 * @returns {number}
 */
export function travelMinutes(km, speedKmh) {
  if (speedKmh <= 0) return Infinity;
  return (km / speedKmh) * 60;
}

/**
 * Compute centroid of a list of {lat, lng} points.
 * Returns null when the list is empty.
 * @param {{ lat: number, lng: number }[]} points
 * @returns {{ lat: number, lng: number }|null}
 */
export function centroid(points) {
  if (!points || points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}

/**
 * 2-D dot product of vectors defined by three points.
 * v1 = B - A,  v2 = C - B.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @param {{ lat: number, lng: number }} c
 * @returns {number} cosine of angle in [-1, 1]
 */
export function cosineSimilarity(a, b, c) {
  const v1 = { x: b.lng - a.lng, y: b.lat - a.lat };
  const v2 = { x: c.lng - b.lng, y: c.lat - b.lat };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return 1; // degenerate -> same direction
  return dot / (mag1 * mag2);
}
