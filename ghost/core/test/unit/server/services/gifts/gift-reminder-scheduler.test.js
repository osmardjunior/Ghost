"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const sinon_1 = __importDefault(require("sinon"));
const gift_reminder_scheduler_1 = require("../../../../../core/server/services/gifts/gift-reminder-scheduler");
const auto_filling_map_1 = require("../../../../../core/server/lib/auto-filling-map");
const utils_1 = require("./utils");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Build an in-memory pretend of the cross-domain deps the scheduler takes.
 * Tests assert on the queued jobs (the observable outcome) and on which
 * repository rows were consulted; same-domain primitives (getSignedAdminToken,
 * urlUtils) are real imports inside the class.
 */
// Test secrets are 64-char hex so getSignedAdminToken (which decodes via
// Buffer.from(secret, 'hex')) treats them as distinct signing keys.
const HEX_CURRENT = 'aa'.repeat(32);
const HEX_OLD = '55'.repeat(32);
function buildDeps(overrides = {}) {
    const apiUrl = overrides.apiUrl ?? 'https://example.com/ghost/api/admin';
    const currentKey = overrides.currentKey ?? { id: 'kid', secret: HEX_CURRENT };
    const internalKeys = new auto_filling_map_1.AutoFillingMap((slug) => {
        throw new Error(`Test internalKeys not seeded for slug ${slug}`);
    });
    internalKeys.set('ghost-scheduler', Promise.resolve(currentKey));
    const schedule = sinon_1.default.stub();
    const unschedule = sinon_1.default.stub();
    const register = overrides.register ?? sinon_1.default.stub();
    const run = sinon_1.default.stub();
    const findUnsentReminders = sinon_1.default.stub().resolves(overrides.pending ?? []);
    return {
        apiUrl,
        adapter: { schedule, unschedule, register, run },
        internalKeys,
        findUnsentReminders,
        currentKey
    };
}
function futureGift(daysAhead) {
    return (0, utils_1.buildGift)({
        token: `tok-${daysAhead}`,
        status: 'redeemed',
        redeemerMemberId: 'm_1',
        redeemedAt: new Date(),
        consumesAt: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    });
}
describe('GiftReminderScheduler', function () {
    afterEach(function () {
        sinon_1.default.restore();
    });
    it('registers itself with the adapter on construction', function () {
        const deps = buildDeps();
        const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
        sinon_1.default.assert.calledOnceWithExactly(deps.adapter.register, scheduler);
    });
    describe('scheduleFor', function () {
        it('queues a reminder 7 days before consumesAt, signed with the current key', async function () {
            const deps = buildDeps();
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            const gift = futureGift(30);
            await scheduler.scheduleFor(gift);
            sinon_1.default.assert.calledOnce(deps.adapter.schedule);
            const [job] = deps.adapter.schedule.getCall(0).args;
            strict_1.default.equal(job.time, gift.consumesAt.getTime() - SEVEN_DAYS_MS);
            strict_1.default.equal(job.extra.httpMethod, 'PUT');
            strict_1.default.ok(job.url.startsWith(`${deps.apiUrl}/gifts/flush_reminders?token=`), 'the URL targets the flush_reminders endpoint and carries a JWT');
        });
        it('does not queue when the gift has no consumesAt', async function () {
            const deps = buildDeps();
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.scheduleFor((0, utils_1.buildGift)({ consumesAt: null }));
            sinon_1.default.assert.notCalled(deps.adapter.schedule);
        });
        it('does not queue when the reminder time has already passed', async function () {
            const deps = buildDeps();
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            // consumesAt 1 day ahead → reminder fires at consumesAt - 7d → in the past
            await scheduler.scheduleFor(futureGift(1));
            sinon_1.default.assert.notCalled(deps.adapter.schedule);
        });
    });
    describe('rescheduleAll', function () {
        it('re-signs every pending reminder under the current key', async function () {
            const pending = [futureGift(30), futureGift(60)];
            const deps = buildDeps({ pending, currentKey: { id: 'k', secret: HEX_CURRENT } });
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.rescheduleAll({ previousKey: { id: 'k', secret: HEX_OLD } });
            sinon_1.default.assert.calledTwice(deps.adapter.unschedule);
            sinon_1.default.assert.calledTwice(deps.adapter.schedule);
            // The schedule URLs are signed under the current key; the unschedule
            // URLs are signed under the previous key. Their tokens must differ
            // for the adapter to find the queued entries.
            const unscheduleUrls = deps.adapter.unschedule.getCalls().map(c => c.args[0].url);
            const scheduleUrls = deps.adapter.schedule.getCalls().map(c => c.args[0].url);
            for (let i = 0; i < pending.length; i++) {
                strict_1.default.notEqual(unscheduleUrls[i], scheduleUrls[i], `pending[${i}]: unschedule URL (old key) must differ from schedule URL (current key)`);
            }
        });
        it('rotation tells the adapter to actually delete the stale queued job', async function () {
            // Outcome: rotation requests a real (non-bootstrap) unschedule so
            // the adapter writes a tombstone and the stale callback is
            // suppressed at execution time. SchedulingDefault's own tests
            // cover the tombstone semantics; here we verify GiftReminderScheduler
            // honours the contract.
            const deps = buildDeps({ pending: [futureGift(30)] });
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.rescheduleAll({ previousKey: { id: 'k', secret: HEX_OLD } });
            sinon_1.default.assert.calledOnce(deps.adapter.unschedule);
            strict_1.default.equal(deps.adapter.unschedule.getCall(0).args[1].bootstrap, false);
        });
        it('uses the current key for unschedule when previousKey is omitted', async function () {
            const pending = [futureGift(30)];
            const deps = buildDeps({ pending });
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.rescheduleAll();
            sinon_1.default.assert.calledOnce(deps.adapter.unschedule);
            sinon_1.default.assert.calledOnce(deps.adapter.schedule);
            const unscheduleUrl = deps.adapter.unschedule.getCall(0).args[0].url;
            const scheduleUrl = deps.adapter.schedule.getCall(0).args[0].url;
            strict_1.default.equal(unscheduleUrl, scheduleUrl, 'with no previousKey, both URLs are signed under the same (current) key');
        });
        it('same-key rebuild marks unschedule as bootstrap so the new job survives', async function () {
            // Outcome: when no previousKey is supplied (boot), unschedule and
            // schedule use the same URL. GiftReminderScheduler must mark the
            // unschedule as bootstrap so the adapter skips the tombstone and
            // the about-to-be-scheduled job stays pingable.
            const deps = buildDeps({ pending: [futureGift(30)] });
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.rescheduleAll();
            sinon_1.default.assert.calledOnce(deps.adapter.unschedule);
            strict_1.default.equal(deps.adapter.unschedule.getCall(0).args[1].bootstrap, true);
        });
        it('skips reminders whose fire time has already passed', async function () {
            const deps = buildDeps({ pending: [futureGift(1)] });
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.rescheduleAll({ previousKey: { id: 'k', secret: HEX_OLD } });
            sinon_1.default.assert.notCalled(deps.adapter.unschedule);
            sinon_1.default.assert.notCalled(deps.adapter.schedule);
        });
        it('is a no-op when the repository has nothing pending', async function () {
            const deps = buildDeps({ pending: [] });
            const scheduler = new gift_reminder_scheduler_1.GiftReminderScheduler(deps);
            await scheduler.rescheduleAll({ previousKey: { id: 'k', secret: HEX_OLD } });
            sinon_1.default.assert.notCalled(deps.adapter.schedule);
            sinon_1.default.assert.notCalled(deps.adapter.unschedule);
        });
    });
});
