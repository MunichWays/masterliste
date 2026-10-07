import {readFile} from 'node:fs/promises';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateKey, sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const files = [
    'IST_RadlVorrangNetz_MunichWays_V20.geojson',
    'IST_RadlVorrangNetz_Oberbayern_V20.geojson',
    'happy_bike_level_munich.geojson',
    'happy_bike_level_munich_RV.geojson',
    'happy_bike_level_oberbayern.geojson',
];

async function checked(response) {
    if (!response.ok) throw new Error('Google API request failed: ' + response.status);
    return response;
}

export async function getToken(account, request = fetch) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({alg: 'RS256', typ: 'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token',
        iat: now, exp: now + 3600})).toString('base64url');
    const unsigned = header + '.' + payload;
    const assertion = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned),
        createPrivateKey(account.private_key)).toString('base64url');
    const response = await checked(await request('https://oauth2.googleapis.com/token', {
        method: 'POST', body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion}),
    }));
    const result = await response.json();
    if (!result.access_token) throw new Error('Google did not return an access token');
    return result.access_token;
}

export async function publishDrive(contents, folder, token, request = fetch) {
    if (!/^[A-Za-z0-9_-]+$/.test(folder)) throw new Error('Invalid Google Drive folder ID');
    const headers = {Authorization: 'Bearer ' + token};
    const endpoint = 'https://www.googleapis.com/drive/v3/files';
    const query = "'" + folder + "' in parents and trashed = false";
    const existing = new Map();
    let pageToken;
    do {
        const params = new URLSearchParams({q: query, fields: 'nextPageToken,files(id,name)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'});
        if (pageToken) params.set('pageToken', pageToken);
        const page = await (await checked(await request(endpoint + '?' + params, {headers}))).json();
        for (const file of page.files) {
            if (!files.includes(file.name)) continue;
            if (existing.has(file.name)) throw new Error('Duplicate download file: ' + file.name);
            existing.set(file.name, file.id);
        }
        pageToken = page.nextPageToken;
    } while (pageToken);
    async function upload(name, body) {
        let id = existing.get(name);
        if (!id) {
            const response = await checked(await request(endpoint + '?supportsAllDrives=true', {
                method: 'POST', headers: {...headers, 'Content-Type': 'application/json'},
                body: JSON.stringify({name, parents: [folder], mimeType: 'application/geo+json'}),
            }));
            id = (await response.json()).id;
            existing.set(name, id);
        }
        await checked(await request('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&supportsAllDrives=true', {
            method: 'PATCH', headers: {...headers, 'Content-Type': 'application/geo+json'}, body,
        }));
    }
    for (const name of files) await upload(name, contents.get(name));
}

export function publishFtp(contents, env, run = spawnSync, now = new Date()) {
    if (!/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(env.FTP_SERVER || '')) {
        throw new Error('FTP_SERVER must be a hostname, optionally with a port');
    }
    const base = new URL('ftp://' + env.FTP_SERVER + '/App/');
    const timestamp = now.toISOString().replaceAll(':', '-');
    // Credentials go through stdin, never command-line arguments or logs.
    const escape = value => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r');
    const credentials = 'user = "' + escape(env.FTP_USERNAME + ':' + env.FTP_PASSWORD) + '"\n';
    const url = name => new URL(name, base).href;
    const invoke = (args, input) => run('curl', ['--silent', '--show-error', '--fail', '--ssl-reqd', '--connect-timeout', '30', '--max-time', '600', '--config', '-', ...args], {input, maxBuffer: 256 * 1024 * 1024});
    // Read every existing version before changing any current file.
    const backups = new Map();
    for (const name of files) {
        const old = invoke([url(name)], credentials);
        if (old.error || (old.status !== 0 && old.status !== 78)) {
            throw new Error('FTP download failed: ' + name);
        }
        if (old.status === 0) backups.set(name, old.stdout);
    }
    const directory = mkdtempSync(join(tmpdir(), 'geojson-ftp-'));
    const config = join(directory, 'curl.conf');
    try {
        writeFileSync(config, credentials, {mode: 0o600});
        const send = (name, body) => {
            const result = run('curl', ['--silent', '--show-error', '--fail', '--ssl-reqd', '--connect-timeout', '30', '--max-time', '600', '--config', config, '--ftp-create-dirs', '--upload-file', '-', url(name)],
                {input: body, maxBuffer: 1024 * 1024});
            if (result.error || result.status !== 0) throw new Error('FTP upload failed: ' + name);
        };
        for (const [name, body] of backups) {
            send('save/' + name.replace('.geojson', '_' + timestamp + '.geojson'), body);
        }
        for (const name of files) send(name, contents.get(name));
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
}

export async function main(env = process.env) {
    for (const key of ['GOOGLE_DRIVE_UPLOAD_SERVICE_ACCOUNT_JSON', 'GOOGLE_DRIVE_DOWNLOAD_FOLDER_ID', 'FTP_SERVER', 'FTP_USERNAME', 'FTP_PASSWORD']) {
        if (!env[key]) throw new Error('Missing configuration: ' + key);
    }
    const contents = new Map();
    for (const name of files) {
        const body = await readFile(name, 'utf8');
        const data = JSON.parse(body);
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length === 0) throw new Error('Invalid or empty GeoJSON: ' + name);
        contents.set(name, body);
    }
    const token = await getToken(JSON.parse(env.GOOGLE_DRIVE_UPLOAD_SERVICE_ACCOUNT_JSON));
    await publishDrive(contents, env.GOOGLE_DRIVE_DOWNLOAD_FOLDER_ID, token);
    publishFtp(contents, env);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
