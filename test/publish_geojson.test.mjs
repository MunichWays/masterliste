import test from 'node:test';
import assert from 'node:assert/strict';
import {files, publishDrive, publishFtp} from '../scripts/publish_geojson.mjs';

const contents = new Map(files.map(name => [name, 'new-' + name]));
const env = {FTP_SERVER: 'example.org', FTP_USERNAME: 'user', FTP_PASSWORD: 'password'};
const ftpUrl = 'ftp://' + env.FTP_SERVER + '/App/';
const now = new Date('2026-10-07T18:00:00.000Z');

test('Drive updates only current files and preserves IDs without backups', async () => {
    const calls = [];
    await publishDrive(contents, 'folder', 'token', async (url, options) => {
        calls.push({url, ...options});
        if (url.includes('?q=')) return Response.json({files: files.map((name, i) => ({name, id: String(i)}))});
        return Response.json({});
    });
    assert.equal(calls.length, 6);
    for (const [i, call] of calls.slice(1).entries()) {
        assert.equal(call.method, 'PATCH');
        assert.ok(call.url.includes('files/' + i + '?'));
        assert.equal(call.body, contents.get(files[i]));
    }
    assert.ok(calls.every(call => !call.url.includes('alt=media')));
});

test('Drive first publication creates only the five current names', async () => {
    const created = [];
    await publishDrive(contents, 'folder', 'token', async (url, options) => {
        if (url.includes('?q=')) return Response.json({files: []});
        if (options.method === 'POST') {
            created.push(JSON.parse(options.body).name);
            return Response.json({id: String(created.length)});
        }
        return Response.json({});
    });
    assert.deepEqual(created, files);
});

test('FTP archives all old versions in App/save before replacing current files in App', () => {
    const calls = [];
    publishFtp(contents, env, (command, args, options) => {
        calls.push({args, options});
        return {status: 0, stdout: Buffer.from('old-' + args.at(-1))};
    }, now);
    assert.equal(calls.length, 15);
    for (const [i, name] of files.entries()) {
        assert.equal(calls[i].args.at(-1), ftpUrl + name);
        const backup = calls[5 + i];
        assert.equal(backup.args.at(-1), ftpUrl + 'save/' + name.replace('.geojson', '_2026-10-07T18-00-00.000Z.geojson'));
        assert.equal(backup.options.input.toString(), 'old-' + ftpUrl + name);
        assert.ok(backup.args.includes('--ftp-create-dirs'));
        const current = calls[10 + i];
        assert.equal(current.args.at(-1), ftpUrl + name);
        assert.equal(current.options.input, contents.get(name));
    }
    for (const call of calls) assert.ok(!call.args.join(' ').includes('password'));
});

test('FTP first run skips missing files and uploads current versions', () => {
    const calls = [];
    publishFtp(contents, env, (command, args, options) => {
        calls.push({args, options});
        return {status: calls.length <= 5 ? 78 : 0};
    }, now);
    assert.equal(calls.length, 10);
    assert.ok(calls.every(call => !call.args.at(-1).includes('/save/')));
});

test('FTP download or archive failure prevents replacing any current file', () => {
    for (const failureAt of [3, 7]) {
        const calls = [];
        assert.throws(() => publishFtp(contents, env, (command, args) => {
            calls.push(args);
            return {status: calls.length === failureAt ? 67 : 0, stdout: Buffer.from('old')};
        }, now), /FTP .* failed/);
        assert.equal(calls.length, failureAt);
        assert.ok(calls.filter(args => args.includes('--upload-file')).every(args => args.at(-1).includes('/App/save/')));
    }
});

test('FTP rejects a server value containing a protocol or path', () => {
    assert.throws(() => publishFtp(contents, {...env, FTP_SERVER: 'ftp://example.org/download/'}, () => {
        assert.fail('Must reject before contacting FTP');
    }, now), /hostname/);
});

test('FTP supports accounts rooted directly in App', () => {
    const urls = [];
    publishFtp(contents, {...env, FTP_PATH: '/'}, (command, args) => {
        urls.push(args.at(-1));
        return {status: 0, stdout: Buffer.from('old')};
    }, now);
    assert.equal(urls[0], 'ftp://example.org/' + files[0]);
    assert.ok(urls[5].startsWith('ftp://example.org/save/'));
    assert.equal(urls[10], 'ftp://example.org/' + files[0]);
});

test('FTP error includes curl diagnostics and redacts the password', () => {
    assert.throws(() => publishFtp(contents, env, () => ({status: 60, stderr: Buffer.from('TLS error password')}), now), error => {
        assert.match(error.message, /curl exit 60/);
        assert.match(error.message, /TLS error/);
        assert.ok(!error.message.includes('password'));
        return true;
    });
});
