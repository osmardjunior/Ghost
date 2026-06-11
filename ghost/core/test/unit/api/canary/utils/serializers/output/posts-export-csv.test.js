"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_events_1 = require("node:events");
const node_stream_1 = require("node:stream");
const papaparse = __importStar(require("papaparse"));
const postsSerializer = require('../../../../../../../core/server/api/endpoints/utils/serializers/output/posts');
describe('Unit: posts CSV export serializer', function () {
    it('Streams CSV response with headers', async function () {
        const data = [{ id: '1', title: 'Post' }];
        const source = node_stream_1.Readable.from(data, { objectMode: true });
        const frame = {};
        const headers = {};
        const chunks = [];
        const nextCalls = [];
        postsSerializer.exportCSV({ data: source, filename: 'test-blog.ghost.analytics.2026-06-02.csv' }, null, frame);
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
        frame.response(null, response, (err) => {
            nextCalls.push(err);
        });
        await (0, node_events_1.once)(response, 'finish');
        const expected = papaparse.unparse(data, {
            escapeFormulae: true,
            newline: '\r\n'
        });
        strict_1.default.equal(Buffer.concat(chunks).toString(), expected);
        strict_1.default.equal(headers['Content-Type'], 'text/csv; charset=utf-8');
        strict_1.default.equal(headers['Content-Disposition'], 'Attachment; filename="test-blog.ghost.analytics.2026-06-02.csv"');
        strict_1.default.equal(headers['Cache-Control'], 'no-transform');
        strict_1.default.deepEqual(nextCalls, []);
    });
    it('Appends no-transform to an existing Cache-Control header', async function () {
        const source = node_stream_1.Readable.from([{ id: '1', title: 'Post' }], { objectMode: true });
        const frame = {};
        const headers = {};
        postsSerializer.exportCSV({ data: source, filename: 'test-blog.ghost.analytics.2026-06-02.csv' }, null, frame);
        const response = new node_stream_1.Writable({
            write(_chunk, _encoding, callback) {
                callback();
            }
        });
        response.setHeader = (key, value) => {
            headers[key] = value;
        };
        response.getHeader = (key) => {
            return key === 'Cache-Control' ? 'public, max-age=3600' : undefined;
        };
        frame.response(null, response, () => { });
        await (0, node_events_1.once)(response, 'finish');
        strict_1.default.equal(headers['Cache-Control'], 'public, max-age=3600, no-transform');
    });
    it('Does not duplicate an existing no-transform Cache-Control directive', async function () {
        const source = node_stream_1.Readable.from([{ id: '1', title: 'Post' }], { objectMode: true });
        const frame = {};
        const headers = {};
        postsSerializer.exportCSV({ data: source, filename: 'test-blog.ghost.analytics.2026-06-02.csv' }, null, frame);
        const response = new node_stream_1.Writable({
            write(_chunk, _encoding, callback) {
                callback();
            }
        });
        response.setHeader = (key, value) => {
            headers[key] = value;
        };
        response.getHeader = (key) => {
            return key === 'Cache-Control' ? 'public, max-age=3600, No-Transform' : undefined;
        };
        frame.response(null, response, () => { });
        await (0, node_events_1.once)(response, 'finish');
        strict_1.default.equal(headers['Cache-Control'], undefined);
    });
    it('Passes response stream errors to next', async function () {
        const sourceError = new Error('response failed');
        const source = node_stream_1.Readable.from([{ id: '1', title: 'Post' }], { objectMode: true });
        const frame = {};
        postsSerializer.exportCSV({ data: source, filename: 'test-blog.ghost.analytics.2026-06-02.csv' }, null, frame);
        const response = new node_stream_1.Writable({
            write(_chunk, _encoding, callback) {
                callback(sourceError);
            }
        });
        response.setHeader = () => { };
        response.getHeader = () => { };
        response.on('error', () => { });
        const err = await new Promise((resolve) => {
            frame.response(null, response, resolve);
        });
        strict_1.default.equal(err, sourceError);
    });
    it('Passes missing filenames to next', async function () {
        const source = node_stream_1.Readable.from([{ id: '1', title: 'Post' }], { objectMode: true });
        const frame = {};
        const response = new node_stream_1.Writable({
            write(_chunk, _encoding, callback) {
                callback();
            }
        });
        const headers = {};
        response.setHeader = (key, value) => {
            headers[key] = value;
        };
        response.getHeader = () => undefined;
        postsSerializer.exportCSV({ data: source }, null, frame);
        const err = await new Promise((resolve) => {
            frame.response(null, response, resolve);
        });
        strict_1.default.equal(err.message, 'Missing CSV export filename');
        strict_1.default.deepEqual(headers, {});
    });
});
