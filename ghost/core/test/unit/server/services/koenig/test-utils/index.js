"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.callRenderer = exports.visibility = exports.prettifyHTML = exports.html = exports.assertPrettifiesTo = exports.assertPrettifiedIncludes = void 0;
const jsdom_1 = require("jsdom");
const build_call_renderer_1 = require("./build-call-renderer");
var assert_prettified_includes_1 = require("./assert-prettified-includes");
Object.defineProperty(exports, "assertPrettifiedIncludes", { enumerable: true, get: function () { return assert_prettified_includes_1.assertPrettifiedIncludes; } });
var assert_prettifies_to_1 = require("./assert-prettifies-to");
Object.defineProperty(exports, "assertPrettifiesTo", { enumerable: true, get: function () { return assert_prettifies_to_1.assertPrettifiesTo; } });
var html_1 = require("./html");
Object.defineProperty(exports, "html", { enumerable: true, get: function () { return html_1.html; } });
var prettify_html_1 = require("./prettify-html");
Object.defineProperty(exports, "prettifyHTML", { enumerable: true, get: function () { return prettify_html_1.prettifyHTML; } });
exports.visibility = __importStar(require("./visibility"));
const dom = new jsdom_1.JSDOM();
exports.callRenderer = (0, build_call_renderer_1.buildCallRenderer)(dom);
