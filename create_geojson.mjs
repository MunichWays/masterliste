import {createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import osmRead from 'osm-read';
import crypto from 'crypto';

if (!existsSync("secret.json")) {
    console.log("File secret.json is not present, please create it for an appropriate service account in Google Cloud Console.");
    process.exit(-1);
}
const secretContent = readFileSync('secret.json');
const {
    private_key: privateKeyStr,
    client_email: clientEmail,
    token_uri: tokenUri,
} = JSON.parse(secretContent);

const FOLDER_ID = '1bbPddqZ4heiq5Zpg0CAGedItJ3b_s6OW';
const SHEET_NAME = 'webapp';

const header = JSON.stringify({"alg":"RS256","typ":"JWT"});
const b64Header = Buffer.from(header, 'utf-8').toString('base64');

const timestamp = Math.floor(Date.now() / 1000);
const scope = ["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive"].join(" ")
const payload = JSON.stringify({
    "iss": clientEmail,
    scope,
    "aud": tokenUri,
    "exp": timestamp + 1800,
    "iat": timestamp,
});
const b64Payload = Buffer.from(payload, "utf-8").toString('base64');

const signer = crypto.createSign("RSA-SHA256");
signer.update(`${b64Header}.${b64Payload}`);
const privateKey = crypto.createPrivateKey(privateKeyStr);
const b64Signature = signer.sign({key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING}, "base64").replace("+", "-").replace("/", "_");;

const assertion = `${b64Header}.${b64Payload}.${b64Signature}`;
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
    }),
});

if (tokenResponse.status !== 200) {
    console.error("Could not retrieve token!");
    console.error(tokenResponse.statusText);
    console.error(await tokenResponse.text());
    process.exit(-1);
}

const { access_token: TOKEN } = await tokenResponse.json();

if (TOKEN == null) {
    console.error("Benötigt Zugangstoken als ersten Parameter.")
    process.exit(-1);
}

if (!existsSync("cache")) {
    mkdirSync("cache");
}

const fetchSheetRows = async (startRow = 1, numRows = 100) => {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${SHEET_NAME}!${startRow}:${startRow + numRows}`,
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
      },
    });
    if (response.status != 200) {
        throw new Error(response.status + (await response.text()))
    }
    const data = await response.json();
    const rows = data.values;
    return rows;
};

const batchSize = 1000;
let currentIndex = 1;
const munichWaysInfoById = new Map();
process.stdout.write("Loading Masterliste from Google Drive ");
let rowsReturned = 0;
do {
    const rows = await fetchSheetRows(currentIndex, batchSize);
    rowsReturned = rows.length;
    for (const row of rows) {
        const [
            id,
            name,
            ist_situation,
            farbe,
            soll_massnahmen,
            beschreibung,
            mapillary_link,
            ,,,
            happy_bike_level,
            links,
            mw_rv_strecke,
            netztyp_plan,
            netztyp_ziel,
            status_umsetzung,
            neuralgischer_punkt,
            strassenansicht_klick_mich,
            massnahmen_kategorie_link,
            strecken_link,
            bezirk_link
        ] = row;
        munichWaysInfoById.set(id, {
            id,
            name,
            ist_situation,
            farbe,
            soll_massnahmen,
            beschreibung,
            mapillary_link,
            happy_bike_level,
            links,
            mw_rv_strecke,
            netztyp_plan,
            netztyp_ziel,
            status_umsetzung,
            neuralgischer_punkt,
            strassenansicht_klick_mich,
            massnahmen_kategorie_link,
            strecken_link,
            bezirk_link
        });
    }
    process.stdout.write(".");
    currentIndex += batchSize;
} while (rowsReturned >= batchSize)
console.log();
console.log("loaded", munichWaysInfoById.size, "rows from sheet", SHEET_NAME, "of document Masterliste.");
console.log()

async function retrieveFileById(id) {
    const filePath = `cache/${id}`;
    try {
        if (existsSync(filePath)) {
            return JSON.parse(readFileSync(filePath).toString("utf-8"));
        }
    } catch (e) {
        console.error(e);
        console.log(`could not read cached file ${filePath}, will retrieve online version ...`);
    }
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
      },  
    });
    const content = await fileResponse.text();
    writeFileSync(filePath, content);
    return JSON.parse(content);
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
    const featuresList = featureCollections.flatMap(fc => fc.features).filter(f => f != null);
    allFeatures = allFeatures.concat(featuresList);

    process.stdout.write(".");
} while (continuationToken);

console.log();
console.log("loaded", allFeatures.length, "features from Google Drive.")
console.log()

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
console.log()

// extracting relevant ways
process.stdout.write("OSM - PASS 1: extracting bicycle ways ")
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
console.log()
console.log("loaded", bicycleWays.length, "bicycle ways.")
console.log()

// extracting relevant nodes
process.stdout.write("OSM - PASS 2: extracting relevant node information ")
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
console.log()
console.log("loaded", [...nodeRefs.keys()].length, "nodes.");
console.log()

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
    const munichWaysIds = [...new Set(way.munichways.map(mw => mw.properties.munichways_id))];
    const mwInfos = munichWaysIds.map(id => munichWaysInfoById.get(id)).filter(info => info !== undefined);
    features.push({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: way.nodeRefs.map((nodeRef) => nodeRefs.get(nodeRef)).map((node) => [node.lon, node.lat]),
        },
        properties: {
            osm_id: way.id,
            osm_name: way.tags["name"],
            osm_class_bicycle: way.tags["class:bicycle"],
            osm_smoothness: way.tags["smoothness"],
            osm_surface: way.tags["surface"],
            osm_bicycle: way.tags["bicycle"],
            osm_highway: way.tags["highway"],
            osm_lit: way.tags["lit"],
            osm_width: way.tags["width"],
            osm_access: way.tags["access"],
            ...way.munichways.length > 0 ? {
                munichways_id: mwInfos.map(info => info.id).join(","),
                munichways_name: mwInfos.map(info => info.name).join(","),
                munichways_happy_bike_level: mwInfos.map(info => info.happy_bike_level).join(","),
                munichways_color: mwInfos.map(info => info.farbe).join(","),
                munichways_mapillary_link: mwInfos.map(info => info.mapillary_link).join(","),
                munichways_route_link: mwInfos.map(info => info.strecken_link).join(","),
                munichways_net_type_plan: mwInfos.map(info => info.netztyp_plan).join(","),
                munichways_net_type_target: mwInfos.map(info => info.netztyp_ziel).join(","),
                munichways_current: mwInfos.map(info => info.ist_situation).join(","),
                munichways_target: mwInfos.map(info => info.soll_massnahmen).join(","),
                munichways_measure_category_link: mwInfos.map(info => info.massnahmen_kategorie_link).join(","),
                munichways_description: mwInfos.map(info => info.beschreibung).join(","),
                munichways_status_implementation: mwInfos.map(info => info.status_umsetzung).join(","),
                munichways_district_link: mwInfos.map(info => info.bezirk_link).join(","),
                munichways_neuralgic_point: mwInfos.map(info => info.neuralgischer_punkt).join(","),
                munichways_links: mwInfos.map(info => info.links).join(","),
                munichways_mw_rv_route: mwInfos.map(info => info.mw_rv_strecke).join(","),
            } : {},
            color: way.tags["class:bicycle"] ? translateClassBicycle(way.tags["class:bicycle"]) : way.munichways.length > 0 ? translateMunichwaysColor(way.munichways[0].properties.munichways_color) : undefined,
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