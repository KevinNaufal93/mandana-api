/** Public responses show a circle of this radius (metres) around the fuzzed point. */
export const APPROX_RADIUS_M = 300;

/**
 * Coordinates are never displaced further than this. Keeping it comfortably
 * under APPROX_RADIUS_M guarantees the true location always falls inside the
 * circle a client renders around the fuzzed point — the map stays honest.
 */
const MAX_DISPLACEMENT_M = 250;

/** Metres per degree of latitude — near-constant everywhere on Earth. */
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * 32-bit FNV-1a hash. Only needs to be well-distributed and deterministic,
 * not cryptographically secure — this just seeds a displacement, not a secret.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Displaces (latitude, longitude) by a pseudo-random offset under
 * MAX_DISPLACEMENT_M, deterministically seeded by `seed` (normally the
 * property id) — the same property always fuzzes to the same point, so the
 * rendered circle never appears to jump between requests or devices.
 */
export function fuzzCoordinates(
  latitude: number,
  longitude: number,
  seed: string,
): { latitude: number; longitude: number } {
  const hash = fnv1a(seed);
  const bearing = ((hash & 0xffff) / 0x10000) * 2 * Math.PI;
  const distanceM = ((hash >>> 16) / 0x10000) * MAX_DISPLACEMENT_M;

  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);

  const deltaLat = (distanceM * Math.cos(bearing)) / METERS_PER_DEGREE_LAT;
  const deltaLng =
    metersPerDegreeLng === 0
      ? 0 // at the poles a longitude delta is meaningless — skip it
      : (distanceM * Math.sin(bearing)) / metersPerDegreeLng;

  return {
    latitude: round6(latitude + deltaLat),
    longitude: round6(longitude + deltaLng),
  };
}
