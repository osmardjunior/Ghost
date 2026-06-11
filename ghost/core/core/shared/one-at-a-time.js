"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oneAtATime = void 0;
const errors_1 = require("@tryghost/errors");
/**
 * Wraps an async function so it runs at most one invocation at a time, with at
 * most one additional invocation queued.
 *
 * Possible states:
 *
 * - idle: nothing is running
 * - running: function is active, nothing is queued
 * - running + queued: function is active, another invocation enqueued
 *
 * Errors are silently swallowed.
 *
 */
const oneAtATime = (fn) => {
    let state = 'idle';
    const run = async () => {
        try {
            await fn();
        }
        catch {
            // noop
        }
        switch (state) {
            case 'running+queued':
                state = 'running';
                run();
                break;
            case 'running':
                state = 'idle';
                break;
            default:
                throw new errors_1.InternalServerError({ message: `Unexpected state: ${state}` });
        }
    };
    return () => {
        switch (state) {
            case 'idle':
                state = 'running';
                run();
                break;
            case 'running':
                state = 'running+queued';
                break;
            case 'running+queued':
                break;
            default: {
                const _exhaustive = state;
                throw new errors_1.InternalServerError({ message: `Unexpected state: ${_exhaustive}` });
            }
        }
    };
};
exports.oneAtATime = oneAtATime;
