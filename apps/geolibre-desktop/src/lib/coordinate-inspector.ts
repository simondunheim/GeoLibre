import { resolveEpsgProjection } from "@geolibre/map/epsg-proj4";
import type { Feature, Point } from "geojson";

type XY = [x: number, y: number];

export const INSPECTOR_SYSTEMS = [
  { code: 4326, name: "WGS84" },
  { code: 3857, name: "Web Mercator" },
  { code: 25832, name: "ETRS89 / UTM 32N" },
  { code: 25833, name: "ETRS89 / UTM 33N" },
  { code: 32632, name: "WGS84 / UTM 32N" },
  { code: 32633, name: "WGS84 / UTM 33N" },
] as const;

const ETRS_BOUNDS = {
  25832: { west: 6, east: 12.01, south: 36.53, north: 84.01 },
  25833: { west: 12, east: 18.01, south: 34.49, north: 84.01 },
} as const;

export type CoordinateResult =
  | { status: "ok"; xy: XY }
  | { status: "invalidPoint" | "outsideArea" | "transformFailed" };

export function isValidPosition(lng: number, lat: number): boolean {
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

/** MapLibre can unproject a click on a repeated world copy to a longitude beyond ±180°. */
export function wrapMapLongitude(lng: number): number {
  return Math.abs(lng) <= 180 ? lng : ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function automaticUtm(lng: number, lat: number) {
  if (!isValidPosition(lng, lat) || lat < -80 || lat > 84) return null;

  let zone = Math.min(60, Math.floor((lng + 180) / 6) + 1);
  if (lat >= 56 && lat < 64 && lng >= 3 && lng < 12) zone = 32;
  if (lat >= 72 && lng >= 0 && lng < 42) {
    zone = lng < 9 ? 31 : lng < 21 ? 33 : lng < 33 ? 35 : 37;
  }
  const hemisphere = lat < 0 ? "S" : "N";
  return { zone, hemisphere, code: (hemisphere === "N" ? 32600 : 32700) + zone };
}

function isInArea(lng: number, lat: number, code: number): boolean {
  if (code === 3857) return Math.abs(lat) <= 85.06;
  if (code === 25832 || code === 25833) {
    // EPSG CRS bounding boxes are a coarse check of the European area of use.
    const { west, east, south, north } = ETRS_BOUNDS[code];
    return lng >= west && lng <= east && lat >= south && lat <= north;
  }
  const north = code >= 32601 && code <= 32660;
  const south = code >= 32701 && code <= 32760;
  if (!north && !south) return false;
  if (north ? lat < 0 || lat > 84 : lat < -80 || lat > 0) return false;
  const zone = code % 100;
  const west = (zone - 1) * 6 - 180;
  // Accept the nominal zone and its conventional Norway/Svalbard extensions.
  return (lng >= west && lng <= west + 6) || automaticUtm(lng, lat)?.code === code;
}

export async function transformPosition(
  lng: number,
  lat: number,
  code: number,
): Promise<CoordinateResult> {
  if (!isValidPosition(lng, lat)) return { status: "invalidPoint" };
  if (code === 4326) return { status: "ok", xy: [lng, lat] };
  if (!isInArea(lng, lat, code)) return { status: "outsideArea" };

  try {
    const projection = await resolveEpsgProjection(code);
    if (projection) {
      // The registry uses GRS80 for ETRS89. This 2D approximation treats the
      // source angles as ETRS89 and carries no reference-frame epoch.
      const [x, y] = projection.proj4("EPSG:4326", projection.definition, [lng, lat]);
      if (Number.isFinite(x) && Number.isFinite(y)) return { status: "ok", xy: [x, y] };
    }
  } catch {
    // A failed projection must never produce a copyable coordinate.
  }
  return { status: "transformFailed" };
}

export function formatInspectorXY(xy: XY, code: number): [string, string] {
  const precision = code === 4326 ? 6 : 2;
  return [xy[0].toFixed(precision), xy[1].toFixed(precision)];
}

export function pointAsGeoJson(lng: number, lat: number): Feature<Point> | null {
  if (!isValidPosition(lng, lat)) return null;
  return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {} };
}
