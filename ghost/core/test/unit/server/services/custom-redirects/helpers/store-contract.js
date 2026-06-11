"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStoreContract = runStoreContract;
const strict_1 = __importDefault(require("node:assert/strict"));
function runStoreContract({ createStore }) {
    describe('RedirectsStore contract', function () {
        let store;
        beforeEach(async function () {
            store = await createStore();
        });
        describe('getAll', function () {
            it('returns an empty array when no redirects have been stored', async function () {
                const result = await store.getAll();
                strict_1.default.deepEqual(result, []);
            });
            it('returns data that callers cannot mutate in place', async function () {
                await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
                const firstRead = await store.getAll();
                firstRead.push({ from: '/x', to: '/y', permanent: false });
                firstRead[0].to = '/mutated';
                strict_1.default.deepEqual(await store.getAll(), [
                    { from: '/a', to: '/b', permanent: true }
                ]);
            });
        });
        describe('replaceAll', function () {
            it('persists redirects so getAll returns the same RedirectConfig[]', async function () {
                const redirects = [
                    { from: '/old/', to: '/new/', permanent: true },
                    { from: '^/post/[0-9]+/(.+)$', to: '/$1', permanent: false }
                ];
                await store.replaceAll(redirects);
                strict_1.default.deepEqual(await store.getAll(), redirects);
            });
            it('overwrites previously stored redirects rather than appending', async function () {
                await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
                await store.replaceAll([{ from: '/c', to: '/d', permanent: false }]);
                strict_1.default.deepEqual(await store.getAll(), [
                    { from: '/c', to: '/d', permanent: false }
                ]);
            });
            it('clears all redirects when called with an empty array', async function () {
                await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
                await store.replaceAll([]);
                strict_1.default.deepEqual(await store.getAll(), []);
            });
            it('does not retain a reference to the input array (caller mutations do not leak)', async function () {
                const redirects = [{ from: '/a', to: '/b', permanent: true }];
                await store.replaceAll(redirects);
                redirects.push({ from: '/c', to: '/d', permanent: false });
                redirects[0].to = '/mutated';
                strict_1.default.deepEqual(await store.getAll(), [
                    { from: '/a', to: '/b', permanent: true }
                ]);
            });
        });
    });
}
