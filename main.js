import * as turf from '@turf/turf';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {Stroke, Style} from 'ol/style.js';
import { transform } from 'ol/proj';

const linkShowToken = document.getElementById("link_show_token");
const btnNext = document.getElementById("btn_next");
const btnSave = document.getElementById("btn_save");
const infoElement = document.getElementById("info");
const hoverElement = document.getElementById("hover");
const hintElement = document.getElementById("hint");
const rowNumText = document.getElementById("row_num_text");
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

const FOLDER_ID = "1bbPddqZ4heiq5Zpg0CAGedItJ3b_s6OW";

let currentRow = 1;

// do oauth
const hashParams = new Map(window.location.hash.slice(1).split("&").map(part => part.split("=")));
let accessToken = null;
if (!hashParams.has("access_token")) {
  const scopes = encodeURIComponent(["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive"].join(" "));
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
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
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
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
    body: content,
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
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

map.on('click', (e) => {
    map.forEachFeatureAtPixel(e.pixel, (feature) => {
      if (feature.get('matched') !== undefined) {
        feature.set('matched', !feature.get('matched'));
        console.log(feature.getProperties())
      }
    });
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
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${SOURCE_SHEET_NAME}!${rowNum}:${rowNum}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const data = await response.json();
  const rows = data.values;
  return rows[0];
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
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${range}?valueInputOption=RAW`,
  {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  return response.status == 200;
};

const appendSheetRow = async(munichways_id, osm_id, name_osm, class_bicycle, class_bicycle_org, smoothness, surface, bicycle, highway, lit, width, access, geom, last_updated) => {
  const data = {
    range: "osm_class_bicycle!A1:N1",
    majorDimension: "ROWS",
    values: [
      [munichways_id, osm_id, name_osm, class_bicycle, class_bicycle_org, smoothness, surface, bicycle, highway, lit, width, access, geom, last_updated],
    ],
  };
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/values/${TARGET_SHEET_NAME}!A1:N1:append?valueInputOption=RAW`,
  {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  return response.status == 200;
};

hintElement.innerHTML = "<h2>wird geladen ...</h2>";


let munichwaysId = null;
let munichwaysName = null;
let munichwaysIst = null;
let munichwaysFarbe = null;
let munichwaysSoll = null;
let munichwaysBeschreibung = null;
let munichwaysMapillaryLink = null;
let existingFileId = null;

async function editRow(row) {
  hintElement.innerHTML = "<h2>wird geladen ...</h2>";
  rowNumText.value = row;
  btnNext.disabled = true;
  btnSave.disabled = true;
  rowNumText.disabled = true;
  vectorSource.clear();
  baseVectorSource.clear();

  const dataRow = await fetchSheetRow(row);
  munichwaysId = dataRow[MUNICHWAYS_ID_INDEX];
  munichwaysName = dataRow[NAME_INDEX];
  munichwaysIst = dataRow[IST_SITUATION_INDEX];
  munichwaysFarbe = dataRow[FARBE_INDEX];
  munichwaysSoll = dataRow[SOLL_MASSNAHMEN_INDEX];
  munichwaysBeschreibung = dataRow[BESCHREIBUNG_INDEX];
  munichwaysMapillaryLink = dataRow[MAPILLARY_LINK_INDEX];

  const query = `name='${munichwaysId}.json' and '${FOLDER_ID}' in parents and trashed=false`;
  const filesResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });
  const {files} = await filesResponse.json();
  existingFileId = files?.[0]?.id;
  let previouslyMatchedOsmIds = null;
  if (existingFileId) {
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFileId}?alt=media`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },  
    });
    const previousFeatureCollection = await fileResponse.json();
    previouslyMatchedOsmIds = previousFeatureCollection.features.map(f => f.properties.osm_id);
  }

  infoElement.innerHTML = `<h3>Masterlisten Element #${row - 1}</h3>
  <b>MunichWays_ID</b>:&nbsp;${munichwaysId}<br />
  <b>Name</b>: ${munichwaysName}<br />
  <b>Farbe</b>: ${munichwaysFarbe}<br />
  <b>IST_Situation</b>: ${munichwaysIst}<br />
  <b>SOLL_Massnahmen</b>: ${munichwaysSoll}<br />
  <b>Beschreibung</b>: ${munichwaysBeschreibung}<br />`;
  if (munichwaysMapillaryLink?.trim().length > 0) {
    infoElement.innerHTML += `<a href="${munichwaysMapillaryLink}" target="_blank">In Mapillary öffnen</a><br />`;
  }
  if (previouslyMatchedOsmIds != null) {
    infoElement.innerHTML += `☑️ wurde bereits zugeordnet`;
  } else {
    infoElement.innerHTML += `˟ noch nicht zugeordnet`;
  }

  const lineStringIn = dataRow[CARTO_GEOM_INDEX];
  if (lineStringIn == null || lineStringIn.trim() == "") {
    btnNext.disabled = false;
    btnSave.disabled = true;
    rowNumText.disabled = false;
    hintElement.innerHTML = "<h2>keine Carto Daten!</h2>";
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
  map.getView().fit(baseVectorSource.getExtent());
  
  const buffered_ls = turf.buffer(lineString, 10, {units: 'meters'});
  const poly_str = buffered_ls.geometry.coordinates.flat().map(([lat, lon]) => [lon, lat]).flat().join(" ");
  const queryData = `[out:json];way(poly:"${poly_str}");out geom;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "form/multipart" },
          body: `data=${encodeURIComponent(queryData)}`,
        });
  const elements = (await response.json()).elements;
  const featureCollection = {
      type: "FeatureCollection",
      features: [],
  }
  const ways = elements.filter(item =>
      item.type === 'way' &&
      item.tags !== undefined &&
      item.tags.highway !== undefined &&
      item.tags.highway !== "steps");
  for (const way of ways) {
    const distances = [];
    for (const point of way.geometry) {
      const {lon, lat} = point;
      const nodeCoord = [lon, lat];
      const nodeDistance = turf.pointToLineDistance(nodeCoord, lineString, {units: 'meters'});
      distances.push(nodeDistance);
    }
    featureCollection.features.push({
      type: 'Feature',
      properties: {
        matched: previouslyMatchedOsmIds != null ? previouslyMatchedOsmIds.includes(way.id) : (distances.reduce((a, b) => a + b, 0) / distances.length) < 2,
        way: way.id,
        tags: way.tags,
        nodes: way.nodes,
      },
      geometry: {type: 'LineString', coordinates: way.geometry.map(p => [p.lon, p.lat])}});
  }
  
  vectorSource.addFeatures(new GeoJSON().readFeatures(featureCollection, { featureProjection: 'EPSG:3857' }));
  
  map.getView().fit(vectorSource.getExtent());

  btnNext.disabled = false;
  btnSave.disabled = false;
  rowNumText.disabled = false;
  hintElement.innerHTML = "";
}

async function saveResult() {
  btnNext.disabled = true;
  btnSave.disabled = true;
  rowNumText.disabled = true;
  hintElement.innerHTML = "wird gespeichert ...";

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
          munichways_description: munichwaysBeschreibung,
          munichways_current: munichwaysIst,
          munichways_target: munichwaysSoll,
          munichways_mapillary_link: munichwaysMapillaryLink,
          munichways_color: munichwaysFarbe,
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
  
  btnNext.disabled = false;
  btnSave.disabled = false;
  rowNumText.disabled = false;
  hintElement.innerHTML = "";
}

editRow(currentRow);

btnNext.onclick = () => {
  currentRow++;
  editRow(currentRow);
};

btnSave.onclick = () => {
  saveResult();
};

rowNumText.onchange = (e) => {
  let temp = currentRow;
  currentRow = parseInt(rowNumText.value);
  if (isNaN(currentRow)) {
    currentRow = temp;
    rowNumText.value = currentRow;
    return;
  }
  editRow(currentRow);
};

linkShowToken.onclick = () => {
  prompt("Dein aktuelles Zugriffstoken lautet:", accessToken);
};