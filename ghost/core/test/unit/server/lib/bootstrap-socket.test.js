"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrap_socket_1 = require("../../../../core/server/lib/bootstrap-socket");
describe('Connect and send', function () {
    it('Resolves a promise for a bad call', async function () {
        await (0, bootstrap_socket_1.connectAndSend)();
    });
});
