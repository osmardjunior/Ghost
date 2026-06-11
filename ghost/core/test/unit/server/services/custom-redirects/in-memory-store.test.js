"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable ghost/mocha/no-setup-in-describe -- runStoreContract is the parameterised-test seam; calling it inside describe is the intended use. */
const in_memory_store_1 = require("./helpers/in-memory-store");
const store_contract_1 = require("./helpers/store-contract");
describe('UNIT: InMemoryStore (validates the contract)', function () {
    (0, store_contract_1.runStoreContract)({
        createStore: () => new in_memory_store_1.InMemoryStore()
    });
});
