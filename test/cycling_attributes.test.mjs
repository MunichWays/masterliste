import assert from "node:assert/strict";
import test from "node:test";
import {cyclingAttributeValue, displayOsmTags, mapCyclingAttributes} from "../cycling_attributes.mjs";
import {buildHappyBikeLevelGeoJson} from "../happy_bike_level.mjs";

for (const key of ["surface", "smoothness", "width"]) {
    test(`${key}: existing cycling override, general fallback and missing value`, () => {
        assert.equal(cyclingAttributeValue({[key]: "general"}, key), "general");
        assert.equal(cyclingAttributeValue({[key]: "general", [`cycleway:${key}`]: "cycling"}, key), "cycling");
        assert.equal(cyclingAttributeValue({}, key), undefined);
    });

    test(`${key}: differing sides remain in the existing scalar field`, () => {
        const tags = {[`cycleway:left:${key}`]: "left", [`cycleway:right:${key}`]: "right"};
        assert.equal(cyclingAttributeValue(tags, key), "links: left; rechts: right");
        assert.equal(mapCyclingAttributes(tags)[`osm_${key}`], "links: left; rechts: right");
        assert.equal(displayOsmTags(tags)[key], "links: left; rechts: right");
        assert.equal(cyclingAttributeValue({[`cycleway:right:${key}`]: "same", [`cycleway:left:${key}`]: "same"}, key), "same");
        assert.equal(cyclingAttributeValue({[`cycleway:right:${key}`]: "right"}, key), "rechts: right");
    });

    test(`${key}: canonical side keys override aliases, both and unsided cycling values`, () => {
        const tags = {
            [key]: "general", [`cycleway:${key}`]: "cycling",
            [`cycleway:${key}:both`]: "alias-both", [`cycleway:both:${key}`]: "both",
            [`cycleway:${key}:left`]: "alias-left", [`cycleway:left:${key}`]: "left",
        };
        assert.equal(cyclingAttributeValue(tags, key), "links: left; rechts: both");
        delete tags[`cycleway:left:${key}`];
        assert.equal(cyclingAttributeValue(tags, key), "links: alias-left; rechts: both");
        delete tags[`cycleway:both:${key}`];
        assert.equal(cyclingAttributeValue(tags, key), "links: alias-left; rechts: alias-both");
    });

    test(`${key}: empty tags fall through, unknown values retain precedence`, () => {
        assert.equal(cyclingAttributeValue({[key]: "general", [`cycleway:${key}`]: ""}, key), "general");
        assert.equal(cyclingAttributeValue({[`cycleway:both:${key}`]: "", [`cycleway:${key}:both`]: "unknown"}, key), "unknown");
        assert.equal(cyclingAttributeValue({[`cycleway:left:${key}`]: "", [`cycleway:${key}:left`]: "unknown"}, key), "links: unknown");
    });

    test(`${key}: physical sided tags are displayed without inventing travel directions`, () => {
        const tags = {[`${key}:left`]: "left", [`${key}:right`]: "right", oneway: "-1"};
        assert.equal(cyclingAttributeValue(tags, key), "links: left; rechts: right");
        tags[`cycleway:${key}`] = "cycling";
        assert.equal(cyclingAttributeValue(tags, key), "cycling");
    });
}

test("Gerner Straße: asphalt cycleway on right, sett carriageway on left", () => {
    const tags = {surface: "sett", smoothness: "bad", "cycleway:right": "track", "cycleway:left": "no", "cycleway:right:surface": "asphalt"};
    assert.deepEqual(mapCyclingAttributes(tags), {osm_smoothness: "bad", osm_surface: "links: sett; rechts: asphalt", osm_width: undefined});
    tags["cycleway:left:surface"] = "gravel";
    assert.equal(cyclingAttributeValue(tags, "surface"), "links: sett; rechts: asphalt");
    tags["cycleway:right"] = "separate";
    assert.equal(cyclingAttributeValue(tags, "surface"), "sett");
});

test("width: retain legacy fallback, never fill the other cycleway from overall road width", () => {
    assert.equal(cyclingAttributeValue({width: "5.5"}, "width"), "5.5");
    assert.equal(cyclingAttributeValue({width: "5.5", "cycleway:right:width": "1.85"}, "width"), "rechts: 1.85");
    assert.equal(cyclingAttributeValue({"cycleway:both:width": "1.85"}, "width"), "1.85");
    assert.equal(cyclingAttributeValue({width: "5.5", "cycleway:left": "no", "cycleway:left:width": "2.0"}, "width"), "5.5");
});

test("attributes fall back independently and contain no extra export fields", () => {
    assert.deepEqual(mapCyclingAttributes({surface: "sett", smoothness: "bad", width: "5.5", "cycleway:surface": "asphalt", "cycleway:right:smoothness": "excellent"}), {
        osm_smoothness: "links: bad; rechts: excellent", osm_surface: "asphalt", osm_width: "5.5",
    });
    assert.deepEqual(Object.keys(mapCyclingAttributes({})).sort(), ["osm_smoothness", "osm_surface", "osm_width"]);
});

test("display uses existing rows, removes duplicate attribute subtags and preserves original mapping tags", () => {
    const tags = Object.freeze({name: "Test", highway: "path", "cycleway:right": "track", surface: "sett", "cycleway:right:surface": "asphalt", "cycleway:smoothness": "excellent", "cycleway:width:both": "1.85"});
    const display = displayOsmTags(tags);
    assert.deepEqual(display, {name: "Test", highway: "path", "cycleway:right": "track", surface: "links: sett; rechts: asphalt", smoothness: "excellent", width: "1.85"});
    assert.equal(tags.surface, "sett");
    assert.equal(tags["cycleway:right:surface"], "asphalt");
    assert.equal(tags.smoothness, undefined);
    assert.equal(displayOsmTags({}).surface, undefined);
});


test("sided attributes do not change compact Happy-Bike-Level fields or geometry", () => {
    const feature = {
        type: "Feature", geometry: {type: "LineString", coordinates: [[11.52, 48.16], [11.53, 48.17]]},
        properties: {munichways_id: "LHM-Test", osm_id: "4075460", color: "red", munichways_mw_rv_route: "RV1"},
    };
    const source = {type: "FeatureCollection", features: [feature]};
    const enriched = {
        type: "FeatureCollection", features: [{...feature, properties: {
            ...feature.properties, ...mapCyclingAttributes({"cycleway:left:surface": "sett", "cycleway:right:surface": "asphalt"}),
        }}],
    };
    assert.deepEqual(buildHappyBikeLevelGeoJson(enriched), buildHappyBikeLevelGeoJson(source));
});
