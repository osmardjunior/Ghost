"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable ghost/mocha/no-setup-in-describe -- runStoreContract is the parameterised-test seam; calling it inside describe is the intended use. */
const strict_1 = __importDefault(require("node:assert/strict"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const FileStore_1 = __importDefault(require("../../../../../core/server/adapters/redirects/FileStore"));
const store_contract_1 = require("../../services/custom-redirects/helpers/store-contract");
const writeJson = (filePath, data) => fs_extra_1.default.writeFile(filePath, JSON.stringify(data), 'utf-8');
describe('UNIT: FileStore', function () {
    let basePath;
    beforeEach(async function () {
        basePath = path_1.default.join(os_1.default.tmpdir(), `redirects-filestore-${crypto_1.default.randomUUID()}`);
        await fs_extra_1.default.ensureDir(basePath);
    });
    afterEach(async function () {
        await fs_extra_1.default.remove(basePath);
    });
    (0, store_contract_1.runStoreContract)({
        createStore: () => new FileStore_1.default({ basePath })
    });
    describe('getAll: reading existing files', function () {
        it('reads an existing redirects.json file', async function () {
            await writeJson(path_1.default.join(basePath, 'redirects.json'), [
                { from: '/a', to: '/b', permanent: true }
            ]);
            const store = new FileStore_1.default({ basePath });
            strict_1.default.deepEqual(await store.getAll(), [
                { from: '/a', to: '/b', permanent: true }
            ]);
        });
        it('reads an existing redirects.yaml file', async function () {
            await fs_extra_1.default.writeFile(path_1.default.join(basePath, 'redirects.yaml'), '301:\n  /a/: /b/\n302:\n  /c/: /d/\n', 'utf-8');
            const store = new FileStore_1.default({ basePath });
            const result = await store.getAll();
            strict_1.default.deepEqual([...result].sort((a, b) => a.from.localeCompare(b.from)), [
                { from: '/a/', to: '/b/', permanent: true },
                { from: '/c/', to: '/d/', permanent: false }
            ]);
        });
        it('prefers redirects.yaml over redirects.json when both exist', async function () {
            await writeJson(path_1.default.join(basePath, 'redirects.json'), [
                { from: '/from-json', to: '/to-json', permanent: true }
            ]);
            await fs_extra_1.default.writeFile(path_1.default.join(basePath, 'redirects.yaml'), '301:\n  /from-yaml: /to-yaml\n', 'utf-8');
            const store = new FileStore_1.default({ basePath });
            strict_1.default.deepEqual(await store.getAll(), [
                { from: '/from-yaml', to: '/to-yaml', permanent: true }
            ]);
        });
        it('throws when redirects.json is corrupt', async function () {
            await fs_extra_1.default.writeFile(path_1.default.join(basePath, 'redirects.json'), '{not valid', 'utf-8');
            const store = new FileStore_1.default({ basePath });
            await strict_1.default.rejects(() => store.getAll(), { errorType: 'BadRequestError' });
        });
    });
    describe('replaceAll: backups and persistence', function () {
        it('writes a new redirects.json when nothing existed before', async function () {
            const store = new FileStore_1.default({ basePath });
            await store.replaceAll([{ from: '/x', to: '/y', permanent: true }]);
            const onDisk = JSON.parse(await fs_extra_1.default.readFile(path_1.default.join(basePath, 'redirects.json'), 'utf-8'));
            strict_1.default.deepEqual(onDisk, [{ from: '/x', to: '/y', permanent: true }]);
        });
        it('backs up an existing redirects.json before overwriting', async function () {
            const original = [{ from: '/old', to: '/old-target', permanent: true }];
            await writeJson(path_1.default.join(basePath, 'redirects.json'), original);
            const store = new FileStore_1.default({ basePath });
            await store.replaceAll([{ from: '/new', to: '/new-target', permanent: true }]);
            const entries = await fs_extra_1.default.readdir(basePath);
            const backup = entries.find((name) => /^redirects-.+\.json$/.test(name));
            strict_1.default.ok(backup, `expected a timestamped JSON backup, got: ${entries.join(', ')}`);
            const backupContent = JSON.parse(await fs_extra_1.default.readFile(path_1.default.join(basePath, backup), 'utf-8'));
            strict_1.default.deepEqual(backupContent, original);
        });
        it('writes JSON regardless of the previous on-disk format', async function () {
            await fs_extra_1.default.writeFile(path_1.default.join(basePath, 'redirects.yaml'), '301:\n  /a/: /b/\n', 'utf-8');
            const store = new FileStore_1.default({ basePath });
            await store.replaceAll([{ from: '/x', to: '/y', permanent: false }]);
            strict_1.default.equal(await fs_extra_1.default.pathExists(path_1.default.join(basePath, 'redirects.yaml')), false);
            strict_1.default.equal(await fs_extra_1.default.pathExists(path_1.default.join(basePath, 'redirects.json')), true);
            const entries = await fs_extra_1.default.readdir(basePath);
            strict_1.default.ok(entries.some((name) => /^redirects-.+\.yaml$/.test(name)), 'previous yaml should be preserved as a timestamped backup');
        });
        it('round-trips through getAll after replaceAll', async function () {
            const store = new FileStore_1.default({ basePath });
            const redirects = [
                { from: '/a', to: '/b', permanent: true },
                { from: '/c', to: '/d', permanent: false }
            ];
            await store.replaceAll(redirects);
            strict_1.default.deepEqual(await store.getAll(), redirects);
        });
        it('overwrites a stale backup of the same name rather than failing', async function () {
            // Inject a stable backup path — the default per-second
            // timestamp would otherwise make this test depend on
            // wall-clock granularity.
            const fixedBackup = path_1.default.join(basePath, 'redirects-backup.yaml');
            const yamlPath = path_1.default.join(basePath, 'redirects.yaml');
            const store = new FileStore_1.default({
                basePath,
                getBackupFilePath: () => fixedBackup
            });
            const firstYaml = '301:\n  /first-backup/: /x/\n';
            const secondYaml = '301:\n  /second-backup/: /z/\n';
            await fs_extra_1.default.writeFile(yamlPath, firstYaml, 'utf-8');
            await store.replaceAll([{ from: '/first', to: '/x', permanent: true }]);
            await fs_extra_1.default.writeFile(yamlPath, secondYaml, 'utf-8');
            await store.replaceAll([{ from: '/second', to: '/y', permanent: true }]);
            strict_1.default.deepEqual(await store.getAll(), [
                { from: '/second', to: '/y', permanent: true }
            ]);
            // Distinct payloads on each pass — identical content
            // wouldn't distinguish overwrite from no-op.
            strict_1.default.equal(await fs_extra_1.default.readFile(fixedBackup, 'utf-8'), secondYaml);
        });
        it('preserves the previous redirects on disk when the atomic write fails', async function () {
            const original = [{ from: '/old', to: '/old-target', permanent: true }];
            await writeJson(path_1.default.join(basePath, 'redirects.json'), original);
            const store = new FileStore_1.default({ basePath });
            store._writeAtomic = () => Promise.reject(new Error('disk full'));
            await strict_1.default.rejects(() => store.replaceAll([{ from: '/new', to: '/new-target', permanent: true }]), { message: 'disk full' });
            strict_1.default.deepEqual(await store.getAll(), original);
        });
        it('rolls back the new redirects.json if the post-write yaml backup fails', async function () {
            await fs_extra_1.default.writeFile(path_1.default.join(basePath, 'redirects.yaml'), '301:\n  /old/: /old-target/\n', 'utf-8');
            const store = new FileStore_1.default({ basePath });
            store._backup = () => Promise.reject(new Error('rename forbidden'));
            await strict_1.default.rejects(() => store.replaceAll([{ from: '/new', to: '/new-target', permanent: true }]), { message: 'rename forbidden' });
            // Without rollback, getAll() would prefer the surviving
            // yaml and the operator's upload would look like it never
            // happened.
            strict_1.default.equal(await fs_extra_1.default.pathExists(path_1.default.join(basePath, 'redirects.json')), false);
            strict_1.default.deepEqual(await store.getAll(), [
                { from: '/old/', to: '/old-target/', permanent: true }
            ]);
        });
    });
});
