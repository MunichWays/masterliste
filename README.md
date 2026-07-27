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
