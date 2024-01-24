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
const SOLL_MASSNAHMEN_INDEX = 3;
const BESCHREIBUNG_INDEX = 4;
const MAPILLARY_LINK_INDEX = 5;
const CARTO_GEOM_INDEX = 6;
const OSM_ID_INDEX = 7;
const OSM_SHEET_ROW_INDEX = 8;

let currentRow = 1;

// do oauth
const hashParams = new Map(window.location.hash.slice(1).split("&").map(part => part.split("=")));
let accessToken = null;
if (!hashParams.has("access_token")) {
  window.location.assign("https://accounts.google.com/o/oauth2/v2/auth?client_id=241672553209-fhu58jbhvt0t538d6o8ukfbh6k20b53r.apps.googleusercontent.com&redirect_uri=http://localhost:8080&response_type=token&scope=https://www.googleapis.com/auth/spreadsheets");
  throw new Error("need to login first");
} else {
  accessToken = hashParams.get("access_token");
  window.history.replaceState(null, null, window.location.toString().split("#")[0]);
}

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
}

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
}

hintElement.innerHTML = "<h2>wird geladen ...</h2>";


let munichWaysId = null;

async function editRow(row) {
  hintElement.innerHTML = "<h2>wird geladen ...</h2>";
  rowNumText.value = row;
  btnNext.disabled = true;
  btnSave.disabled = true;
  rowNumText.disabled = true;
  vectorSource.clear();
  baseVectorSource.clear();

  const dataRow = await fetchSheetRow(row);
  munichWaysId = dataRow[MUNICHWAYS_ID_INDEX];
  const name = dataRow[NAME_INDEX];
  const istSituation = dataRow[IST_SITUATION_INDEX];
  const sollMassnahmen = dataRow[SOLL_MASSNAHMEN_INDEX];
  const beschreibung = dataRow[BESCHREIBUNG_INDEX];
  const mapillaryLink = dataRow[MAPILLARY_LINK_INDEX];
  const osmId = dataRow[OSM_ID_INDEX];
  const osmSheetRow = dataRow[OSM_SHEET_ROW_INDEX];

  infoElement.innerHTML = `<h3>Masterlisten Element #${row - 1}</h3>
  <b>MunichWays_ID</b>:&nbsp;${munichWaysId}<br />
  <b>Name</b>: ${name}<br />
  <b>IST_Situation</b>: ${istSituation}<br />
  <b>SOLL_Massnahmen</b>: ${sollMassnahmen}<br />
  <b>Beschreibung</b>: ${beschreibung}<br />`;
  if (mapillaryLink?.trim().length > 0) {
    infoElement.innerHTML += `<a href="${mapillaryLink}" target="_blank">In Mapillary öffnen</a><br />`;
  }
  if (osmId?.trim().length > 0) {
    infoElement.innerHTML += `☑️ wurde bereits bearbeitet (Zeile ${osmSheetRow})`;
  } else {
    infoElement.innerHTML += `˟ wurde noch nicht bearbeitet`;
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
    for (let i = 1; i < way.nodes.length; i++) {
      const [segmentStart, segmentEnd] = way.geometry.slice(i - 1, i + 1).map(c => [c.lon, c.lat]);
      const distanceStart = turf.pointToLineDistance(segmentStart, lineString, {units: 'meters'});
      const distanceEnd = turf.pointToLineDistance(segmentEnd, lineString, {units: 'meters'});
      const [startNode, endNode] = way.nodes.slice(i - 1, i + 1);
      console.log(osmId, startNode, endNode);
      featureCollection.features.push({
        type: 'Feature',
        properties: {
          matched: osmId != null ?
            osmId.includes(`node/${startNode}`) && osmId.includes(`node/${endNode}`) :
            distanceStart < 2 && distanceEnd < 2,
          way: way.id,
          tags: way.tags,
          nodes: [startNode, endNode],
        },
        geometry: {type: 'LineString', coordinates: [segmentStart, segmentEnd]}});
    }
  }
  
  vectorSource.addFeatures(new GeoJSON().readFeatures(featureCollection, { featureProjection: 'EPSG:3857' }));
  
  map.getView().fit(vectorSource.getExtent());

  btnNext.disabled = false;
  btnSave.disabled = osmId != null;
  rowNumText.disabled = false;
  hintElement.innerHTML = "";
}

async function saveResult() {
  btnNext.disabled = true;
  btnSave.disabled = true;
  rowNumText.disabled = true;
  hintElement.innerHTML = "wird gespeichert ...";

  const selectedSegments = new Map();
  const tags = [];
  vectorSource.forEachFeature((feature) => {
    if (feature.get('matched')) {
      tags.push(feature.get('tags'));
      if (selectedSegments.has(feature.get('way'))) {
        const nodes = selectedSegments.get(feature.get('way'));
        feature.get('nodes').forEach(n => nodes.add(n));
      } else {
        const nodes = new Set();
        feature.get('nodes').forEach(n => nodes.add(n));
        selectedSegments.set(feature.get('way'), nodes);
      }
    }
  });

  const summarizeTag = (tag) => [...new Set(tags.map(t => t[tag]).filter(s => s != null))].join(',');

  const osm_id = [...selectedSegments.entries()].map(([way_id, node_ids]) => `way/${way_id}(${[...node_ids].map(n => `node/${n}`).join(",")})`).join(";");
  const name_osm = summarizeTag('name');
  const surface = summarizeTag('surface');
  const smoothness = summarizeTag('smoothness');
  const class_bicycle_org = summarizeTag('class:bicycle');
  const bicycle = summarizeTag('bicycle');
  const highway = summarizeTag('highway');
  const lit = summarizeTag('lit');
  const width = summarizeTag('width');
  const access = summarizeTag('access');
  const d = new Date();
  const featureLineStrings = [];
  vectorSource.forEachFeature(f => {
    if (f.get("matched")) {
      const wgsCoords = f.getGeometry().getCoordinates().map(coord => transform(coord, 'EPSG:3857', 'EPSG:4326'));
      const featureLineString = `(${wgsCoords.map(c => c.join(" ")).join(",")})`;
      featureLineStrings.push(featureLineString);
    }
  });
  const geom = `MULTILINESTRING(${featureLineStrings.join(",")})`;
  const last_updated = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  appendSheetRow(munichWaysId, osm_id, name_osm, class_bicycle_org, class_bicycle_org, smoothness, surface, bicycle, highway, lit, width, access, geom, last_updated);
  
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