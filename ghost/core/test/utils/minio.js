"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMinioConfig = getMinioConfig;
exports.createTestS3Client = createTestS3Client;
exports.createTestBucket = createTestBucket;
exports.emptyTestBucket = emptyTestBucket;
exports.deleteTestBucket = deleteTestBucket;
exports.putObject = putObject;
exports.getObject = getObject;
exports.deleteObject = deleteObject;
const node_crypto_1 = require("node:crypto");
const client_s3_1 = require("@aws-sdk/client-s3");
const DEFAULT_TEST_BUCKET_PREFIX = 'test-redirects';
// MinIO serves buckets via URL path (http://host/bucket/key) rather than
// AWS's virtual-host style (https://bucket.s3.amazonaws.com/key), so
// forcePathStyle stays true.
function getMinioConfig() {
    return {
        endpoint: process.env.MINIO_TEST_ENDPOINT || 'http://127.0.0.1:9000',
        region: process.env.MINIO_TEST_REGION || 'us-east-1',
        forcePathStyle: true,
        accessKeyId: process.env.MINIO_TEST_ACCESS_KEY || 'minio-user',
        secretAccessKey: process.env.MINIO_TEST_SECRET_KEY || 'minio-pass'
    };
}
function createTestS3Client() {
    const cfg = getMinioConfig();
    return new client_s3_1.S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        forcePathStyle: cfg.forcePathStyle,
        credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey
        }
    });
}
async function createTestBucket(client, prefix = DEFAULT_TEST_BUCKET_PREFIX) {
    const bucket = `${prefix}-${(0, node_crypto_1.randomBytes)(4).toString('hex')}`;
    await client.send(new client_s3_1.CreateBucketCommand({ Bucket: bucket }));
    return bucket;
}
async function emptyTestBucket(client, bucket) {
    let continuationToken;
    do {
        const response = await client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken
        }));
        for (const object of response.Contents ?? []) {
            if (object.Key) {
                await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
            }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
}
async function deleteTestBucket(client, bucket) {
    await client.send(new client_s3_1.DeleteBucketCommand({ Bucket: bucket }));
}
async function putObject(client, bucket, key, body) {
    await client.send(new client_s3_1.PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}
/**
 * Returns null when the key is missing instead of throwing. Matches the
 * planned S3RedirectsStore.getAll() behaviour from HKG-1700 ("Returns [] on 404")
 * so tests asserting absence don't need try/catch wrappers.
 */
async function getObject(client, bucket, key) {
    try {
        const response = await client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!response.Body) {
            return null;
        }
        const bytes = await response.Body.transformToByteArray();
        return Buffer.from(bytes);
    }
    catch (err) {
        if (err instanceof client_s3_1.NoSuchKey) {
            return null;
        }
        throw err;
    }
}
async function deleteObject(client, bucket, key) {
    await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
