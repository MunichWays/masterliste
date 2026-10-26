// Physical way sides, not travel directions: the Masterliste has one value per
// existing field and must retain differing left/right attributes in that value.
const attributes = ["smoothness", "surface", "width"];
const excluded = new Set(["no", "separate"]);
const sideKeys = (side, key) => [
    `cycleway:${side}:${key}`,
    `cycleway:${key}:${side}`,
];

export const cyclingAttributeValue = (tags = {}, key) => {
    const value = name => tags[name] == null || tags[name] === "" ? undefined : tags[name];
    const first = names => names.map(value).find(item => item !== undefined);
    const cyclingValue = side => {
        const kind = first([`cycleway:${side}`, "cycleway:both", "cycleway"]);
        if (excluded.has(kind)) return undefined;
        return first([
            ...sideKeys(side, key),
            ...sideKeys("both", key),
            `cycleway:${key}`,
        ]);
    };
    const cyclingLeft = cyclingValue("left");
    const cyclingRight = cyclingValue("right");
    // A missing cycle-lane width must not inherit the width of the entire road.
    // Without cycling widths, retain the existing general width fallback.
    const hasCyclingWidth = key === "width" &&
        (cyclingLeft !== undefined || cyclingRight !== undefined);
    const generalValue = side => first([`${key}:${side}`, `${key}:both`, key]);
    const left = cyclingLeft ?? (hasCyclingWidth ? undefined : generalValue("left"));
    const right = cyclingRight ?? (hasCyclingWidth ? undefined : generalValue("right"));
    if (left === right) return left;
    return [
        left === undefined ? undefined : `links: ${left}`,
        right === undefined ? undefined : `rechts: ${right}`,
    ].filter(item => item !== undefined).join("; ") || undefined;
};

// Exactly the three existing V20 properties; no side-specific output columns.
export const mapCyclingAttributes = (tags = {}) => Object.fromEntries(
    attributes.map(key => [`osm_${key}`, cyclingAttributeValue(tags, key)]),
);

// Display normalized values in the existing rows. Keep the original tag object
// intact for mapping files and OSM edits, and avoid duplicate subtag rows.
export const displayOsmTags = (tags = {}) => {
    const display = {...tags};
    for (const key of attributes) {
        for (const side of ["left", "right", "both"]) {
            for (const name of [...sideKeys(side, key), `${key}:${side}`]) delete display[name];
        }
        delete display[`cycleway:${key}`];
        const resolved = cyclingAttributeValue(tags, key);
        if (resolved === undefined) delete display[key];
        else display[key] = resolved;
    }
    return display;
};
