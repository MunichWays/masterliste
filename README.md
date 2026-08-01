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

`node create_geojson.mjs` erzeugt fünf Dateien:

- `IST_RadlVorrangNetz_Oberbayern_V20.geojson`: vollständiger bisheriger
  V20-Datenbestand für Oberbayern.
- `IST_RadlVorrangNetz_MunichWays_V20.geojson`: vollständige V20-Felder,
  begrenzt auf München. Masterlisten-Einträge werden über das Präfix `LHM`
  gefiltert, reine OSM-Einträge über die amtlichen Stadtbezirksgrenzen.
- `happy_bike_level_munich.geojson`: schlanke München-Datei.
- `happy_bike_level_munich_RV.geojson`: schlanke München-Datei, die nur
  RadlVorrang-Strecken enthält. Sie ist als mitgeliefertes App-Asset vorgesehen.
- `happy_bike_level_oberbayern.geojson`: schlanke Oberbayern-Datei zum
  Nachladen und Zwischenspeichern in der App.

Die schlanke München-Datei enthält nur Geometrie sowie `munichways_id`,
`osm_id`, `color` und `munichways_mw_rv_route`. Features mit `color: "blue"`
(`class:bicycle=0`) werden nicht exportiert. Die Stadtbezirksgrenzen stammen
vom WFS des GeodatenService München und werden in WGS84 geladen.
`happy_bike_level_munich_RV.geojson` enthält davon nur Features, deren
`munichways_mw_rv_route` mindestens einen Wert außer `-` enthält.

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
