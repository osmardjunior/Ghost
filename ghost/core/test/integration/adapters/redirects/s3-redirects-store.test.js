"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable ghost/mocha/no-setup-in-describe -- runStoreContract is the parameterised-test seam; calling it inside describe is the intended use. */
const strict_1 = __importDefault(require("node:assert/strict"));
const client_s3_1 = require("@aws-sdk/client-s3");
const S3RedirectsStore_1 = __importDefault(require("../../../../core/server/adapters/redirects/S3RedirectsStore"));
const minio_1 = require("../../../utils/minio");
const store_contract_1 = require("../../../unit/server/services/custom-redirects/helpers/store-contract");
const STATIC_PREFIX = 'content/data';
const CANONICAL_FILENAME = 'redirects.json';
const canonicalKey = (tenantPrefix = '') => [tenantPrefix, STATIC_PREFIX, CANONICAL_FILENAME].filter(Boolean).join('/');
const listObjectKeys = async (s3Client, bucketName) => {
    const response = await s3Client.send(new client_s3_1.ListObjectsV2Command({ Bucket: bucketName }));
    return (response.Contents ?? []).map(o => o.Key ?? '').filter(Boolean);
};
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const backupKeyPattern = (tenantPrefix = '') => new RegExp(`^${tenantPrefix ? `${tenantPrefix}/` : ''}${STATIC_PREFIX}/redirects-\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-\\d{2}\\.json$`);
describe('Integration: S3RedirectsStore', function () {
    let adminClient;
    let bucket;
    const minioConfig = (0, minio_1.getMinioConfig)();
    before(async function () {
        adminClient = (0, minio_1.createTestS3Client)();
        bucket = await (0, minio_1.createTestBucket)(adminClient);
    });
    afterEach(async function () {
        await (0, minio_1.emptyTestBucket)(adminClient, bucket);
    });
    after(async function () {
        await (0, minio_1.deleteTestBucket)(adminClient, bucket);
    });
    (0, store_contract_1.runStoreContract)({
        createStore: () => new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX })
    });
    describe('getAll: error handling', function () {
        it('throws when redirects.json is corrupt', async function () {
            await (0, minio_1.putObject)(adminClient, bucket, canonicalKey(), '{not valid');
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX });
            await strict_1.default.rejects(() => store.getAll(), { errorType: 'BadRequestError' });
        });
    });
    describe('replaceAll: timestamped backups', function () {
        it('writes the canonical key without a backup when the bucket is empty', async function () {
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX });
            await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
            strict_1.default.deepEqual(await listObjectKeys(adminClient, bucket), [canonicalKey()]);
        });
        it('backs up the prior contents before overwriting', async function () {
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX });
            const initial = [{ from: '/old', to: '/old-target', permanent: true }];
            await store.replaceAll(initial);
            await store.replaceAll([{ from: '/new', to: '/new-target', permanent: false }]);
            const keys = await listObjectKeys(adminClient, bucket);
            const backupKey = keys.find(k => backupKeyPattern().test(k));
            strict_1.default.ok(backupKey, `expected a timestamped backup key, got: ${keys.join(', ')}`);
            const backupBody = await (0, minio_1.getObject)(adminClient, bucket, backupKey);
            strict_1.default.equal(backupBody?.toString('utf-8'), JSON.stringify(initial));
        });
        it('creates a new backup on every overwrite', async function () {
            // The backup key generator uses a per-second timestamp, so
            // real waits between writes are needed to guarantee distinct
            // backup keys.
            this.timeout(15000);
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX });
            await store.replaceAll([{ from: '/a', to: '/a', permanent: true }]);
            await sleep(1100);
            await store.replaceAll([{ from: '/b', to: '/b', permanent: true }]);
            await sleep(1100);
            await store.replaceAll([{ from: '/c', to: '/c', permanent: true }]);
            const keys = await listObjectKeys(adminClient, bucket);
            const backupKeys = keys.filter(k => backupKeyPattern().test(k));
            strict_1.default.equal(backupKeys.length, 2, `expected 2 timestamped backups, got: ${keys.join(', ')}`);
            strict_1.default.ok(keys.includes(canonicalKey()), `expected canonical ${canonicalKey()}, got: ${keys.join(', ')}`);
        });
    });
    describe('tenantPrefix scoping', function () {
        it('writes the canonical key under the tenant prefix', async function () {
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX, tenantPrefix: 'tenant-abc' });
            await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
            strict_1.default.deepEqual(await listObjectKeys(adminClient, bucket), [canonicalKey('tenant-abc')]);
        });
        it('reads back redirects from the prefixed key', async function () {
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX, tenantPrefix: 'tenant-abc' });
            const redirects = [{ from: '/old', to: '/new', permanent: true }];
            await store.replaceAll(redirects);
            strict_1.default.deepEqual(await store.getAll(), redirects);
        });
        it('writes backups under the tenant prefix on overwrite', async function () {
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX, tenantPrefix: 'tenant-abc' });
            const initial = [{ from: '/old', to: '/old-target', permanent: true }];
            await store.replaceAll(initial);
            await store.replaceAll([{ from: '/new', to: '/new-target', permanent: false }]);
            const keys = await listObjectKeys(adminClient, bucket);
            const backupKey = keys.find(k => backupKeyPattern('tenant-abc').test(k));
            strict_1.default.ok(backupKey, `expected a tenant-scoped backup key, got: ${keys.join(', ')}`);
            const backupBody = await (0, minio_1.getObject)(adminClient, bucket, backupKey);
            strict_1.default.equal(backupBody?.toString('utf-8'), JSON.stringify(initial));
        });
        it('isolates tenants sharing the same bucket', async function () {
            const storeA = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX, tenantPrefix: 'tenant-a' });
            const storeB = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX, tenantPrefix: 'tenant-b' });
            await storeA.replaceAll([{ from: '/a', to: '/a-target', permanent: true }]);
            await storeB.replaceAll([{ from: '/b', to: '/b-target', permanent: false }]);
            strict_1.default.deepEqual(await storeA.getAll(), [{ from: '/a', to: '/a-target', permanent: true }]);
            strict_1.default.deepEqual(await storeB.getAll(), [{ from: '/b', to: '/b-target', permanent: false }]);
            strict_1.default.deepEqual((await listObjectKeys(adminClient, bucket)).sort(), [canonicalKey('tenant-a'), canonicalKey('tenant-b')]);
        });
        it('strips leading and trailing slashes from the tenant prefix', async function () {
            const store = new S3RedirectsStore_1.default({ ...minioConfig, bucket, staticFileURLPrefix: STATIC_PREFIX, tenantPrefix: '/tenant-abc/' });
            await store.replaceAll([{ from: '/a', to: '/b', permanent: true }]);
            strict_1.default.deepEqual(await listObjectKeys(adminClient, bucket), [canonicalKey('tenant-abc')]);
        });
    });
});
