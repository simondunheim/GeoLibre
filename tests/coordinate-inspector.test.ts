import assert from "node:assert/strict";
import { test } from "node:test";
import {
  automaticUtm,
  formatInspectorXY,
  pointAsGeoJson,
  transformPosition,
  wrapMapLongitude,
} from "../apps/geolibre-desktop/src/lib/coordinate-inspector";

const berlin = [13.405, 52.52] as const;

// Reference values from GDAL/PROJ (gdaltransform -s_srs EPSG:4326
// -t_srs EPSG:<code> -output_xy). The ETRS89 reference uses the 2D
// approximation, so the tolerance there reflects datum accuracy.
const references = [
  { code: 3857, expected: [1492237.774083832, 6894699.8012824245], tolerance: 0.001 },
  { code: 32633, expected: [391779.25925275, 5820072.1592110265], tolerance: 0.01 },
  { code: 25833, expected: [391779.2592516289, 5820072.159087079], tolerance: 1 },
];

for (const { code, expected, tolerance } of references) {
  test(`transforms Berlin to EPSG:${code} in easting/northing order`, async () => {
    const result = await transformPosition(...berlin, code);
    assert.equal(result.status, "ok");
    assert.ok(result.xy.every((value, index) => Math.abs(value - expected[index]) < tolerance));
  });
}

test("selects the UTM zone and hemisphere from longitude and latitude", async () => {
  assert.deepEqual(automaticUtm(...berlin), { zone: 33, hemisphere: "N", code: 32633 });
  assert.equal(automaticUtm(11.9999, 0)?.code, 32632);
  assert.equal(automaticUtm(12, 0)?.code, 32633);
  assert.equal(automaticUtm(-180, 0)?.code, 32601);
  assert.equal(automaticUtm(180, 0)?.code, 32660);
  assert.equal(automaticUtm(151.2093, -33.8688)?.code, 32756);

  const result = await transformPosition(151.2093, -33.8688, 32756);
  assert.equal(result.status, "ok");
  assert.ok(Math.abs(result.xy[0] - 334368.633648097) < 0.01);
  assert.ok(Math.abs(result.xy[1] - 6250948.345385009) < 0.01);
});

test("selects the Norway and Svalbard UTM exceptions", async () => {
  assert.equal(automaticUtm(3, 55.9999)?.code, 32631);
  assert.equal(automaticUtm(3, 56)?.code, 32632);
  assert.equal(automaticUtm(3, 64)?.code, 32631);
  assert.equal((await transformPosition(3, 56, 32632)).status, "ok");

  for (const [lng, zone] of [
    [0, 31],
    [9, 33],
    [21, 35],
    [33, 37],
    [42, 38],
  ]) {
    assert.equal(automaticUtm(lng, 72)?.zone, zone);
    assert.equal((await transformPosition(lng, 72, 32600 + zone)).status, "ok");
  }
});

test("checks geographic areas and projection limits", async () => {
  assert.equal(automaticUtm(0, -80)?.code, 32731);
  assert.equal(automaticUtm(0, -80.0001), null);
  assert.equal(automaticUtm(0, 84)?.code, 32631);
  assert.equal(automaticUtm(0, 84.0001), null);
  assert.equal((await transformPosition(0, 85.06, 3857)).status, "ok");
  assert.equal((await transformPosition(0, -85.061, 3857)).status, "outsideArea");
  assert.equal((await transformPosition(0, 90, 3857)).status, "outsideArea");
  assert.equal((await transformPosition(...berlin, 32632)).status, "outsideArea");
  assert.equal((await transformPosition(...berlin, 25832)).status, "outsideArea");
  assert.equal((await transformPosition(9, 36.53, 25832)).status, "ok");
  assert.equal((await transformPosition(9, 36.529, 25832)).status, "outsideArea");
  assert.equal((await transformPosition(15, 34.48, 25833)).status, "outsideArea");
  assert.equal((await transformPosition(15, -1, 32633)).status, "outsideArea");
});

test("rejects non-finite and out-of-range geographic positions", async () => {
  for (const [lng, lat] of [
    [NaN, 0],
    [0, Infinity],
    [181, 0],
    [0, -91],
  ]) {
    assert.equal(automaticUtm(lng, lat), null);
    assert.equal(pointAsGeoJson(lng, lat), null);
    assert.equal((await transformPosition(lng, lat, 3857)).status, "invalidPoint");
  }
});

test("preserves longitude/latitude order in the inspector and GeoJSON", async () => {
  const result = await transformPosition(...berlin, 4326);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.xy, [...berlin]);
  assert.deepEqual(formatInspectorXY(result.xy, 4326), ["13.405000", "52.520000"]);
  assert.deepEqual(formatInspectorXY([1.234, -2.346], 3857), ["1.23", "-2.35"]);
  assert.deepEqual(pointAsGeoJson(...berlin), {
    type: "Feature",
    geometry: { type: "Point", coordinates: [13.405, 52.52] },
    properties: {},
  });
});

test("normalizes map world copies and preserves exact antimeridian positions", () => {
  assert.equal(wrapMapLongitude(373.5), 13.5);
  assert.equal(wrapMapLongitude(-346.5), 13.5);
  assert.equal(wrapMapLongitude(-180), -180);
  assert.equal(wrapMapLongitude(180), 180);
  assert.ok(Number.isNaN(wrapMapLongitude(Infinity)));
});
