"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPrettifiesTo = assertPrettifiesTo;
const strict_1 = __importDefault(require("node:assert/strict"));
const prettify_html_1 = require("./prettify-html");
/**
 * Asserts that the given HTML string prettifies to match the expected string
 */
function assertPrettifiesTo(actual, expected) {
    strict_1.default.equal(typeof actual, 'string', 'First argument must be a string');
    strict_1.default.equal(typeof expected, 'string', 'Second argument must be a string');
    const expectedStr = (0, prettify_html_1.prettifyHTML)(expected);
    const actualStr = (0, prettify_html_1.prettifyHTML)(actual);
    strict_1.default.equal(actualStr, expectedStr);
}
