const emptyToNull = (value) => {
    if (value == null) {
        return null;
    }
    const normalized = String(value).trim();
    return normalized === "" ? null : normalized;
};

export const buildHappyBikeLevelGeoJson = (sourceGeoJson) => {
    if (sourceGeoJson?.type !== "FeatureCollection" || !Array.isArray(sourceGeoJson.features)) {
        throw new TypeError("Expected a GeoJSON FeatureCollection.");
    }

    return {
        type: "FeatureCollection",
        features: sourceGeoJson.features
            .filter(feature => feature?.geometry != null)
            .filter(feature => feature.properties?.color !== "blue")
            .map(feature => ({
                type: "Feature",
                geometry: feature.geometry,
                properties: {
                    munichways_id: emptyToNull(feature.properties?.munichways_id),
                    osm_id: emptyToNull(feature.properties?.osm_id),
                    color: feature.properties?.color,
                    munichways_mw_rv_route:
                        feature.properties?.munichways_mw_rv_route ?? null,
                },
            }))
            .filter(feature =>
                ["green", "yellow", "red", "black"].includes(feature.properties.color),
            ),
    };
};
