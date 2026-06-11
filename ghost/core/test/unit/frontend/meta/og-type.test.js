"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const og_type_1 = require("../../../../core/frontend/meta/og-type");
describe('getOgType', function () {
    it('should return og type profile if context is type author', function () {
        const ogType = (0, og_type_1.getOgType)({
            context: ['author']
        });
        strict_1.default.equal(ogType, 'profile');
    });
    it('should return og type article if context is type post', function () {
        const ogType = (0, og_type_1.getOgType)({
            context: ['post']
        });
        strict_1.default.equal(ogType, 'article');
    });
    it('should return og type website if context is not author or post', function () {
        const ogType = (0, og_type_1.getOgType)({
            context: ['tag']
        });
        strict_1.default.equal(ogType, 'website');
    });
});
