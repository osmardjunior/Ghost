"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryStore = void 0;
class InMemoryStore {
    redirects = [];
    async getAll() {
        return this.redirects.map(r => ({ ...r }));
    }
    async replaceAll(redirects) {
        this.redirects = redirects.map(r => ({ ...r }));
    }
}
exports.InMemoryStore = InMemoryStore;
