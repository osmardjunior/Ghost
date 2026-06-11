"use strict";
/**
 * UrlServiceFacade
 *
 * Sits in front of the URL service so callers can use a stable, resource-based
 * interface regardless of the underlying implementation. The facade can be
 * built with two backends:
 *
 *  - urlService:     the legacy eager UrlService that precomputes a full
 *                    resource → URL map at boot.
 *  - lazyUrlService: an on-demand implementation (LazyUrlService) that
 *                    computes URLs and ownership per call.
 *
 * When `lazyUrlService` is provided the facade routes calls to it; otherwise
 * it delegates to the eager `urlService`. This lets the lazy implementation be
 * swapped in behind a config flag without touching individual callers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlServiceFacade = void 0;
class UrlServiceFacade {
    urlService;
    lazyUrlService;
    constructor({ urlService, lazyUrlService = null }) {
        this.urlService = urlService;
        this.lazyUrlService = lazyUrlService;
    }
    isLazy() {
        return !!this.lazyUrlService;
    }
    /**
     * The full resource record is required: the lazy backend evaluates NQL
     * filters and applies permalink templates against it.
     */
    getUrlForResource(resource, options) {
        if (this.lazyUrlService) {
            return this.lazyUrlService.getUrlForResource(resource, options);
        }
        return this.urlService.getUrlByResourceId(resource.id, options);
    }
    ownsResource(routerIdentifier, resource) {
        if (this.lazyUrlService) {
            return this.lazyUrlService.ownsResource(routerIdentifier, resource);
        }
        return this.urlService.owns(routerIdentifier, resource.id);
    }
    /**
     * Reverse URL lookup. Returns a flat resource shape (e.g. `{type, id, slug}`)
     * rather than the legacy `{config: {type}, data: {...}}` envelope. Async to
     * match the lazy implementation's contract.
     */
    async resolveUrl(urlPath) {
        if (this.lazyUrlService) {
            return this.lazyUrlService.resolveUrl(urlPath);
        }
        const resource = this.urlService.getResource(urlPath);
        if (!resource) {
            return null;
        }
        // The routing-level type ('posts', 'pages', 'tags', 'authors') wins
        // over any DB type field on resource.data so the flat Resource is
        // unambiguous.
        return Object.assign({}, resource.data, { type: resource.config.type });
    }
    hasFinished() {
        if (this.lazyUrlService) {
            return this.lazyUrlService.hasFinished();
        }
        return this.urlService.hasFinished();
    }
    onRouterAddedType(...args) {
        if (this.lazyUrlService) {
            return this.lazyUrlService.onRouterAddedType(...args);
        }
        return this.urlService.onRouterAddedType(...args);
    }
    onRouterUpdated(...args) {
        if (this.lazyUrlService) {
            return this.lazyUrlService.onRouterUpdated(...args);
        }
        return this.urlService.onRouterUpdated(...args);
    }
    /**
     * Reset all router registrations. Used when routes.yaml is reloaded in
     * lazy mode. In eager mode the URL service handles resets via its queue.
     */
    reset() {
        if (this.lazyUrlService) {
            this.lazyUrlService.reset();
        }
    }
}
exports.UrlServiceFacade = UrlServiceFacade;
// `export class` already emits `exports.UrlServiceFacade`. We additionally
// re-attach `module.exports = UrlServiceFacade` AND keep the named export, so
// both `const UrlServiceFacade = require('./url-service-facade')` and
// `const { UrlServiceFacade } = require('./url-service-facade')` work.
module.exports = UrlServiceFacade;
module.exports.UrlServiceFacade = UrlServiceFacade;
