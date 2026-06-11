"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const sinon_1 = __importDefault(require("sinon"));
const logging_1 = __importDefault(require("@tryghost/logging"));
const redirects_service_1 = require("../../../../../core/server/services/custom-redirects/redirects-service");
const in_memory_store_1 = require("./helpers/in-memory-store");
describe('UNIT: RedirectsService', function () {
    let store;
    let redirectManager;
    let dryRunManager;
    let createDryRunManager;
    let validate;
    let service;
    beforeEach(function () {
        store = new in_memory_store_1.InMemoryStore();
        redirectManager = {
            removeAllRedirects: sinon_1.default.stub(),
            addRedirect: sinon_1.default.stub().returns('id')
        };
        dryRunManager = {
            addRedirect: sinon_1.default.stub().returns('id')
        };
        createDryRunManager = sinon_1.default.stub().returns(dryRunManager);
        validate = sinon_1.default.stub();
        service = new redirects_service_1.RedirectsService({
            store,
            redirectManager,
            validate,
            createDryRunManager
        });
    });
    afterEach(function () {
        sinon_1.default.restore();
    });
    describe('activate', function () {
        it('clears existing redirects, then loads each one from the store', async function () {
            await store.replaceAll([
                { from: '/a', to: '/b', permanent: true },
                { from: '/c', to: '/d', permanent: false }
            ]);
            await service.activate();
            sinon_1.default.assert.calledOnce(redirectManager.removeAllRedirects);
            sinon_1.default.assert.calledTwice(redirectManager.addRedirect);
            sinon_1.default.assert.calledWithExactly(redirectManager.addRedirect.firstCall, '/a', '/b', { permanent: true });
            sinon_1.default.assert.calledWithExactly(redirectManager.addRedirect.secondCall, '/c', '/d', { permanent: false });
            strict_1.default.ok(redirectManager.removeAllRedirects.calledBefore(redirectManager.addRedirect), 'must clear before adding new redirects');
        });
        it('runs validation against each redirect before loading it', async function () {
            await store.replaceAll([
                { from: '/a', to: '/b', permanent: true },
                { from: '/c', to: '/d', permanent: false }
            ]);
            await service.activate();
            sinon_1.default.assert.calledTwice(validate);
        });
        it('skips and logs invalid individual redirects without crashing', async function () {
            const loggingError = sinon_1.default.stub(logging_1.default, 'error');
            validate.callsFake((batch) => {
                if (batch[0].from === '/bad') {
                    throw new Error('bad regex');
                }
            });
            await store.replaceAll([
                { from: '/ok-1', to: '/x', permanent: true },
                { from: '/bad', to: '/y', permanent: true },
                { from: '/ok-2', to: '/z', permanent: false }
            ]);
            await service.activate();
            sinon_1.default.assert.calledTwice(redirectManager.addRedirect);
            sinon_1.default.assert.calledWithExactly(redirectManager.addRedirect.firstCall, '/ok-1', '/x', { permanent: true });
            sinon_1.default.assert.calledWithExactly(redirectManager.addRedirect.secondCall, '/ok-2', '/z', { permanent: false });
            sinon_1.default.assert.called(loggingError);
        });
        it('skips and logs when the redirect manager rejects an entry', async function () {
            const loggingError = sinon_1.default.stub(logging_1.default, 'error');
            redirectManager.addRedirect.onSecondCall().throws(new Error('manager rejected'));
            await store.replaceAll([
                { from: '/ok-1', to: '/x', permanent: true },
                { from: '/blows-up', to: '/y', permanent: true },
                { from: '/ok-2', to: '/z', permanent: false }
            ]);
            await service.activate();
            sinon_1.default.assert.calledThrice(redirectManager.addRedirect);
            sinon_1.default.assert.called(loggingError);
        });
        it('skips and logs when the redirect manager silently rejects an entry by returning null', async function () {
            const loggingError = sinon_1.default.stub(logging_1.default, 'error');
            redirectManager.addRedirect.onSecondCall().returns(null);
            await store.replaceAll([
                { from: '/ok-1', to: '/x', permanent: true },
                { from: '/silently-rejected', to: '/y', permanent: true },
                { from: '/ok-2', to: '/z', permanent: false }
            ]);
            await service.activate();
            sinon_1.default.assert.calledThrice(redirectManager.addRedirect);
            sinon_1.default.assert.called(loggingError);
        });
        it('logs a distinct warning when every redirect in the store was skipped', async function () {
            const loggingError = sinon_1.default.stub(logging_1.default, 'error');
            validate.throws(new Error('all bad'));
            await store.replaceAll([
                { from: '/a', to: '/b', permanent: true },
                { from: '/c', to: '/d', permanent: false }
            ]);
            await service.activate();
            sinon_1.default.assert.notCalled(redirectManager.addRedirect);
            const messages = loggingError.args.map(([arg]) => arg.message || arg);
            strict_1.default.ok(messages.some(m => /None of the 2 redirect/.test(m)), `expected a zero-survived warning, got: ${JSON.stringify(messages)}`);
        });
        it('is callable independently of replace and re-clears on each call', async function () {
            await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
            await service.activate();
            await service.activate();
            sinon_1.default.assert.calledTwice(redirectManager.removeAllRedirects);
        });
        it('does not retain a reference to the same DynamicRedirectManager across calls', async function () {
            // site.js mounts redirectManager.handleRequest at boot;
            // swapping the manager would dangle that reference.
            const handlerBefore = redirectManager.removeAllRedirects;
            await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
            await service.activate();
            strict_1.default.equal(redirectManager.removeAllRedirects, handlerBefore);
        });
    });
    describe('replace', function () {
        it('validates the batch, persists it, and activates', async function () {
            const redirects = [{ from: '/a', to: '/b', permanent: true }];
            await service.replace(redirects);
            sinon_1.default.assert.calledWith(validate, redirects);
            strict_1.default.deepEqual(await store.getAll(), redirects);
            sinon_1.default.assert.calledOnce(redirectManager.addRedirect);
        });
        it('does not re-read the store after a successful write', async function () {
            const storeGetAll = sinon_1.default.spy(store, 'getAll');
            await service.replace([{ from: '/a', to: '/b', permanent: true }]);
            sinon_1.default.assert.notCalled(storeGetAll);
        });
        it('does not persist or activate when batch validation fails', async function () {
            validate.callsFake((batch) => {
                if (batch.length > 1) {
                    throw new Error('bad batch');
                }
            });
            await strict_1.default.rejects(() => service.replace([
                { from: '/a', to: '/b' },
                { from: '/c', to: '/d' }
            ]), { message: 'bad batch' });
            strict_1.default.deepEqual(await store.getAll(), []);
            sinon_1.default.assert.notCalled(redirectManager.addRedirect);
        });
        it('rejects the upload before persisting if any entry would fail to load', async function () {
            dryRunManager.addRedirect.onSecondCall().returns(null);
            await strict_1.default.rejects(() => service.replace([
                { from: '/a', to: '/b', permanent: true },
                { from: '/bad-regex', to: '/y', permanent: true }
            ]), { errorType: 'ValidationError' });
            strict_1.default.deepEqual(await store.getAll(), []);
            sinon_1.default.assert.notCalled(redirectManager.addRedirect);
        });
        it('rejects the upload as ValidationError when the dry-run manager throws', async function () {
            dryRunManager.addRedirect.onSecondCall().throws(new Error('manager exploded'));
            await strict_1.default.rejects(() => service.replace([
                { from: '/a', to: '/b', permanent: true },
                { from: '/explodes', to: '/y', permanent: true }
            ]), { errorType: 'ValidationError' });
            strict_1.default.deepEqual(await store.getAll(), []);
            sinon_1.default.assert.notCalled(redirectManager.addRedirect);
        });
        it('throws if the live manager rejects an entry the dry-run accepted', async function () {
            // Structurally impossible today because dry-run and live
            // share a factory, but the throw guards the invariant
            // against any future DynamicRedirectManager change that
            // introduces instance-divergent state.
            redirectManager.addRedirect.onSecondCall().returns(null);
            await strict_1.default.rejects(() => service.replace([
                { from: '/a', to: '/b', permanent: true },
                { from: '/inconsistent', to: '/y', permanent: true }
            ]), { errorType: 'ValidationError' });
            // The write committed before the live load tried to register.
            // Self-heals on the next boot via the skip-and-log path.
            strict_1.default.deepEqual(await store.getAll(), [
                { from: '/a', to: '/b', permanent: true },
                { from: '/inconsistent', to: '/y', permanent: true }
            ]);
        });
    });
    describe('getAll', function () {
        it('returns redirects from the store', async function () {
            const redirects = [{ from: '/a', to: '/b', permanent: true }];
            await store.replaceAll(redirects);
            strict_1.default.deepEqual(await service.getAll(), redirects);
        });
    });
    describe('init', function () {
        it('runs activate', async function () {
            await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
            await service.init();
            sinon_1.default.assert.calledOnce(redirectManager.addRedirect);
        });
        it('logs and swallows errors when the store fails', async function () {
            const loggingError = sinon_1.default.stub(logging_1.default, 'error');
            const failingStore = {
                getAll: sinon_1.default.stub().rejects(new Error('disk gone')),
                replaceAll: sinon_1.default.stub()
            };
            service = new redirects_service_1.RedirectsService({
                store: failingStore,
                redirectManager,
                validate
            });
            await service.init();
            sinon_1.default.assert.called(loggingError);
            sinon_1.default.assert.notCalled(redirectManager.addRedirect);
        });
        it('does not clear an already-active manager when the store fails', async function () {
            sinon_1.default.stub(logging_1.default, 'error');
            const failingStore = {
                getAll: sinon_1.default.stub().rejects(new Error('disk gone')),
                replaceAll: sinon_1.default.stub()
            };
            service = new redirects_service_1.RedirectsService({
                store: failingStore,
                redirectManager,
                validate
            });
            await service.init();
            sinon_1.default.assert.notCalled(redirectManager.removeAllRedirects);
        });
    });
});
