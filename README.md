# Masterliste

Webanwendung um die Einträge der [MunichWays Masterliste](https://docs.google.com/spreadsheets/d/1PZ_4oEh7ycMILtyvlzan2lax4qjPPQeQLvmxTJbDpds/edit?usp=sharing) mit OSM zu verknüpfen.

## Installation

1. NPM und Node müssen lokal installiert sein (bspw. über https://nodejs.org/en/download/).
2. Installation der Abhängigkeiten über `npm install`.
3. Starten der Anwendung über `npm start`.

## Bedienung
https://github.com/MunichWays/masterliste/wiki

## Entwicklerinfo

- `npm start` erstellt zuerst `dist/main.js` und startet danach `server.mjs` auf Port 8080.
- OSM-Daten werden über den lokalen Proxy `/osm-api/*` von der offiziellen OSM-API geladen. Dadurch werden Browser-CORS-Probleme vermieden.
- Nach Änderungen Browser-Cache leeren bzw. die Versionskennung in `index.html` anpassen und mit `Strg+F5` neu laden.
- Die aktuell geladene Version ist als Build-Kennung in der Oberfläche sichtbar.

## GeoJSON-Export

`node create_geojson.mjs` erzeugt weiterhin die vollständige Datei
`IST_RadlVorrangNetz_MunichWays_V20.geojson` und zusätzlich die schlanke Datei
`happy_bike_level.geojson`.

Die schlanke Datei enthält nur Geometrie sowie `munichways_id`, `osm_id`,
`color` und `munichways_mw_rv_route`. Features mit `color: "blue"`
(`class:bicycle=0`) werden nicht exportiert.

Eine vorhandene V20-Datei kann ohne Google-Zugang und OSM-Download lokal
konvertiert werden:

```sh
npm run build:happy-bike-level
```

Eigene Ein- und Ausgabepfade können direkt an das Script übergeben werden:

```sh
node scripts/build_happy_bike_level.mjs input.geojson output.geojson
```

Tests:

```sh
npm test
```
