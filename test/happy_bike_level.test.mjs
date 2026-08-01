import assert from "node:assert/strict";
import test from "node:test";
import {
    buildHappyBikeLevelGeoJson,
    hasRadlVorrangRoute,
} from "../happy_bike_level.mjs";

const line = {
    type: "LineString",
    coordinates: [[11.5, 48.1], [11.6, 48.2]],
};

test("creates minimal features and preserves geometry", () => {
    const result = buildHappyBikeLevelGeoJson({
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: line,
            properties: {
                osm_id: 123,
                munichways_id: "MW.1",
                color: "green",
                munichways_mw_rv_route: "Standard",
                ignored_detail: "large text",
            },
        }],
    });

    assert.deepEqual(result, {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: line,
            properties: {
                munichways_id: "MW.1",
                osm_id: "123",
                color: "green",
                munichways_mw_rv_route: "Standard",
            },
        }],
    });
});

test("excludes blue and unsupported colors", () => {
    const result = buildHappyBikeLevelGeoJson({
        type: "FeatureCollection",
        features: ["blue", "grey", "red"].map(color => ({
            type: "Feature",
            geometry: line,
            properties: {color},
        })),
    });

    assert.equal(result.features.length, 1);
    assert.equal(result.features[0].properties.color, "red");
});

test("uses null for missing ids and route property", () => {
    const result = buildHappyBikeLevelGeoJson({
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: line,
            properties: {color: "yellow", munichways_id: " "},
        }],
    });

    assert.equal(result.features[0].properties.munichways_id, null);
    assert.equal(result.features[0].properties.osm_id, null);
    assert.equal(result.features[0].properties.munichways_mw_rv_route, null);
});

test("preserves the V20 RadlVorrang value unchanged", () => {
    const sourceValue = "-, Premium, Standard";
    const result = buildHappyBikeLevelGeoJson({
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: line,
            properties: {
                color: "black",
                munichways_mw_rv_route: sourceValue,
            },
        }],
    });

    assert.equal(
        result.features[0].properties.munichways_mw_rv_route,
        sourceValue,
    );
});

test("recognizes RadlVorrang routes including mixed V20 values", () => {
    assert.equal(hasRadlVorrangRoute("Standard"), true);
    assert.equal(hasRadlVorrangRoute("-, Premium, Standard"), true);
    assert.equal(hasRadlVorrangRoute("-"), false);
    assert.equal(hasRadlVorrangRoute("  "), false);
    assert.equal(hasRadlVorrangRoute(null), false);
});

test("can create a compact RadlVorrang-only export", () => {
    const features = [
        ["RV", "Standard"],
        ["mixed", "-, Premium"],
        ["not-rv", "-"],
        ["missing", null],
    ].map(([id, route]) => ({
        type: "Feature",
        geometry: line,
        properties: {
            munichways_id: id,
            color: "green",
            munichways_mw_rv_route: route,
        },
    }));

    const result = buildHappyBikeLevelGeoJson(
        {type: "FeatureCollection", features},
        {radlVorrangOnly: true},
    );

    assert.deepEqual(
        result.features.map(feature => feature.properties.munichways_id),
        ["RV", "mixed"],
    );
});
