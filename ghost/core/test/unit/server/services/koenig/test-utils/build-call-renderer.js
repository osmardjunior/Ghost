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
exports.buildCallRenderer = buildCallRenderer;
// @ts-expect-error This module currently lacks types.
const nodeRenderers = __importStar(require("../../../../../../core/server/services/koenig/node-renderers"));
function buildCallRenderer(dom) {
    return function callRenderer(nodeType, data, options = {}) {
        const renderer = nodeRenderers[nodeType];
        if (!renderer) {
            throw new Error(`Renderer for node type ${nodeType} not found`);
        }
        // duplicate data to __x properties to simulate what's available in real node instances
        data = {
            ...data,
            ...Object.fromEntries(Object.entries(data).map(([key, value]) => [`__${key}`, value]))
        };
        // add other default node properties and methods
        data = {
            isEmpty: () => false,
            getDataset: () => data,
            ...data
        };
        // default options
        options = {
            dom,
            siteUrl: 'https://test.com/',
            postUrl: 'https://test.com/post/',
            imageOptimization: {
                contentImageSizes: {
                    w600: { width: 600 },
                    w1000: { width: 1000 },
                    w1600: { width: 1600 },
                    w2400: { width: 2400 }
                }
            },
            canTransformImage: () => true,
            ...options
        };
        let result;
        if (typeof renderer === 'object') {
            // support for versioned node renderers
            if (!data.version) {
                throw new Error('version data property is required for versioned node renderers');
            }
            result = renderer[data.version](data, options);
        }
        else {
            result = renderer(data, options);
        }
        let html;
        if (result.type === 'inner') {
            html = result.element.innerHTML;
        }
        else if (result.type === 'value') {
            html = result.element.value;
        }
        else {
            html = result.element.outerHTML;
        }
        return {
            element: result.element,
            type: result.type,
            html
        };
    };
}
