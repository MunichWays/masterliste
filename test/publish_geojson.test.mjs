import test from 'node:test';
import assert from 'node:assert/strict';
import {files, publishDrive} from '../scripts/publish_geojson.mjs';

const contents = new Map(files.map(name => [name, 'new-' + name]));
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
