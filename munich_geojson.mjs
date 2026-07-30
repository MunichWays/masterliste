import {bbox, booleanIntersects} from "@turf/turf";

const hasLhmId = (value) =>
    String(value ?? "")
        .split(",")
        .map(id => id.trim())
        .some(id => id.startsWith("LHM"));

const hasMunichwaysId = (value) =>
    String(value ?? "")
        .split(",")
        .some(id => id.trim() !== "");

const bboxesIntersect = (a, b) =>
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

export const buildMunichGeoJson = (sourceGeoJson, districtBoundaries) => {
    if (sourceGeoJson?.type !== "FeatureCollection" || !Array.isArray(sourceGeoJson.features)) {
        throw new TypeError("Expected source GeoJSON to be a FeatureCollection.");
    }
    if (districtBoundaries?.type !== "FeatureCollection" ||
        !Array.isArray(districtBoundaries.features) ||
        districtBoundaries.features.length === 0) {
        throw new TypeError("Expected Munich district boundaries to be a non-empty FeatureCollection.");
    }

    const munichBbox = bbox(districtBoundaries);
    const features = sourceGeoJson.features.filter(feature => {
        const munichwaysId = feature?.properties?.munichways_id;

        // Masterliste entries are assigned to Munich by their established ID.
        if (hasMunichwaysId(munichwaysId)) {
            return hasLhmId(munichwaysId);
        }

        // Pure OSM entries are assigned spatially using the official city
        // district polygons. The bbox check avoids expensive polygon tests for
        // the vast majority of ways elsewhere in Upper Bavaria.
        if (feature?.geometry == null || !bboxesIntersect(bbox(feature), munichBbox)) {
            return false;
        }
        return districtBoundaries.features.some(boundary =>
            booleanIntersects(feature, boundary),
        );
    });

    return {
        type: "FeatureCollection",
        features,
    };
};
