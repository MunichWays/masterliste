import assert from "node:assert/strict";
import test from "node:test";
import {buildMunichGeoJson} from "../munich_geojson.mjs";

const line = (coordinates, properties = {}) => ({
    type: "Feature",
    geometry: {type: "LineString", coordinates},
    properties,
});

const boundaries = {
    type: "FeatureCollection",
    features: [{
        type: "Feature",
        properties: {name: "Test district"},
        geometry: {
            type: "Polygon",
            coordinates: [[
                [11.4, 48.0],
                [11.8, 48.0],
                [11.8, 48.3],
                [11.4, 48.3],
                [11.4, 48.0],
            ]],
        },
    }],
};

test("includes mapped LHM features independent of geometry", () => {
    const feature = line([[12.0, 49.0], [12.1, 49.1]], {
        munichways_id: "LHM-Ost.BA15.1",
    });
    const result = buildMunichGeoJson(
        {type: "FeatureCollection", features: [feature]},
        boundaries,
    );

    assert.deepEqual(result.features, [feature]);
});

test("includes a feature when any mapped id starts with LHM", () => {
    const feature = line([[12.0, 49.0], [12.1, 49.1]], {
        munichways_id: "LK-M.1, LHM-West.BA22.2",
    });
    const result = buildMunichGeoJson(
        {type: "FeatureCollection", features: [feature]},
        boundaries,
    );

    assert.deepEqual(result.features, [feature]);
});

test("excludes mapped non-LHM features even inside Munich", () => {
    const feature = line([[11.5, 48.1], [11.6, 48.2]], {
        munichways_id: "LK-M.1",
    });
    const result = buildMunichGeoJson(
        {type: "FeatureCollection", features: [feature]},
        boundaries,
    );

    assert.deepEqual(result.features, []);
});

test("uses the official boundary for pure OSM features", () => {
    const inside = line([[11.5, 48.1], [11.6, 48.2]], {osm_id: 1});
    const crossing = line([[11.3, 48.1], [11.5, 48.1]], {osm_id: 2});
    const outside = line([[12.0, 49.0], [12.1, 49.1]], {osm_id: 3});
    const result = buildMunichGeoJson(
        {type: "FeatureCollection", features: [inside, crossing, outside]},
        boundaries,
    );

    assert.deepEqual(result.features, [inside, crossing]);
});
