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

## Automatische Veröffentlichung

Der Workflow „Build and publish MunichWays GeoJSON“ läuft sonntags gegen
20 Uhr Europe/Berlin (Sommer- und Winterzeit) sowie manuell. GitHub kann
geplante Läufe verzögert starten. Alle fünf Dateien werden als Artefakt
gesichert und anschließend in Google Drive und per FTP mit TLS veröffentlicht.
In Google Drive liegen nur die aktuellen Dateien; der Workflow erzeugt dort
keine Sicherungskopien. Bestehende Dateien werden aktualisiert, damit ihre IDs
und Links erhalten bleiben.

Die FTP-Veröffentlichung übernimmt die lftp-Schritte aus dem
[radlvorrangnetz-export-Workflow](https://github.com/MunichWays/radlvorrangnetz-export/blob/main/.github/workflows/export.yml).
Das FTP-Konto startet bereits im Web-Verzeichnis `App/`: Aktuelle Dateien
werden nach `.` hochgeladen, datierte Kopien nach `/save` (Web-Pfad `App/save/`).
Archiviert werden die neu erzeugten Dateien des jeweiligen Laufs, beispielsweise
`happy_bike_level_munich_2026-10-07_18-00-00.geojson` (UTC).
Bestehende Archive bleiben erhalten. Nach dem Upload prüft lftp alle fünf
aktuellen Dateien und ihre fünf datierten Kopien auf Vorhandensein.
TLS- und Zertifikats-Einstellungen entsprechen dem Referenz-Workflow.

Repository-Konfiguration unter Settings → Secrets and variables → Actions:

- Secret `SERVICE_ACCOUNT_JSON`: bestehendes Google-Servicekonto mit
  Lesezugriff auf die Quelldaten für den Export.
- Secret `GOOGLE_DRIVE_UPLOAD_SERVICE_ACCOUNT_JSON`: separates Upload-Servicekonto
  mit Schreibzugriff auf den Download-Ordner in der Google-Workspace-Geteilten Ablage.
- Variable `GOOGLE_DRIVE_DOWNLOAD_FOLDER_ID`: ID des Google-Drive-Download-Ordners
  (laut Issue #4: `1u4Q1dyMuB1n0j2_YgQxiK_xfLVC1VYE9`; vor Einrichtung prüfen).
- Variablen `FTP_SERVER` (z. B. `ftp.munichways.de`) und `FTP_USERNAME`;
  Secret `FTP_PASSWORD`. Das Konto muss im Verzeichnis `App/` starten.
  `FTP_URL` und `FTP_PATH` werden nicht verwendet.

Die Variablen und Secrets können in den Organisationseinstellungen von MunichWays
unter Secrets and variables → Actions liegen. Die Zugriffsrichtlinie muss das
Repository `masterliste` einschließen.

Fehlende Konfiguration oder Uploadfehler lassen den Workflow fehlschlagen;
das Build-Artefakt bleibt verfügbar. Die beiden Ziele werden nacheinander
aktualisiert; bei einem Fehler kann ein Ziel bereits aktualisiert sein.
Das Servicekonto benötigt einen Shared Drive oder eine passende Google-Workspace-
Konfiguration mit Speicherberechtigung, um neue Dateien anzulegen.

Der npm-Cache enthält nur heruntergeladene Abhängigkeiten und wird über
`package-lock.json` versioniert. Er muss nicht gelöscht werden. Der lokale
`cache/` für Drive-Quelldaten und `map.osm.pbf` werden im Workflow nicht
zwischengespeichert und daher bei jedem Lauf frisch geladen.
