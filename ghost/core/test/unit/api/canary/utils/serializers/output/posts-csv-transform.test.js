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
const consumers_1 = require("node:stream/consumers");
const posts_csv_transform_1 = require("../../../../../../../core/server/api/endpoints/utils/serializers/output/posts-csv-transform");
const papaparse = __importStar(require("papaparse"));
describe('Unit: posts CSV streaming transform', function () {
    it('Transforms a stream of objects into CSV matching papaparse output', async function () {
        const data = [
            { id: '1', title: 'First Post', status: 'published' },
            { id: '2', title: 'Second, "Quoted" Post', status: 'sent' }
        ];
        const source = node_stream_1.Readable.from(data, { objectMode: true });
        const csvTransform = (0, posts_csv_transform_1.createCSVTransform)();
        source.pipe(csvTransform);
        const csvOutput = await (0, consumers_1.text)(csvTransform);
        const expected = papaparse.unparse(data, {
            escapeFormulae: true,
            newline: '\r\n'
        });
        strict_1.default.equal(csvOutput, expected);
    });
    it('Forwards transform errors to the stream pipeline', async function () {
        const csvTransform = (0, posts_csv_transform_1.createCSVTransform)();
        const boom = new Error('boom');
        const errorPromise = (0, node_events_1.once)(csvTransform, 'error');
        csvTransform.on('data', () => { });
        // Object.keys(proxy) invokes the ownKeys trap, which throws -
        // exercises the catch in transform() on the first chunk.
        const exploding = new Proxy({}, {
            ownKeys() {
                throw boom;
            }
        });
        csvTransform.write(exploding);
        const [err] = await errorPromise;
        strict_1.default.equal(err, boom);
    });
    it('Emits no output when the input stream is empty', async function () {
        const source = node_stream_1.Readable.from([], { objectMode: true });
        const csvTransform = (0, posts_csv_transform_1.createCSVTransform)();
        source.pipe(csvTransform);
        const output = await (0, consumers_1.text)(csvTransform);
        strict_1.default.equal(output, '');
    });
});
