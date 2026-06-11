"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const reset_authentication_1 = __importDefault(require("../../../../../core/server/services/auth/reset-authentication"));
const auto_filling_map_1 = require("../../../../../core/server/lib/auto-filling-map");
/**
 * In-memory pretend of the auth-domain modules. We pass it as overrides so
 * the test exercises the real orchestration body but observes outcomes
 * through state we control.
 */
function buildAuthDomain({ apiKeysToRotate, usersToLock, currentKey }) {
    const recorded = {
        actions: [],
        sessionsDeleted: false,
        cacheCleared: false,
        committed: false
    };
    const models = {
        Base: {
            transaction: async (cb) => {
                const result = await cb({ label: 'tx' });
                recorded.committed = true;
                return result;
            }
        },
        ApiKey: {
            refreshAllSecrets: async () => ({ count: apiKeysToRotate })
        },
        Action: {
            add: async (payload) => {
                recorded.actions.push(payload);
                return {};
            }
        }
    };
    const internalKeys = new auto_filling_map_1.AutoFillingMap((slug) => {
        throw new Error(`Test internalKeys not seeded for slug ${slug}`);
    });
    internalKeys.set('ghost-scheduler', Promise.resolve(currentKey));
    const originalClear = internalKeys.clear.bind(internalKeys);
    internalKeys.clear = () => {
        recorded.cacheCleared = true;
        originalClear();
    };
    const deleteAllSessions = async () => {
        recorded.sessionsDeleted = true;
    };
    const userService = { lockAll: async () => ({ count: usersToLock }) };
    return { models, internalKeys, deleteAllSessions, userService, recorded };
}
describe('resetAuthentication', function () {
    it('rotates keys, locks users, writes audit row with counts, returns counts', async function () {
        const env = buildAuthDomain({ apiKeysToRotate: 4, usersToLock: 3, currentKey: { id: 'k', secret: 'old' } });
        const adapter = { rescheduleAll: async () => { } };
        const result = await (0, reset_authentication_1.default)({
            schedulerAdapter: adapter,
            userService: env.userService,
            options: { context: { user: 'user-1' } },
            models: env.models,
            internalKeys: env.internalKeys,
            deleteAllSessions: env.deleteAllSessions
        });
        strict_1.default.deepEqual(result, { apiKeysRotated: 4, usersLocked: 3 });
        strict_1.default.equal(env.recorded.committed, true);
        strict_1.default.equal(env.recorded.actions.length, 1);
        strict_1.default.equal(env.recorded.actions[0].event, 'edited');
        strict_1.default.equal(env.recorded.actions[0].resource_type, 'security_action');
        strict_1.default.equal(env.recorded.actions[0].actor_id, 'user-1');
        strict_1.default.equal(env.recorded.actions[0].context.action_name, 'reset_authentication');
        strict_1.default.equal(env.recorded.actions[0].context.api_keys_rotated, 4);
        strict_1.default.equal(env.recorded.actions[0].context.users_locked, 3);
    });
    it('asks the scheduler adapter to reschedule with the pre-rotation key', async function () {
        const env = buildAuthDomain({ apiKeysToRotate: 1, usersToLock: 1, currentKey: { id: 'k', secret: 'pre-rotation' } });
        let observed;
        await (0, reset_authentication_1.default)({
            schedulerAdapter: { rescheduleAll: async (opts) => {
                    observed = opts.previousKey;
                } },
            userService: env.userService,
            options: { context: { user: 'user-1' } },
            models: env.models,
            internalKeys: env.internalKeys,
            deleteAllSessions: env.deleteAllSessions
        });
        strict_1.default.deepEqual(observed, { id: 'k', secret: 'pre-rotation' });
    });
    it('skips the audit row when no actor is in context', async function () {
        const env = buildAuthDomain({ apiKeysToRotate: 1, usersToLock: 0, currentKey: { id: 'k', secret: 's' } });
        await (0, reset_authentication_1.default)({
            schedulerAdapter: { rescheduleAll: async () => { } },
            userService: env.userService,
            options: {},
            models: env.models,
            internalKeys: env.internalKeys,
            deleteAllSessions: env.deleteAllSessions
        });
        strict_1.default.equal(env.recorded.actions.length, 0);
    });
    it('rolls back rotation and skips sessions + reschedule when lock fails', async function () {
        const env = buildAuthDomain({ apiKeysToRotate: 2, usersToLock: 0, currentKey: { id: 'k', secret: 's' } });
        let rescheduleCalled = false;
        await strict_1.default.rejects((0, reset_authentication_1.default)({
            schedulerAdapter: { rescheduleAll: async () => {
                    rescheduleCalled = true;
                } },
            userService: { lockAll: async () => {
                    throw new Error('lock failed');
                } },
            options: { context: { user: 'user-1' } },
            models: env.models,
            internalKeys: env.internalKeys,
            deleteAllSessions: env.deleteAllSessions
        }), /lock failed/);
        strict_1.default.equal(env.recorded.actions.length, 0, 'audit row not written on rollback');
        strict_1.default.equal(env.recorded.sessionsDeleted, false, 'sessions are not wiped on rollback');
        strict_1.default.equal(env.recorded.cacheCleared, false, 'internal-keys cache not cleared on rollback');
        strict_1.default.equal(rescheduleCalled, false, 'adapter is not asked to reschedule on rollback');
    });
    it('wipes sessions before asking the adapter to reschedule', async function () {
        const env = buildAuthDomain({ apiKeysToRotate: 1, usersToLock: 1, currentKey: { id: 'k', secret: 's' } });
        let sessionsWipedBeforeReschedule = false;
        await (0, reset_authentication_1.default)({
            schedulerAdapter: { rescheduleAll: async () => {
                    sessionsWipedBeforeReschedule = env.recorded.sessionsDeleted;
                } },
            userService: env.userService,
            options: { context: { user: 'user-1' } },
            models: env.models,
            internalKeys: env.internalKeys,
            deleteAllSessions: env.deleteAllSessions
        });
        strict_1.default.equal(sessionsWipedBeforeReschedule, true);
    });
});
