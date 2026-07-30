import {readFileSync, writeFileSync} from "fs";
import {buildHappyBikeLevelGeoJson} from "../happy_bike_level.mjs";

const inputPath = process.argv[2] ?? "IST_RadlVorrangNetz_MunichWays_V20.geojson";
const outputPath = process.argv[3] ?? "happy_bike_level.geojson";

const source = JSON.parse(readFileSync(inputPath, "utf8"));
const result = buildHappyBikeLevelGeoJson(source);

writeFileSync(outputPath, JSON.stringify(result));
console.log(`wrote ${result.features.length} features to ${outputPath}`);
