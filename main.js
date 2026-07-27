import * as turf from '@turf/turf';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style, Circle } from 'ol/style.js';
import { transform } from 'ol/proj';

const AUTOPILOT = false;

const btnNext = document.getElementById("btn_next");
const btnSave = document.getElementById("btn_save");
const infoElement = document.getElementById("info");
const hoverElement = document.getElementById("hover");
const hintElement = document.getElementById("hint");
const rowNumText = document.getElementById("row_num_text");
const btnOSM = document.getElementById("btn_osm");
const SOURCE_SHEET_NAME = "webapp";
const TARGET_SHEET_NAME = "osm_class_bicycle";
const MUNICHWAYS_ID_INDEX = 0;
const NAME_INDEX = 1;
const IST_SITUATION_INDEX = 2;
const FARBE_INDEX = 3;
const SOLL_MASSNAHMEN_INDEX = 4;
const BESCHREIBUNG_INDEX = 5;
const MAPILLARY_LINK_INDEX = 6;
const CARTO_GEOM_INDEX = 7;
const HAPPY_BIKE_LEVEL_INDEX = 10;
const LINKS_INDEX = 11;
const MW_RV_STRECKE_INDEX = 12;
const NETZTYP_PLAN_INDEX = 13;
const NETZTYP_ZIEL_INDEX = 14;
const STATUS_UMSETZUNG_INDEX = 15;
const NEURALGISCHER_PUNKT_INDEX = 16;
const MASSNAHMEN_KATEGORIE_LINK_INDEX = 18;
const STRECKEN_LINK_INDEX = 19;
const BEZIRK_LINK_INDEX = 20;

const FOLDER_ID = "1bbPddqZ4heiq5Zpg0CAGedItJ3b_s6OW";

let currentRow = 1;
let drawLine = false;

const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const timeoutError = () => new Error(`Die Anfrage hat zu lange gebraucht (${Math.round(timeoutMs / 1000)} Sekunden).`);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const readBody = (method) => async (...args) => {
            try {
                return await response[method](...args);
            } catch (error) {
                if (controller.signal.aborted) {
                    throw timeoutError();
                }
                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        // fetch() resolves as soon as the headers arrive. Keep the timeout active
        // until the response body has actually been read as well.
        return new Proxy(response, {
            get(target, property) {
                if (["arrayBuffer", "blob", "formData", "json", "text"].includes(property)) {
                    return readBody(property);
                }
                const value = Reflect.get(target, property, target);
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
    } catch (error) {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
            throw timeoutError();
        }
        throw error;
    }
};

// do oauth
const hashParams = new Map(window.location.hash.slice(1).split("&").map(part => part.split("=")));
let accessToken = null;
if (!hashParams.has("access_token")) {
    const scopes = encodeURIComponent(["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"].join(" "));
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?client_id=241672553209-fhu58jbhvt0t538d6o8ukfbh6k20b53r.apps.googleusercontent.com&redirect_uri=http://localhost:8080&response_type=token&scope=${scopes}`);
    throw new Error("need to login first");
} else {
    accessToken = hashParams.get("access_token");
    window.history.replaceState(null, null, window.location.toString().split("#")[0]);
}

const createFile = async (name, content) => {
    const metadata = {
        name,
        parents: [FOLDER_ID],
    };
    const boundary = "xxxxxxxxxx";
    let data = "--" + boundary + "\r\n";
    data += 'Content-Disposition: form-data; name="metadata"\r\n';
    data += "Content-Type: application/json; charset=UTF-8\r\n\r\n";
    data += JSON.stringify(metadata) + "\r\n";
    data += "--" + boundary + "\r\n";
    data += 'Content-Disposition: form-data; name="file"\r\n';
    data += "Content-Type: application/json; charset=UTF-8\r\n\r\n";
    data += content;
    data += "\r\n--" + boundary + "--\r\n";
    const response = await fetchWithTimeout("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "multipart/form-data; boundary=" + boundary,
        },
        body: data,
    });
    return response.json();
};

const updateFile = async (id, content) => {
    const response = await fetchWithTimeout(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
        body: content,
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
        },
    });
    if (!response.ok) {
        throw new Error(`Drive-Update fehlgeschlagen (${response.status}): ${await response.text()}`);
    }
    return response.json();
};

const vectorSource = new VectorSource();
const baseVectorSource = new VectorSource();

const map = new OlMap({
    target: 'map',
    layers: [
        new TileLayer({
            source: new XYZ({
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            })
        }),
        new VectorLayer({
            source: baseVectorSource,
            style: (f, r) => new Style({
                stroke: new Stroke({
                    color: 'rgba(0,0,255,0.7)',
                    width: 6,
                    radius: 2,
                }),
                image: new Circle({
                    radius: 5,
                    fill: null,
                    stroke: new Stroke({color: 'rgba(0,0,255,0.7)', width: 3}),
                  }),
            }),
        }),
        new VectorLayer({
            source: vectorSource,
            style: (f, r) => new Style({
                stroke: new Stroke({
                    color: f.getProperties().matched ? '#7FFF00' : 'red',
                    width: 3,
                }),
            }),
        }),
    ],
    view: new View({
        center: [0, 0],
        zoom: 2,
    })
});

const line = [];

map.on('click', (e) => {
    if (drawLine) {
        const coord = transform(e.coordinate, 'EPSG:3857', 'EPSG:4326');
        line.push(coord);
        console.log(line);
        baseVectorSource.clear();
        if (line.length > 1) {
            baseVectorSource.addFeature(new GeoJSON().readFeature({
                type: "Feature",
                properties: {},
                geometry: {
                    type: "LineString",
                    coordinates: line,
                }
            }, { featureProjection: 'EPSG:3857' }));
        } else {
            baseVectorSource.addFeature(new GeoJSON().readFeature({
                type: "Feature",
                properties: {},
                geometry: {
                    type: "Point",
                    coordinates: line[0],
                }
            }, { featureProjection: 'EPSG:3857' }));
        }
    } else {
        map.forEachFeatureAtPixel(e.pixel, (feature) => {
            if (feature.get('matched') !== undefined) {
                feature.set('matched', !feature.get('matched'));
                console.log(feature.getProperties());
                btnSave.disabled = false;
            }
        });
    }
});

map.on('pointermove', (e) => {
    hoverElement.innerHTML = ``;
    map.forEachFeatureAtPixel(e.pixel, (feature) => {
        if (feature.get('matched') !== undefined && feature.get('tags')) {
            hoverElement.innerHTML += `<h3>Element(e) unter Maus</h3>
      <b>Way #${feature.get('way')}</b><br />`;
            const tags = feature.get('tags');
            console.log(tags);
            for (const key in tags) {
                hoverElement.innerHTML += `<b>${key}</b>: ${tags[key]}<br />`;
            }
            hoverElement.innerHTML += `<hr />`;
        }
    });
})

const fetchSheetRow = async (rowNum = 1) => {
    const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${SOURCE_SHEET_NAME}!${rowNum}:${rowNum}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    const responseText = await response.text();
    let data = {};
    try {
        data = JSON.parse(responseText);
    } catch {
        data = {};
    }
    if (!response.ok) {
        throw new Error(`Google Sheets Anfrage fehlgeschlagen (${response.status}): ${data.error?.message || responseText || "unbekannter Fehler"}`);
    }
    const rows = data.values ?? [];
    return rows[0] ?? [];
};

const fetchSheetRows = async (startRow = 1, numRows = 1000) => {
    const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${SOURCE_SHEET_NAME}!A${startRow}:A${startRow + numRows}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    const responseText = await response.text();
    let data = {};
    try {
        data = JSON.parse(responseText);
    } catch {
        data = {};
    }
    if (!response.ok) {
        throw new Error(`Google Sheets Anfrage fehlgeschlagen (${response.status}): ${data.error?.message || responseText || "unbekannter Fehler"}`);
    }
    return data.values ?? [];
};

const updateSheetRow = async (rowNum = 1, osm_ids) => {
    const range = `webapp!H${rowNum}:H${rowNum}`;
    const data = {
        range,
        majorDimension: "ROWS",
        values: [
            [osm_ids],
        ],
    };
    const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${range}?valueInputOption=RAW`,
        {
            method: 'PUT',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    const success = response.status == 200;
    await response.text();
    return success;
};

const appendSheetRow = async (munichways_id, osm_id, name_osm, class_bicycle, class_bicycle_org, smoothness, surface, bicycle, highway, lit, width, access, geom, last_updated) => {
    const data = {
        range: "osm_class_bicycle!A1:N1",
        majorDimension: "ROWS",
        values: [
            [munichways_id, osm_id, name_osm, class_bicycle, class_bicycle_org, smoothness, surface, bicycle, highway, lit, width, access, geom, last_updated],
        ],
    };
    const response = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${TARGET_SHEET_NAME}!A1:N1:append?valueInputOption=RAW`,
        {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        });
    const success = response.status == 200;
    await response.text();
    return success;
};

hintElement.innerHTML = "<h2>wird geladen ...</h2>";


let munichwaysId = null;
let munichwaysName = null;
let munichwaysIst = null;
let munichwaysFarbe = null;
let munichwaysHappyBikeLevel = null;
let munichwaysSoll = null;
let munichwaysBeschreibung = null;
let munichwaysMapillaryLink = null;
let munichwaysStreckenLink = null;
let munichwaysNetztypPlan = null;
let munichwaysNetztypZiel = null;
let munichwaysMassnahmenKategorieLink = null;
let munichwaysStatusUmsetzung = null;
let munichwaysBezirkLink = null;
let munichwaysNeuralgischerPunkt = null;
let munichwaysLinks = null;
let munichwaysMwRvStrecke = null;
let existingFileId = null;
let previouslyMatchedOsmIds = null;

const setLoadingState = (message = "wird geladen ...") => {
    hintElement.innerHTML = `<h2>${message}</h2>`;
    btnNext.disabled = true;
    btnOSM.disabled = true;
    btnSave.disabled = true;
    rowNumText.disabled = true;
};

const resetControls = (allowNext = true, allowSave = true, allowOsm = true) => {
    btnNext.disabled = !allowNext;
    btnSave.disabled = !allowSave;
    btnOSM.disabled = !allowOsm;
    rowNumText.disabled = false;
};

const showError = (message, details = "") => {
    console.error(message, details);
    hintElement.innerHTML = `<h2>Fehler</h2><p>${message}</p>${details ? `<p><small>${details}</small></p>` : ""}`;
    btnNext.disabled = false;
    btnSave.disabled = true;
    btnOSM.disabled = false;
    rowNumText.disabled = false;
};

async function getOSMData(lineFeature, ids) {
    hintElement.innerHTML = "<h2>OSM-Daten werden direkt von OpenStreetMap geladen ...</h2>";
    const osmDocuments = [];
    const loadOsmXml = async (url) => {
        const response = await fetchWithTimeout(url, {
            headers: { "Accept": "application/xml" },
        }, 30000);
        if (!response.ok) {
            throw new Error(`OpenStreetMap-Abfrage fehlgeschlagen (${response.status}): ${await response.text() || "unbekannter Fehler"}`);
        }
        const xmlText = await response.text();
        const document = new DOMParser().parseFromString(xmlText, "application/xml");
        if (document.querySelector("parsererror")) {
            throw new Error("OpenStreetMap hat keine gültige XML-Antwort geliefert.");
        }
        return document;
    };

    let bufferedLine = null;
    if (lineFeature) {
        bufferedLine = turf.buffer(lineFeature, 10, { units: 'meters' });
        const [left, bottom, right, top] = turf.bbox(bufferedLine);
        const bboxArea = (right - left) * (top - bottom);
        if (bboxArea > 0.25) {
            throw new Error("Der Kartenausschnitt ist für eine direkte OpenStreetMap-Abfrage zu groß.");
        }
        const bbox = [left, bottom, right, top].map(value => value.toFixed(7)).join(",");
        osmDocuments.push(await loadOsmXml(
            `/osm-api/map?bbox=${encodeURIComponent(bbox)}`
        ));
    } else if (ids != null && ids.length > 0) {
        for (const id of ids) {
            osmDocuments.push(await loadOsmXml(
                `/osm-api/way/${encodeURIComponent(id)}/full`
            ));
        }
    } else {
        throw new Error("Für die OSM-Abfrage fehlt eine Referenzlinie.");
    }

    const nodes = new Map();
    const ways = new Map();
    for (const document of osmDocuments) {
        for (const node of document.getElementsByTagName("node")) {
            nodes.set(node.getAttribute("id"), [
                Number(node.getAttribute("lon")),
                Number(node.getAttribute("lat")),
            ]);
        }
        for (const wayElement of document.getElementsByTagName("way")) {
            const wayId = Number(wayElement.getAttribute("id"));
            const nodeIds = [];
            const tags = {};
            for (const child of wayElement.children) {
                if (child.localName === "nd") {
                    nodeIds.push(child.getAttribute("ref"));
                } else if (child.localName === "tag") {
                    tags[child.getAttribute("k")] = child.getAttribute("v");
                }
            }
            ways.set(wayId, { wayId, nodeIds, tags });
        }
    }

    const featureCollection = {
        type: "FeatureCollection",
        features: [],
    }
    for (const { wayId, nodeIds, tags } of ways.values()) {
        if (tags.highway == null || tags.highway === "steps") {
            continue;
        }
        const coordinates = nodeIds.map(nodeId => nodes.get(nodeId)).filter(Boolean);
        if (coordinates.length < 2) {
            continue;
        }
        const distances = [];
        if (lineFeature) {
            for (const nodeCoord of coordinates) {
                const nodeDistance = turf.pointToLineDistance(nodeCoord, lineFeature, { units: 'meters' });
                distances.push(nodeDistance);
            }
        }
        featureCollection.features.push({
            type: 'Feature',
            properties: {
                matched: previouslyMatchedOsmIds != null ?
                    previouslyMatchedOsmIds.includes(wayId) :
                    distances.length > 0 && (distances.reduce((a, b) => a + b, 0) / distances.length) < 2,
                way: wayId,
                tags,
            },
            geometry: { type: "LineString", coordinates },
        });
    }

    vectorSource.addFeatures(new GeoJSON().readFeatures(featureCollection, { featureProjection: 'EPSG:3857' }));

    if (!vectorSource.isEmpty()) {
        map.getView().fit(vectorSource.getExtent());
    }
}

async function editRow(row) {
    setLoadingState();
    rowNumText.value = row;
    vectorSource.clear();
    baseVectorSource.clear();
    let loadingStage = "Google-Sheets-Zeile";

    try {
        hintElement.innerHTML = "<h2>Google-Sheets-Zeile wird geladen ...</h2>";
        const dataRow = await fetchSheetRow(row);
        if (!Array.isArray(dataRow) || dataRow.length === 0) {
            throw new Error(`Die Zeile ${row} konnte nicht aus Google Sheets geladen werden.`);
        }

        munichwaysId = dataRow[MUNICHWAYS_ID_INDEX];
        munichwaysName = dataRow[NAME_INDEX];
        munichwaysIst = dataRow[IST_SITUATION_INDEX];
        munichwaysFarbe = dataRow[FARBE_INDEX];
        munichwaysHappyBikeLevel = dataRow[HAPPY_BIKE_LEVEL_INDEX];
        munichwaysSoll = dataRow[SOLL_MASSNAHMEN_INDEX];
        munichwaysBeschreibung = dataRow[BESCHREIBUNG_INDEX];
        munichwaysMapillaryLink = dataRow[MAPILLARY_LINK_INDEX];
        munichwaysStreckenLink = dataRow[STRECKEN_LINK_INDEX];
        munichwaysNetztypPlan = dataRow[NETZTYP_PLAN_INDEX];
        munichwaysNetztypZiel = dataRow[NETZTYP_ZIEL_INDEX];
        munichwaysMassnahmenKategorieLink = dataRow[MASSNAHMEN_KATEGORIE_LINK_INDEX];
        munichwaysStatusUmsetzung = dataRow[STATUS_UMSETZUNG_INDEX];
        munichwaysBezirkLink = dataRow[BEZIRK_LINK_INDEX];
        munichwaysNeuralgischerPunkt = dataRow[NEURALGISCHER_PUNKT_INDEX];
        munichwaysLinks = dataRow[LINKS_INDEX];
        munichwaysMwRvStrecke = dataRow[MW_RV_STRECKE_INDEX];

        loadingStage = "Google-Drive-Dateisuche";
        hintElement.innerHTML = "<h2>Vorhandene Zuordnung wird gesucht ...</h2>";
        const query = `name='${munichwaysId}.json' and '${FOLDER_ID}' in parents and trashed=false`;
        const filesResponse = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        });
        if (!filesResponse.ok) {
            throw new Error(`Drive-Abfrage fehlgeschlagen (${filesResponse.status}): ${await filesResponse.text()}`);
        }
        const { files } = await filesResponse.json();
        existingFileId = files?.[0]?.id;
        if (existingFileId) {
            loadingStage = "Google-Drive-Dateidownload";
            hintElement.innerHTML = "<h2>Vorhandene Zuordnung wird geladen ...</h2>";
            const fileResponse = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${existingFileId}?alt=media`, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                },
            });
            if (!fileResponse.ok) {
                throw new Error(`Drive-Datei konnte nicht geladen werden (${fileResponse.status}): ${await fileResponse.text()}`);
            }
            const previousFeatureCollection = await fileResponse.json();
            previouslyMatchedOsmIds = previousFeatureCollection.features.map(f => f.properties.osm_id);
        } else {
            previouslyMatchedOsmIds = null;
        }

        infoElement.innerHTML = `<h3>Masterlisten Element #${row}</h3>
  <b>MunichWays_ID</b>:&nbsp;${munichwaysId}<br />
  <b>Name</b>: ${munichwaysName}<br />
  <b>Farbe</b>: ${munichwaysFarbe}<br />
  <b>Happy Bike Level</b>: ${munichwaysHappyBikeLevel}<br />
  <b>MW RV Strecke</b>: ${munichwaysMwRvStrecke}<br />
  <b>IST_Situation</b>: ${munichwaysIst}<br />
  <b>SOLL_Massnahmen</b>: ${munichwaysSoll}<br />
  <b>Beschreibung</b>: ${munichwaysBeschreibung}<br />`;
        if (munichwaysMapillaryLink?.trim().length > 0) {
            infoElement.innerHTML += `<a href="${munichwaysMapillaryLink}" target="_blank">In Mapillary öffnen</a><br />`;
        }
        if (previouslyMatchedOsmIds != null) {
            infoElement.innerHTML += `☑️ wurde bereits zugeordnet<br />`;
        } else {
            infoElement.innerHTML += `˟ noch nicht zugeordnet<br />`;
        }

        const lineStringIn = dataRow[CARTO_GEOM_INDEX];

        if (lineStringIn == null || lineStringIn.trim() == "") {
            resetControls(true, false, true);
            infoElement.innerHTML += "<br /><i><b>keine Carto Daten</b> - nutze den 'Linie zeichnen' Knopf, um per Mausklick eine Referenzlinie auf der Karte zu zeichnen.</i>";

            if (previouslyMatchedOsmIds != null) {
                loadingStage = "OpenStreetMap-Daten";
                await getOSMData(null, previouslyMatchedOsmIds);
            }
            hintElement.innerHTML = "";
            return;
        }

        if (lineStringIn.indexOf("MULTI") >= 0) {
            resetControls(true, false, true);
            return;
        }
        const coorString = lineStringIn.replace("LINESTRING(", "").replace(")", "");
        const coordPairs = coorString.split(",");
        const coordinates = coordPairs.map(pair => pair.trim().split(" ").map(coord => parseFloat(coord)));
        const lineString = {
            type: "Feature",
            properties: {},
            geometry: {
                type: "LineString",
                coordinates,
            }
        };
        baseVectorSource.addFeature(new GeoJSON().readFeature(lineString, { featureProjection: 'EPSG:3857' }));
        try {
            map.getView().fit(baseVectorSource.getExtent());
        } catch (ignored) {
            resetControls(true, false, true);
            return;
        }

        loadingStage = "OpenStreetMap-Daten";
        await getOSMData(lineString, previouslyMatchedOsmIds || []);

        resetControls(true, true, true);
        hintElement.innerHTML = "";
    } catch (error) {
        console.error("editRow failed", error);
        infoElement.innerHTML = `<h3>Masterlisten Element #${row}</h3><p>Der Eintrag konnte nicht geladen werden.</p>`;
        showError(
            `Der Eintrag konnte beim Schritt „${loadingStage}“ nicht geladen werden.`,
            error instanceof Error ? error.message : String(error)
        );
    }
}

async function saveResult() {
    setLoadingState("wird gespeichert ...");

    try {
        const wayIds = [];
        const featureCollection = {
            type: "FeatureCollection",
            features: [],
        };
        vectorSource.forEachFeature((feature) => {
            if (feature.get('matched')) {
                wayIds.push(feature.get('way'));
                const coordinates = feature.getGeometry().getCoordinates().map(coord => transform(coord, 'EPSG:3857', 'EPSG:4326'));
                const geoJson = {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates,
                    },
                    properties: {
                        osm_tags: feature.get("tags"),
                        osm_id: feature.get("way"),
                        munichways_id: munichwaysId,
                        munichways_name: munichwaysName,
                        munichways_happy_bike_level: munichwaysHappyBikeLevel,
                        munichways_color: munichwaysFarbe,
                        munichways_mapillary_link: munichwaysMapillaryLink,
                        munichways_route_link: munichwaysStreckenLink,
                        munichways_net_type_plan: munichwaysNetztypPlan,
                        munichways_net_type_target: munichwaysNetztypZiel,
                        munichways_current: munichwaysIst,
                        munichways_target: munichwaysSoll,
                        munichways_measure_category_link: munichwaysMassnahmenKategorieLink,
                        munichways_description: munichwaysBeschreibung,
                        munichways_status_implementation: munichwaysStatusUmsetzung,
                        munichways_district_link: munichwaysBezirkLink,
                        munichways_neuralgic_point: munichwaysNeuralgischerPunkt,
                        munichways_links: munichwaysLinks,
                        munichways_mw_rv_route: munichwaysMwRvStrecke,
                    }
                };
                featureCollection.features.push(geoJson);
            }
        });

        if (existingFileId) {
            console.log(`updating file ${existingFileId}`);
            await updateFile(existingFileId, JSON.stringify(featureCollection));
        } else {
            console.log(`creating file ${munichwaysId}.json`);
            await createFile(`${munichwaysId}.json`, JSON.stringify(featureCollection));
        }

        resetControls(true, true, true);
        hintElement.innerHTML = "";
    } catch (error) {
        console.error("saveResult failed", error);
        showError("Das Speichern ist fehlgeschlagen.", error instanceof Error ? error.message : String(error));
    }
}

const batchSize = 5000;
let currentIndex = 1;
const rowNumByMunichWaysId = new Map();
let rowsReturned = 0;

async function initializeApp() {
    try {
        do {
            const rows = await fetchSheetRows(currentIndex, batchSize);
            rowsReturned = rows.length;
            for (const i in rows) {
                const [
                    munichWaysId,
                ] = rows[i];
                rowNumByMunichWaysId.set(munichWaysId, currentIndex + parseInt(i));
            }
            currentIndex += batchSize;
        } while (rowsReturned >= batchSize);

        await editRow(currentRow);
    } catch (error) {
        console.error("Initialisierung fehlgeschlagen", error);
        showError("Die Anwendung konnte nicht initialisiert werden.", error instanceof Error ? error.message : String(error));
    }
}

initializeApp();

btnNext.onclick = async () => {
    currentRow++;
    await editRow(currentRow);

    if (AUTOPILOT) {
        if (!btnNext.disabled && btnSave.disabled) {
            btnNext.click();
        } else {
            btnSave.click();
        }
    }
};

btnSave.onclick = async () => {
    await saveResult();

    if (AUTOPILOT) {
        btnNext.click();
    }
};

rowNumText.onchange = (e) => {
    let temp = currentRow;
    currentRow = parseInt(rowNumText.value);
    if (isNaN(currentRow)) {
        if (rowNumByMunichWaysId.has(rowNumText.value)) {
            currentRow = rowNumByMunichWaysId.get(rowNumText.value);
            editRow(currentRow);
            return;
        }

        currentRow = temp;
        rowNumText.value = currentRow;
        return;
    }
    editRow(currentRow);
};

btnOSM.onclick = async () => {
    if (drawLine) {
        btnOSM.disabled = true;
        btnOSM.innerText = "lade OSM Daten ...";
        await getOSMData({
            type: "Feature",
            properties: {},
            geometry: {
                type: "LineString",
                coordinates: line,
            }
        });
        btnOSM.disabled = false;
        btnOSM.innerText = "Linie zeichnen";
    } else {
        line.splice(0);
        baseVectorSource.clear();
        btnOSM.innerText = "OSM Daten laden";
    }
    drawLine = !drawLine;
};
