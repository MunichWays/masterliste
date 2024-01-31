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

const query = `'${FOLDER_ID}' in parents and trashed=false`;
const filesResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
  headers: {
    "Authorization": `Bearer ${TOKEN}`,
  },
});
if (filesResponse.status > 400) {
    console.error("Zugangstoken ist nicht mehr gültig!")
    process.exit(-1);
}
const {files} = await filesResponse.json();
const featureCollections = await Promise.all(files.map(f => f.id).map(retrieveFileById));
const allFeatures = featureCollections.flatMap(fc => fc.features);

console.log(`loaded ${allFeatures.length} features from Google Drive.`)

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
console.log("PASS 1: extracting bicycle ways from OSM ...")
const bicycleWays = [];
const nodeRefs = new Map();
await new Promise((resolve) => {
    osmRead.parse({
        filePath: "map.osm.pbf",
        way: (way) => {
            const matchedFeatures = wayIdToMunichways.get(parseInt(way.id));
            if (matchedFeatures) {
                console.log("found way with matched feature!");
            }
            if (way.tags && (way.tags["class:bicycle"] || matchedFeatures)) {
                way.munichways = matchedFeatures;
                bicycleWays.push(way);
                for (const nodeRef of way.nodeRefs) {
                    nodeRefs.set(nodeRef, null);
                }
            }
        },
        endDocument: resolve,
    })
})
console.log("loaded", bicycleWays.length, "bicycle ways.")

// extracting relevant nodes
console.log("PASS 2: extracting relevant node information from OSM ...")
await new Promise((resolve) => {
    osmRead.parse({
        filePath: "map.osm.pbf",
        node: (node) => {
            if (nodeRefs.has(node.id)) {
                nodeRefs.set(node.id, node);
            }
        },
        endDocument: resolve,
    })
})
console.log("loaded", [...nodeRefs.keys()].length, "nodes.");

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
            color: translateClassBicycle(way.tags["class:bicycle"]),
            class_bicycle: way.tags["class:bicycle"],
            smoothness: way.tags["smoothness"],
            surface: way.tags["surface"],
            bicycle: way.tags["bicycle"],
            lit: way.tags["lit"],
            access: way.tags["access"],
            munichways: way.munichways?.map(mw => ({
                id: mw.properties.munichways_id,
                name: mw.properties.munichways_name,
                description: mw.properties.munichways_description,
                current: mw.properties.munichways_current,
                target: mw.properties.munichways_target,
                mapillary_link: mw.properties.munichways_mapillary_link,
                color: mw.properties.munichways_color,
            })),
        }
    });
}
const geoJson = {
    type: "FeatureCollection",
    features,
}
console.log("writing output file munichways.json ...");
writeFileSync("./munichways.json", JSON.stringify(geoJson));

console.log("done!")