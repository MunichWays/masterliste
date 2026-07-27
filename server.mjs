import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative } from "node:path";

const PORT = Number(process.env.MASTERLISTE_PORT ?? 8080);
const ROOT = process.cwd();
const OSM_API = "https://api.openstreetmap.org/api/0.6";

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

const sendText = (response, status, message) => {
    response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
    });
    response.end(message);
};

const proxyOsmRequest = async (request, response, url) => {
    let upstreamPath;
    if (url.pathname === "/osm-api/map") {
        const bbox = url.searchParams.get("bbox");
        if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(bbox ?? "")) {
            sendText(response, 400, "Ungültige Bounding Box.");
            return;
        }
        upstreamPath = `/map?bbox=${encodeURIComponent(bbox)}`;
    } else {
        const wayMatch = url.pathname.match(/^\/osm-api\/way\/(\d+)\/full$/);
        if (!wayMatch) {
            sendText(response, 404, "Unbekannte OSM-API-Anfrage.");
            return;
        }
        upstreamPath = `/way/${wayMatch[1]}/full`;
    }

    try {
        console.log(`OSM proxy: ${upstreamPath}`);
        const upstream = await fetch(OSM_API + upstreamPath, {
            headers: {
                "Accept": "application/xml",
                "User-Agent": "MunichWays-Masterliste/1.0 (local maintenance tool)",
            },
            signal: AbortSignal.timeout(30000),
        });
        const body = await upstream.arrayBuffer();
        console.log(`OSM proxy response: ${upstream.status}, ${body.byteLength} bytes`);
        response.writeHead(upstream.status, {
            "Content-Type": upstream.headers.get("content-type") ?? "application/xml; charset=utf-8",
            "Cache-Control": "no-store",
        });
        response.end(Buffer.from(body));
    } catch (error) {
        console.error("OSM proxy failed", error);
        sendText(response, 502, error instanceof Error ? error.message : String(error));
    }
};

const serveFile = async (response, url) => {
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = normalize(join(ROOT, pathname));
    if (relative(ROOT, filePath).startsWith("..")) {
        sendText(response, 403, "Zugriff verweigert.");
        return;
    }

    try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
            throw new Error("not a file");
        }
        response.writeHead(200, {
            "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
            "Cache-Control": "no-store",
        });
        createReadStream(filePath).pipe(response);
    } catch {
        sendText(response, 404, "Datei nicht gefunden.");
    }
};

createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method !== "GET") {
        sendText(response, 405, "Nur GET wird unterstützt.");
        return;
    }
    if (url.pathname.startsWith("/osm-api/")) {
        await proxyOsmRequest(request, response, url);
        return;
    }
    await serveFile(response, url);
}).listen(PORT, () => {
    console.log(`Masterliste läuft auf http://localhost:${PORT}`);
});
