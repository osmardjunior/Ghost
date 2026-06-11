"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettifyHTML = prettifyHTML;
const sync_1 = __importDefault(require("@prettier/sync"));
const html_minifier_1 = require("html-minifier");
function prettifyHTML(html) {
    const minified = (0, html_minifier_1.minify)(html, { collapseWhitespace: true, collapseInlineTagWhitespace: true });
    const prettified = sync_1.default.format(minified, { parser: 'html' });
    return prettified;
}
