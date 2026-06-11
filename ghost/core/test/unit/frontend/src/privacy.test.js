"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const privacy_1 = require("../../../../core/frontend/src/utils/privacy");
describe('Privacy Utils', function () {
    describe('maskSensitiveData', function () {
        it('should mask default sensitive attributes', function () {
            const payload = {
                user: 'john',
                user_id: 123,
                email: 'john@example.com',
                normal: 'data'
            };
            const result = (0, privacy_1.maskSensitiveData)(payload);
            const parsed = JSON.parse(result);
            strict_1.default.equal(parsed.user, '********');
            strict_1.default.equal(parsed.user_id, '********');
            strict_1.default.equal(parsed.email, '********');
            strict_1.default.equal(parsed.normal, 'data');
        });
        it('should mask custom sensitive attributes', function () {
            const payload = {
                custom_field: 'sensitive',
                normal: 'data'
            };
            const customAttributes = ['custom_field'];
            const result = (0, privacy_1.maskSensitiveData)(payload, customAttributes);
            const parsed = JSON.parse(result);
            strict_1.default.equal(parsed.custom_field, '********');
            strict_1.default.equal(parsed.normal, 'data');
        });
        it('should handle nested objects', function () {
            const payload = {
                data: {
                    user: 'john',
                    details: {
                        email: 'john@example.com'
                    }
                },
                normal: 'data'
            };
            const result = (0, privacy_1.maskSensitiveData)(payload);
            const parsed = JSON.parse(result);
            strict_1.default.equal(parsed.data.user, '********');
            strict_1.default.equal(parsed.data.details.email, '********');
            strict_1.default.equal(parsed.normal, 'data');
        });
        it('should handle empty payloads', function () {
            const payload = {};
            const result = (0, privacy_1.maskSensitiveData)(payload);
            const parsed = JSON.parse(result);
            strict_1.default.deepEqual(parsed, {});
        });
    });
    describe('processPayload', function () {
        it('should return stringified payload with masked data by default', function () {
            const payload = {
                email: 'john@example.com',
                normal: 'data'
            };
            const result = (0, privacy_1.processPayload)(payload);
            strict_1.default.equal(typeof result, 'string');
            const parsed = JSON.parse(result);
            strict_1.default.equal(parsed.email, '********');
            strict_1.default.equal(parsed.normal, 'data');
        });
        it('should add global attributes to payload', function () {
            const payload = {
                data: 'value'
            };
            const globalAttributes = {
                global: 'attribute'
            };
            const result = (0, privacy_1.processPayload)(payload, globalAttributes);
            const parsed = JSON.parse(result);
            strict_1.default.equal(parsed.data, 'value');
            strict_1.default.equal(parsed.global, 'attribute');
        });
        it('should return object when stringify is false', function () {
            const payload = {
                email: 'john@example.com',
                normal: 'data'
            };
            const result = (0, privacy_1.processPayload)(payload, {}, false);
            strict_1.default.deepEqual(result, {
                email: '********',
                normal: 'data'
            });
        });
        it('should mask sensitive data in global attributes', function () {
            const payload = {
                normal: 'data'
            };
            const globalAttributes = {
                email: 'john@example.com'
            };
            const result = (0, privacy_1.processPayload)(payload, globalAttributes, false);
            strict_1.default.deepEqual(result, {
                email: '********',
                normal: 'data'
            });
        });
        it('should handle empty payload and attributes', function () {
            const payload = {};
            const globalAttributes = {};
            const result = (0, privacy_1.processPayload)(payload, globalAttributes);
            const parsed = JSON.parse(result);
            strict_1.default.deepEqual(parsed, {});
        });
    });
});
