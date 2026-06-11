"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const auto_filling_map_1 = require("../../../../core/server/lib/auto-filling-map");
describe('AutoFillingMap', function () {
    it('computes on first get, then returns the cached promise', async function () {
        let callCount = 0;
        const map = new auto_filling_map_1.AutoFillingMap(async (key) => {
            callCount += 1;
            return `value-${key}`;
        });
        const first = await map.get('a');
        const second = await map.get('a');
        strict_1.default.equal(first, 'value-a');
        strict_1.default.equal(second, 'value-a');
        strict_1.default.equal(callCount, 1);
    });
    it('caches each key independently', async function () {
        let callCount = 0;
        const map = new auto_filling_map_1.AutoFillingMap(async (key) => {
            callCount += 1;
            return `value-${key}`;
        });
        strict_1.default.equal(await map.get('a'), 'value-a');
        strict_1.default.equal(await map.get('b'), 'value-b');
        strict_1.default.equal(callCount, 2);
    });
    it('dedupes concurrent in-flight calls for the same key', async function () {
        let callCount = 0;
        const map = new auto_filling_map_1.AutoFillingMap(async (key) => {
            callCount += 1;
            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });
            return `value-${key}`;
        });
        const results = await Promise.all([map.get('a'), map.get('a'), map.get('a')]);
        strict_1.default.deepEqual(results, ['value-a', 'value-a', 'value-a']);
        strict_1.default.equal(callCount, 1);
    });
    it('delete(key) clears one entry; the next get recomputes', async function () {
        let callCount = 0;
        const map = new auto_filling_map_1.AutoFillingMap(async (key) => {
            callCount += 1;
            return `v${callCount}-${key}`;
        });
        await map.get('a');
        await map.get('b');
        map.delete('a');
        await map.get('a'); // recomputes → callCount 3
        await map.get('b'); // still cached
        strict_1.default.equal(callCount, 3);
    });
    it('clear() empties every entry', async function () {
        let callCount = 0;
        const map = new auto_filling_map_1.AutoFillingMap(async (key) => {
            callCount += 1;
            return `value-${key}`;
        });
        await map.get('a');
        await map.get('b');
        map.clear();
        await map.get('a');
        await map.get('b');
        strict_1.default.equal(callCount, 4);
    });
});
