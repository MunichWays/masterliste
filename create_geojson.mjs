import {createWriteStream, existsSync, writeFileSync} from 'fs';
import osmRead from 'osm-read';

const TOKEN = process.argv[2];
const FOLDER_ID = '1bbPddqZ4heiq5Zpg0CAGedItJ3b_s6OW';

if (TOKEN == null) {
    console.error("Benötigt Zugangstoken als ersten Parameter.")
    process.exit(-1);
}

async function retrieveFileById(id) {
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
      },  
    });
    return fileResponse.json();
}

process.stdout.write("Retrieving annotations from Google Drive ");
let allFeatures = []
let continuationToken = null;
do {
    const query = `'${FOLDER_ID}' in parents and trashed=false`;
    const url = continuationToken == null ?
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` :
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageToken=${continuationToken}`;
    const filesResponse = await fetch(url, {
    headers: {
        "Authorization": `Bearer ${TOKEN}`,
    },
    });
    if (filesResponse.status > 400) {
        console.error("Zugangstoken ist nicht mehr gültig!")
        process.exit(-1);
    }
    const {files, nextPageToken} = await filesResponse.json();
    continuationToken = nextPageToken;

    const featureCollections = await Promise.all(files.map(f => f.id).map(retrieveFileById));
    const featuresList = featureCollections.flatMap(fc => fc.features);
    allFeatures = allFeatures.concat(featuresList);

    process.stdout.write(".");
} while (continuationToken);

console.log("");
console.log("loaded", allFeatures.length, "features from Google Drive.")

const wayIdToMunichways = new Map();
allFeatures.forEach(f => {
    const wayId = f.properties.osm_id;
    wayIdToMunichways.set(wayId, [...wayIdToMunichways.get(wayId) || [], f]);
});

if (!existsSync("map.osm.pbf")) {
    console.log(`downloading latest OSM data ...`);
    const response = await fetch("https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf");
    const reader = response.body.getReader();
    const writeStream = createWriteStream("map.osm.pbf");
    const responseSize = response.headers.get("Content-Length");
    const progressInterval = setInterval(() => {
        const progress = Math.floor(writeStream.bytesWritten / responseSize * 100);
        console.log(`download ${progress}% complete ...`);
    }, 1000);
    while (true) {
        const {value, done} = await reader.read();
        if (done === true) {
            writeStream.close();
            break;
        }
        writeStream.write(value);
    }
    clearInterval(progressInterval);
    console.log("download done.");
} else {
    console.log("OSM data already exists, skipping download.");
}

// extracting relevant ways
process.stdout.write("PASS 1: extracting bicycle ways from OSM ")
const bicycleWays = [];
const nodeRefs = new Map();
let wayCount = 0;
await new Promise((resolve) => {
    osmRead.parse({
        filePath: "map.osm.pbf",
        way: (way) => {
            if (wayCount++ % 10000 === 0) {
                process.stdout.write(".");
            }
            const matchedFeatures = wayIdToMunichways.get(parseInt(way.id));
            if (way.tags && (way.tags["class:bicycle"] || matchedFeatures)) {
                way.munichways = matchedFeatures || [];
                bicycleWays.push(way);
                for (const nodeRef of way.nodeRefs) {
                    nodeRefs.set(nodeRef, null);
                }
            }
        },
        endDocument: resolve,
    })
});
console.log("")
console.log("loaded", bicycleWays.length, "bicycle ways.")

// extracting relevant nodes
process.stdout.write("PASS 2: extracting relevant node information from OSM ")
let nodeCount = 0;
await new Promise((resolve) => {
    osmRead.parse({
        filePath: "map.osm.pbf",
        node: (node) => {
            if (nodeCount++ % 50000 === 0) {
                process.stdout.write(".");
            }
            if (nodeRefs.has(node.id)) {
                nodeRefs.set(node.id, node);
            }
        },
        endDocument: resolve,
    })
});
console.log("")
console.log("loaded", [...nodeRefs.keys()].length, "nodes.");

function translateMunichwaysColor(mwColor) {
    switch (mwColor) {
        case "schwarz":
            return "black";
        case "rot":
            return "red";
        case "gelb":
            return "yellow";
        case "grün":
            return "green";
        case "grau":
            return "grey";
        default:
            return "blue";
    }
}

function translateClassBicycle(clBicycle) {
    switch (clBicycle) {
        case "-3":
            return "black";
        case "-2":
            return "black";
        case "-1":
            return "red";
        case "1":
            return "yellow";
        case "2":
            return "green";
        case "3":
            return "green";
        default:
            return "blue";
    }
}

// building GeoJSON
console.log("building GeoJSON for combined data ...");
const features = [];
for (const way of bicycleWays) {
    features.push({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: way.nodeRefs.map((nodeRef) => nodeRefs.get(nodeRef)).map((node) => [node.lon, node.lat]),
        },
        properties: {
            osm_id: way.id,
            color: way.tags["class:bicycle"] ? translateClassBicycle(way.tags["class:bicycle"]) : way.munichways.length > 0 ? translateMunichwaysColor(way.munichways[0].properties.munichways_color) : "blue",
            osm_class_bicycle: way.tags["class:bicycle"],
            osm_smoothness: way.tags["smoothness"],
            osm_surface: way.tags["surface"],
            osm_bicycle: way.tags["bicycle"],
            osm_lit: way.tags["lit"],
            access: way.tags["access"],
            ...way.munichways.length > 0 ? {
                munichways_id: [...new Set(way.munichways.map(mw => mw.properties.munichways_id))].join(","),
                munichways_name: [...new Set(way.munichways.map(mw => mw.properties.munichways_name))].join(","),
                munichways_happy_bike_level: [...new Set(way.munichways.map(mw => mw.properties.munichways_happy_bike_level))].join(","),
                munichways_color: [...new Set(way.munichways.map(mw => mw.properties.munichways_color))].join(","),
                munichways_mapillary_link: way.munichways.map(mw => mw.properties.munichways_mapillary_link).join(","),
                // munichways_route: [...new Set(way.munichways.map(mw => mw.properties.munichways_route))].join(","),
                // munichways_net_type_plan: [...new Set(way.munichways.map(mw => mw.properties.munichways_net_type_plan))].join(","),
                // munichways_net_type_target: [...new Set(way.munichways.map(mw => mw.properties.munichways_net_type_target))].join(","),
                munichways_current: way.munichways.map(mw => mw.properties.munichways_current).join(","),
                munichways_target: way.munichways.map(mw => mw.properties.munichways_target).join(","),
                // munichways_measure_category: [...new Set(way.munichways.map(mw => mw.properties.munichways_measure_category))].join(","),
                munichways_description: way.munichways.map(mw => mw.properties.munichways_description).join(","),
                // status_umsetzung
                // status_umsetzung
                // bezirk_link
                // Neuralgischer_Punkt
                // links
            } : {},
        }
    });
}
const geoJson = {
    type: "FeatureCollection",
    features,
}
console.log("writing output file IST_RadlVorrangNetz_MunichWays_V20.geojson ...");
writeFileSync("./IST_RadlVorrangNetz_MunichWays_V20.geojson", JSON.stringify(geoJson));

console.log("done!")