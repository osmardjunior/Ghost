"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_events_1 = require("node:events");
const node_stream_1 = require("node:stream");
const membersSerializer = require('../../../../../../../core/server/api/endpoints/utils/serializers/output/members');
function makeResponse(headers, chunks = []) {
    const response = new node_stream_1.Writable({
        write(chunk, _encoding, callback) {
            chunks.push(chunk);
            callback();
        }
    });
    response.setHeader = (key, value) => {
        headers[key] = value;
    };
    response.getHeader = () => undefined;
    return response;
}
describe('Unit: members CSV export serializer', function () {
    it('Streams CSV response using the filename provided by the endpoint', async function () {
        const source = node_stream_1.Readable.from([{ id: '1', email: 'jamie@example.com' }], { objectMode: true });
        const frame = {};
        const headers = {};
        const chunks = [];
        const nextCalls = [];
        membersSerializer.exportCSV({ data: source, filename: 'my-site.ghost.members.2026-06-02.csv' }, null, frame);
        const response = makeResponse(headers, chunks);
        frame.response(null, response, (err) => {
            nextCalls.push(err);
        });
        await (0, node_events_1.once)(response, 'finish');
        strict_1.default.equal(headers['Content-Type'], 'text/csv; charset=utf-8');
        strict_1.default.equal(headers['Content-Disposition'], 'Attachment; filename="my-site.ghost.members.2026-06-02.csv"');
        strict_1.default.equal(headers['Cache-Control'], 'no-transform');
        // The CSV header row should have been written through the transform
        strict_1.default.match(Buffer.concat(chunks).toString(), /^id,email,name,note/);
        strict_1.default.deepEqual(nextCalls, []);
    });
    it('Falls back to the legacy filename when the endpoint does not provide one', async function () {
        const source = node_stream_1.Readable.from([{ id: '1', email: 'jamie@example.com' }], { objectMode: true });
        const frame = {};
        const headers = {};
        membersSerializer.exportCSV({ data: source }, null, frame);
        const response = makeResponse(headers);
        frame.response(null, response, () => { });
        await (0, node_events_1.once)(response, 'finish');
        strict_1.default.match(headers['Content-Disposition'], /^Attachment; filename="members\.\d{4}-\d{2}-\d{2}\.csv"$/);
    });
    it('Passes response stream errors to next', async function () {
        const sourceError = new Error('response failed');
        const source = node_stream_1.Readable.from([{ id: '1', email: 'jamie@example.com' }], { objectMode: true });
        const frame = {};
        membersSerializer.exportCSV({ data: source, filename: 'my-site.ghost.members.2026-06-02.csv' }, null, frame);
        const response = new node_stream_1.Writable({
            write(_chunk, _encoding, callback) {
                callback(sourceError);
            }
        });
        response.setHeader = () => { };
        response.getHeader = () => undefined;
        response.on('error', () => { });
        const err = await new Promise((resolve) => {
            frame.response(null, response, resolve);
        });
        strict_1.default.equal(err, sourceError);
    });
    it('Returns a CSV string for non-stream (array) data', function () {
        const frame = {};
        membersSerializer.exportCSV({ data: [{ id: '1', email: 'jamie@example.com' }] }, null, frame);
        strict_1.default.equal(typeof frame.response, 'string');
        strict_1.default.match(frame.response, /jamie@example\.com/);
    });
});
