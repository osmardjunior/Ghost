"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const S3RedirectsStore_1 = __importDefault(require("../../../../../core/server/adapters/redirects/S3RedirectsStore"));
describe('UNIT: S3RedirectsStore', function () {
    describe('constructor validation', function () {
        it('throws when no bucket is provided', function () {
            strict_1.default.throws(() => new S3RedirectsStore_1.default({}), { errorType: 'IncorrectUsageError', message: /bucket/ });
        });
        it('throws when no staticFileURLPrefix is provided', function () {
            strict_1.default.throws(() => new S3RedirectsStore_1.default({ bucket: 'x' }), { errorType: 'IncorrectUsageError', message: /staticFileURLPrefix/ });
        });
        it('throws when only accessKeyId is provided', function () {
            strict_1.default.throws(() => new S3RedirectsStore_1.default({ bucket: 'x', staticFileURLPrefix: 'content/data', accessKeyId: 'AKIA' }), { errorType: 'IncorrectUsageError', message: /accessKeyId.*secretAccessKey/ });
        });
        it('throws when only secretAccessKey is provided', function () {
            strict_1.default.throws(() => new S3RedirectsStore_1.default({ bucket: 'x', staticFileURLPrefix: 'content/data', secretAccessKey: 'shh' }), { errorType: 'IncorrectUsageError', message: /accessKeyId.*secretAccessKey/ });
        });
        it('throws when sessionToken is provided without the credential pair', function () {
            strict_1.default.throws(() => new S3RedirectsStore_1.default({ bucket: 'x', staticFileURLPrefix: 'content/data', sessionToken: 'session' }), { errorType: 'IncorrectUsageError', message: /accessKeyId.*secretAccessKey/ });
        });
        it('accepts a tenantPrefix without throwing', function () {
            strict_1.default.doesNotThrow(() => new S3RedirectsStore_1.default({ bucket: 'x', staticFileURLPrefix: 'content/data', tenantPrefix: 'tenant-abc' }));
        });
    });
});
