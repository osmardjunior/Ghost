"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPrettifiedIncludes = assertPrettifiedIncludes;
const strict_1 = __importDefault(require("node:assert/strict"));
const html_minifier_1 = require("html-minifier");
const prettify_html_1 = require("./prettify-html");
function assertPrettifiedIncludes(actual, expected) {
    const actualPrettified = (0, prettify_html_1.prettifyHTML)(actual);
    const expectedPrettified = (0, prettify_html_1.prettifyHTML)(expected);
    const normalizedActual = (0, html_minifier_1.minify)(actualPrettified, { collapseWhitespace: true, collapseInlineTagWhitespace: true, minifyCSS: true });
    const normalizedExpected = (0, html_minifier_1.minify)(expectedPrettified, { collapseWhitespace: true, collapseInlineTagWhitespace: true, minifyCSS: true });
    const message = [
        'Expected HTML to include substring:',
        '',
        'Received:',
        actualPrettified,
        '',
        'Expected:',
        expectedPrettified
    ].join('\n');
    strict_1.default.ok(normalizedActual.includes(normalizedExpected), message);
}
