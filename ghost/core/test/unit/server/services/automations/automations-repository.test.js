"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const sinon_1 = __importDefault(require("sinon"));
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const knex_1 = __importDefault(require("knex"));
const temporary_fake_database_1 = require("../../../../../core/server/services/automations/temporary-fake-database");
const fake_database_automations_repository_1 = require("../../../../../core/server/services/automations/fake-database-automations-repository");
const HOUR_MS = 60 * 60 * 1000;
const queryBuilder = (0, knex_1.default)({ client: 'sqlite', useNullAsDefault: true });
const addHours = (dateCol, hours) => {
    (0, strict_1.default)(typeof dateCol === 'string', 'Expected date column to be a string');
    const start = new Date(dateCol).valueOf();
    const delta = hours * HOUR_MS;
    return new Date(start + delta);
};
// These tests are partly coupled to the *fake* repository. We should be able to
// modify it once we have the real repository.
describe('automations repository', function () {
    let database;
    let repo;
    const toNativeQuery = (builder) => {
        const { sql, bindings } = builder.toSQL().toNative();
        return {
            sql,
            bindings: bindings
        };
    };
    const getRow = (builder) => {
        const { sql, bindings } = toNativeQuery(builder);
        return database.prepare(sql).get(...bindings);
    };
    const getRows = (builder) => {
        const { sql, bindings } = toNativeQuery(builder);
        return database.prepare(sql).all(...bindings);
    };
    const runQuery = (builder) => {
        const { sql, bindings } = toNativeQuery(builder);
        database.prepare(sql).run(...bindings);
    };
    const getRunByMemberEmail = (email) => getRow(queryBuilder('automation_runs')
        .select('automation_runs.*', 'automations.slug as automation_slug')
        .innerJoin('automations', 'automations.id', 'automation_runs.automation_id')
        .where('automation_runs.member_email', email));
    const getStepByRunId = (runId) => (getRow(queryBuilder('automation_run_steps')
        .select('automation_run_steps.*', 'automation_actions.id as action_id', 'automation_actions.type as action_type', 'automation_action_revisions.wait_hours as wait_hours', 'automation_action_revisions.email_subject as email_subject')
        .innerJoin('automation_action_revisions', 'automation_action_revisions.id', 'automation_run_steps.automation_action_revision_id')
        .innerJoin('automation_actions', 'automation_actions.id', 'automation_action_revisions.action_id')
        .where('automation_run_steps.automation_run_id', runId)));
    const getAutomationBySlug = async (slug) => {
        const automationSummaries = await repo.browse();
        const automationSummary = automationSummaries.data.find(automation => automation.slug === slug);
        (0, strict_1.default)(automationSummary);
        const automation = await repo.getById(automationSummary.id);
        (0, strict_1.default)(automation);
        return automation;
    };
    const getRunCountByAutomationId = (automationId) => {
        const result = getRow(queryBuilder('automation_runs')
            .count({ count: '*' })
            .where('automation_id', automationId));
        return result?.count;
    };
    const getRevisionCount = (actionId) => {
        const builder = queryBuilder('automation_action_revisions').count({ count: '*' });
        const row = getRow(actionId ? builder.where('action_id', actionId) : builder);
        return Number(row.count);
    };
    const getActionByIndex = (automationId, index) => {
        const result = getRow(queryBuilder('automation_actions')
            .select('automation_actions.id as action_id', 'automation_actions.type as action_type', 'automation_action_revisions.id as revision_id', 'automation_action_revisions.wait_hours as wait_hours')
            .innerJoin('automation_action_revisions', 'automation_action_revisions.action_id', 'automation_actions.id')
            .where('automation_actions.automation_id', automationId)
            .whereNull('automation_actions.deleted_at')
            .orderBy([
            'automation_actions.created_at',
            'automation_actions.id'
        ])
            .limit(1)
            .offset(index));
        (0, strict_1.default)(result, 'Expected action to exist');
        return result;
    };
    const getLatestActionRevisionByActionId = (actionId) => {
        const result = getRow(queryBuilder('automation_actions')
            .select('automation_actions.id as action_id', 'automation_actions.type as action_type', 'automation_action_revisions.id as revision_id', 'automation_action_revisions.wait_hours as wait_hours')
            .innerJoin('automation_action_revisions', 'automation_action_revisions.action_id', 'automation_actions.id')
            .where('automation_actions.id', actionId)
            .whereNull('automation_actions.deleted_at')
            .orderBy('automation_action_revisions.created_at', 'desc')
            .orderBy('automation_action_revisions.id', 'desc')
            .limit(1));
        (0, strict_1.default)(result, 'Expected action revision to exist');
        return result;
    };
    const insertRun = (automationId) => {
        const now = new Date().toISOString();
        const run = {
            id: (0, bson_objectid_1.default)().toHexString(),
            created_at: now,
            updated_at: now,
            automation_id: automationId,
            member_id: (0, bson_objectid_1.default)().toHexString(),
            member_email: 'member@example.com'
        };
        runQuery(queryBuilder('automation_runs').insert(run));
        return run;
    };
    const insertStep = (runId, revisionId, attrs = {}) => {
        const now = new Date().toISOString();
        const step = {
            id: (0, bson_objectid_1.default)().toHexString(),
            created_at: now,
            updated_at: now,
            automation_run_id: runId,
            automation_action_revision_id: revisionId,
            ready_at: now,
            step_attempts: 0,
            started_at: null,
            finished_at: null,
            status: 'pending',
            locked_by: null,
            locked_at: null,
            ...attrs
        };
        runQuery(queryBuilder('automation_run_steps').insert(step));
        return step;
    };
    const getStepById = (id) => {
        const result = getRow(queryBuilder('automation_run_steps')
            .select('*')
            .where('id', id));
        (0, strict_1.default)(result, 'Expected step to exist');
        return result;
    };
    const getStepsByRunId = (runId) => (getRows(queryBuilder('automation_run_steps')
        .select('*')
        .where('automation_run_id', runId)
        .orderBy([
        'created_at',
        'id'
    ])));
    const getLockedStep = async (stepId) => {
        const { steps } = await repo.fetchAndLockSteps(10);
        const step = steps.find(candidate => candidate.id === stepId);
        (0, strict_1.default)(step);
        return step;
    };
    const assertSingleBatchLock = (steps) => {
        const lockId = steps[0]?.locked_by;
        strict_1.default.equal(typeof lockId, 'string');
        (0, strict_1.default)(steps.every(step => step.locked_by === lockId));
        return lockId;
    };
    const changeWaitHours = (action, waitHours) => {
        strict_1.default.equal(action.type, 'wait');
        return {
            ...action,
            data: {
                wait_hours: waitHours
            }
        };
    };
    beforeEach(function () {
        database = (0, temporary_fake_database_1.createTemporaryFakeAutomationsDatabase)();
        repo = (0, fake_database_automations_repository_1.createFakeDatabaseAutomationsRepository)({
            getDatabase: () => database
        });
    });
    afterEach(function () {
        sinon_1.default.restore();
        database.close();
    });
    describe('trigger', function () {
        it('can trigger an automation for a free member', async function () {
            await repo.trigger({
                memberEmail: 'free@example.com',
                memberId: 'member_123',
                memberStatus: 'free'
            });
            const run = getRunByMemberEmail('free@example.com');
            (0, strict_1.default)(run);
            strict_1.default.equal(run.member_email, 'free@example.com');
            strict_1.default.equal(run.member_id, 'member_123');
            strict_1.default.equal(run.automation_slug, 'member-welcome-email-free');
            strict_1.default.equal(run.created_at, run.updated_at);
            const step = getStepByRunId(run.id);
            (0, strict_1.default)(step);
            strict_1.default.equal(step.automation_run_id, run.id);
            strict_1.default.equal(step.action_type, 'wait');
            strict_1.default.equal(step.wait_hours, 48);
            strict_1.default.equal(step.created_at, run.created_at);
            strict_1.default.equal(step.updated_at, run.updated_at);
            strict_1.default.equal(step.ready_at, addHours(run.created_at, 48).toISOString());
            strict_1.default.equal(step.step_attempts, 0);
            strict_1.default.equal(step.started_at, null);
            strict_1.default.equal(step.finished_at, null);
            strict_1.default.equal(step.status, 'pending');
            strict_1.default.equal(step.locked_by, null);
            strict_1.default.equal(step.locked_at, null);
        });
        it('can trigger an automation for a paid member', async function () {
            await repo.trigger({
                memberEmail: 'paid@example.com',
                memberId: 'member_123',
                memberStatus: 'paid'
            });
            const run = getRunByMemberEmail('paid@example.com');
            (0, strict_1.default)(run);
            strict_1.default.equal(run.automation_slug, 'member-welcome-email-paid');
            const step = getStepByRunId(run.id);
            (0, strict_1.default)(step);
            strict_1.default.equal(step.automation_run_id, run.id);
            strict_1.default.equal(step.action_type, 'wait');
        });
        it('inserts the first non-deleted step', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            await repo.edit(automation.id, {
                status: 'active',
                actions: [
                    {
                        id: 'wait-action-to-delete',
                        type: 'wait',
                        data: { wait_hours: 72 }
                    },
                    {
                        id: 'main-wait-action',
                        type: 'wait',
                        data: { wait_hours: 24 }
                    }
                ],
                edges: [{
                        source_action_id: 'wait-action-to-delete',
                        target_action_id: 'main-wait-action'
                    }]
            });
            await repo.edit(automation.id, {
                status: 'active',
                actions: [
                    {
                        id: 'main-wait-action',
                        type: 'wait',
                        data: { wait_hours: 24 }
                    }
                ],
                edges: []
            });
            await repo.trigger({
                memberEmail: 'free@example.com',
                memberId: 'member_123',
                memberStatus: 'free'
            });
            const run = getRunByMemberEmail('free@example.com');
            (0, strict_1.default)(run);
            const step = getStepByRunId(run.id);
            (0, strict_1.default)(step);
            strict_1.default.equal(step.action_id, 'main-wait-action');
        });
        it('does not trigger an automation for an inactive automation', async function () {
            const freeAutomation = await getAutomationBySlug('member-welcome-email-free');
            await repo.edit(freeAutomation.id, {
                ...freeAutomation,
                status: 'inactive'
            });
            await repo.trigger({
                memberEmail: 'inactive-free@example.com',
                memberId: 'member_123',
                memberStatus: 'free'
            });
            strict_1.default.equal(getRunByMemberEmail('inactive-free@example.com'), undefined);
            strict_1.default.equal(getRunCountByAutomationId(freeAutomation.id), 0);
        });
        it('does not trigger an automation for an automation with no actions', async function () {
            const freeAutomation = await getAutomationBySlug('member-welcome-email-free');
            await repo.edit(freeAutomation.id, {
                status: 'active',
                actions: [],
                edges: []
            });
            await repo.trigger({
                memberEmail: 'free-no-actions@example.com',
                memberId: 'member_123',
                memberStatus: 'free'
            });
            strict_1.default.equal(getRunByMemberEmail('free-no-actions@example.com'), undefined);
            strict_1.default.equal(getRunCountByAutomationId(freeAutomation.id), 0);
        });
    });
    describe('edit', function () {
        it('only inserts action revisions when action data changes', async function () {
            const initialAutomation = await getAutomationBySlug('member-welcome-email-free');
            const initialRevisionCount = getRevisionCount();
            const waitAction = initialAutomation.actions.find(action => action.type === 'wait');
            const unchangedEmailAction = initialAutomation.actions.find(action => action.type === 'send_email');
            (0, strict_1.default)(waitAction);
            (0, strict_1.default)(unchangedEmailAction);
            strict_1.default.equal(getRevisionCount(waitAction.id), 1);
            strict_1.default.equal(getRevisionCount(unchangedEmailAction.id), 1);
            await repo.edit(initialAutomation.id, {
                status: 'inactive',
                actions: initialAutomation.actions,
                edges: initialAutomation.edges
            });
            strict_1.default.equal(getRevisionCount(), initialRevisionCount);
            strict_1.default.equal(getRevisionCount(waitAction.id), 1);
            strict_1.default.equal(getRevisionCount(unchangedEmailAction.id), 1);
            const changedWaitAction = changeWaitHours(waitAction, waitAction.data.wait_hours + 24);
            await repo.edit(initialAutomation.id, {
                status: 'inactive',
                actions: [changedWaitAction, unchangedEmailAction],
                edges: [{
                        source_action_id: changedWaitAction.id,
                        target_action_id: unchangedEmailAction.id
                    }]
            });
            strict_1.default.equal(getRevisionCount(), initialRevisionCount + 1);
            strict_1.default.equal(getRevisionCount(waitAction.id), 2);
            strict_1.default.equal(getRevisionCount(unchangedEmailAction.id), 1);
            const addedActionId = (0, bson_objectid_1.default)().toString();
            const addedAction = {
                id: addedActionId,
                type: 'wait',
                data: {
                    wait_hours: 72
                }
            };
            await repo.edit(initialAutomation.id, {
                status: 'inactive',
                actions: [changedWaitAction, unchangedEmailAction, addedAction],
                edges: [
                    {
                        source_action_id: changedWaitAction.id,
                        target_action_id: unchangedEmailAction.id
                    },
                    {
                        source_action_id: unchangedEmailAction.id,
                        target_action_id: addedActionId
                    }
                ]
            });
            strict_1.default.equal(getRevisionCount(), initialRevisionCount + 2);
            strict_1.default.equal(getRevisionCount(waitAction.id), 2);
            strict_1.default.equal(getRevisionCount(unchangedEmailAction.id), 1);
            strict_1.default.equal(getRevisionCount(addedActionId), 1);
        });
    });
    describe('fetchAndLockSteps', function () {
        const simulateLockRace = (contendedStepId) => {
            let hasSimulatedLock = false;
            const originalPrepare = database.prepare.bind(database);
            sinon_1.default.stub(database, 'prepare').callsFake((source) => {
                const statement = originalPrepare(source);
                const normalizedSource = source.toLowerCase();
                const shouldSimulateLockBySomeoneElse = (!hasSimulatedLock &&
                    normalizedSource.includes('select `id`') &&
                    normalizedSource.includes('from `automation_run_steps`'));
                if (!shouldSimulateLockBySomeoneElse) {
                    return statement;
                }
                const originalAll = statement.all.bind(statement);
                sinon_1.default.stub(statement, 'all').callsFake((...args) => {
                    const result = originalAll(...args);
                    hasSimulatedLock = true;
                    const lockedAt = new Date().toISOString();
                    const { sql, bindings } = toNativeQuery(queryBuilder('automation_run_steps')
                        .update({
                        locked_by: 'contending-lock',
                        locked_at: lockedAt,
                        started_at: lockedAt,
                        updated_at: lockedAt
                    })
                        .where('id', contendedStepId));
                    originalPrepare(sql).run(...bindings);
                    return result;
                });
                return statement;
            });
        };
        it('locks ready and steps with stale locks, but skips future and recently-locked steps', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const readyStep = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const staleLockStep = insertStep(run.id, action.revision_id, {
                locked_at: new Date(Date.now() - (31 * 60 * 1000)).toISOString(),
                ready_at: new Date(Date.now() - 1000).toISOString(),
                locked_by: 'old-lock',
                step_attempts: 2
            });
            const finishedStep = insertStep(run.id, action.revision_id, {
                finished_at: new Date(Date.now() - 1000).toISOString(),
                locked_at: new Date(Date.now() - (31 * 60 * 1000)).toISOString(),
                ready_at: new Date(Date.now() - 1000).toISOString(),
                locked_by: 'finished-lock',
                status: 'finished',
                step_attempts: 4
            });
            const futureReadyAt = new Date(Date.now() + 60 * 1000);
            const notReadyYetStep = insertStep(run.id, action.revision_id, {
                ready_at: futureReadyAt.toISOString()
            });
            const recentlyLockedStep = insertStep(run.id, action.revision_id, {
                locked_at: new Date(Date.now() - (29 * 60 * 1000)).toISOString(),
                ready_at: new Date(Date.now() - 1000).toISOString(),
                locked_by: 'fresh-lock'
            });
            const result = await repo.fetchAndLockSteps(10);
            const actualStepIds = new Set(result.steps.map(step => step.id));
            const expectedStepIds = new Set([readyStep.id, staleLockStep.id]);
            strict_1.default.deepEqual(actualStepIds, expectedStepIds);
            strict_1.default.equal(result.nextStepReadyAt?.toISOString(), futureReadyAt.toISOString());
            const lockId = assertSingleBatchLock(result.steps);
            const lockedReady = getStepById(readyStep.id);
            strict_1.default.equal(lockedReady.status, 'pending');
            strict_1.default.equal(lockedReady.step_attempts, 1);
            strict_1.default.equal(lockedReady.locked_by, lockId);
            const lockedStaleLock = getStepById(staleLockStep.id);
            strict_1.default.equal(lockedStaleLock.status, 'pending');
            strict_1.default.equal(lockedStaleLock.step_attempts, 3);
            strict_1.default.equal(lockedStaleLock.locked_by, lockId);
            const skippedFinished = getStepById(finishedStep.id);
            strict_1.default.equal(skippedFinished.status, 'finished');
            strict_1.default.equal(skippedFinished.step_attempts, 4);
            strict_1.default.equal(skippedFinished.locked_by, 'finished-lock');
            const skippedNotReadyYet = getStepById(notReadyYetStep.id);
            strict_1.default.equal(skippedNotReadyYet.step_attempts, 0);
            strict_1.default.equal(skippedNotReadyYet.locked_by, null);
            const skippedRecentlyLocked = getStepById(recentlyLockedStep.id);
            strict_1.default.equal(skippedRecentlyLocked.step_attempts, 0);
            strict_1.default.equal(skippedRecentlyLocked.locked_by, 'fresh-lock');
        });
        it('returns the next future pending ready_at when no steps can be locked', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const later = new Date(Date.now() + 60 * 1000);
            const sooner = new Date(Date.now() + 30 * 1000);
            insertStep(run.id, action.revision_id, { ready_at: later.toISOString() });
            insertStep(run.id, action.revision_id, { ready_at: sooner.toISOString() });
            const result = await repo.fetchAndLockSteps(10);
            strict_1.default.deepEqual(result.steps, []);
            (0, strict_1.default)(result.nextStepReadyAt);
            strict_1.default.equal(result.nextStepReadyAt.toISOString(), sooner.toISOString());
        });
        it('does not schedule an immediate poll when due steps are locked by another worker', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const lockedAt = new Date(Date.now() - 60 * 1000);
            insertStep(run.id, action.revision_id, {
                locked_at: lockedAt.toISOString(),
                ready_at: new Date(Date.now() - 1000).toISOString(),
                locked_by: 'fresh-lock'
            });
            const result = await repo.fetchAndLockSteps(10);
            strict_1.default.deepEqual(result.steps, []);
            strict_1.default.equal(result.nextStepReadyAt, null);
        });
        it('respects the limit argument', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const readyAt1 = new Date(Date.now() - 2000).toISOString();
            const readyAt2 = new Date(Date.now() - 1000).toISOString();
            const firstStep = insertStep(run.id, action.revision_id, { ready_at: readyAt1 });
            const secondStep = insertStep(run.id, action.revision_id, { ready_at: readyAt1 });
            const thirdStep = insertStep(run.id, action.revision_id, { ready_at: readyAt2 });
            const result = await repo.fetchAndLockSteps(2);
            strict_1.default.equal(result.steps.length, 2);
            strict_1.default.equal(result.nextStepReadyAt?.toISOString(), readyAt2);
            const lockId = assertSingleBatchLock(result.steps);
            const first = getStepById(firstStep.id);
            const second = getStepById(secondStep.id);
            const third = getStepById(thirdStep.id);
            const allSteps = [first, second, third];
            const lockedSteps = allSteps.filter(step => step.locked_by === lockId);
            strict_1.default.equal(lockedSteps.length, 2);
            const notLockedSteps = allSteps.filter(step => step.locked_by !== lockId);
            strict_1.default.equal(notLockedSteps.length, 1);
            const [notLockedStep] = notLockedSteps;
            (0, strict_1.default)(notLockedStep);
            strict_1.default.equal(notLockedStep.locked_by, null);
            strict_1.default.equal(notLockedStep.step_attempts, 0);
        });
        it('does not return the same steps to concurrent callers', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const readyAt = new Date(Date.now() - 1000).toISOString();
            const readySteps = [
                insertStep(run.id, action.revision_id, { ready_at: readyAt }),
                insertStep(run.id, action.revision_id, { ready_at: readyAt }),
                insertStep(run.id, action.revision_id, { ready_at: readyAt }),
                insertStep(run.id, action.revision_id, { ready_at: readyAt })
            ];
            const [firstResult, secondResult] = await Promise.all([
                repo.fetchAndLockSteps(2),
                repo.fetchAndLockSteps(2)
            ]);
            const firstStepIds = new Set(firstResult.steps.map(step => step.id));
            const secondStepIds = new Set(secondResult.steps.map(step => step.id));
            strict_1.default.equal(firstStepIds.size, firstResult.steps.length);
            strict_1.default.equal(secondStepIds.size, secondResult.steps.length);
            strict_1.default.equal([...firstStepIds].some(id => secondStepIds.has(id)), false);
            const firstLockId = assertSingleBatchLock(firstResult.steps);
            const secondLockId = assertSingleBatchLock(secondResult.steps);
            strict_1.default.notEqual(firstLockId, secondLockId);
            const allSteps = readySteps.map(step => getStepById(step.id));
            const lockedSteps = allSteps.filter(step => step.locked_by !== null);
            strict_1.default.equal(lockedSteps.length, firstResult.steps.length + secondResult.steps.length);
            (0, strict_1.default)(lockedSteps.length <= readySteps.length);
        });
        it('handles concurrent locks in the same transaction', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const readyAt = new Date(Date.now() - 1000).toISOString();
            const availableStep = insertStep(run.id, action.revision_id, { ready_at: readyAt });
            const contendedStep = insertStep(run.id, action.revision_id, { ready_at: readyAt });
            simulateLockRace(contendedStep.id);
            const result = await repo.fetchAndLockSteps(2);
            const actualStepIds = new Set(result.steps.map(step => step.id));
            const expectedStepIds = new Set([availableStep.id]);
            strict_1.default.deepEqual(actualStepIds, expectedStepIds);
        });
        it('returns the next unlocked ready_at when selected rows lose the lock race', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const readyAt = new Date(Date.now() - 1000).toISOString();
            const contendedStep = insertStep(run.id, action.revision_id, {
                created_at: new Date(Date.now() - 2000).toISOString(),
                ready_at: readyAt
            });
            insertStep(run.id, action.revision_id, {
                created_at: new Date(Date.now() - 1000).toISOString(),
                ready_at: readyAt
            });
            simulateLockRace(contendedStep.id);
            const result = await repo.fetchAndLockSteps(1);
            strict_1.default.deepEqual(result.steps, []);
            (0, strict_1.default)(result.nextStepReadyAt);
            strict_1.default.equal(result.nextStepReadyAt.toISOString(), readyAt);
        });
    });
    describe('finishStepAndEnqueueNext', function () {
        it('finishes a locked step and enqueues the next action revision', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const lockedStep = getStepById(step.id);
            const beforeFinish = Date.now();
            const nextReadyAt = await repo.finishStepAndEnqueueNext(step);
            const afterFinish = Date.now();
            (0, strict_1.default)(nextReadyAt);
            (0, strict_1.default)(nextReadyAt.getTime() >= beforeFinish);
            (0, strict_1.default)(nextReadyAt.getTime() <= afterFinish);
            const finished = getStepById(stepRow.id);
            strict_1.default.equal(finished.status, 'finished');
            strict_1.default.equal(finished.locked_by, null);
            strict_1.default.equal(finished.locked_at, null);
            strict_1.default.equal(finished.started_at, lockedStep.started_at);
            strict_1.default.equal(finished.ready_at, stepRow.ready_at);
            strict_1.default.equal(finished.step_attempts, 1);
            strict_1.default.equal(typeof finished.finished_at, 'string');
            const allSteps = getStepsByRunId(run.id);
            strict_1.default.equal(allSteps.length, 2);
            const nextStep = allSteps.find(candidate => candidate.id !== stepRow.id);
            (0, strict_1.default)(nextStep);
            const nextAction = getActionByIndex(automation.id, 1);
            strict_1.default.equal(nextStep.automation_run_id, run.id);
            strict_1.default.equal(nextStep.automation_action_revision_id, nextAction.revision_id);
            strict_1.default.equal(nextStep.status, 'pending');
            strict_1.default.equal(nextStep.ready_at, nextReadyAt.toISOString());
        });
        it('uses wait hours when the next action is a wait action', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const sendEmailAction = getActionByIndex(automation.id, 1);
            strict_1.default.equal(sendEmailAction.action_type, 'send_email');
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, sendEmailAction.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const beforeFinish = Date.now();
            const nextReadyAt = await repo.finishStepAndEnqueueNext(step);
            const afterFinish = Date.now();
            (0, strict_1.default)(nextReadyAt);
            (0, strict_1.default)(nextReadyAt.getTime() >= beforeFinish + (72 * HOUR_MS));
            (0, strict_1.default)(nextReadyAt.getTime() <= afterFinish + (72 * HOUR_MS));
        });
        it('does not enqueue a duplicate next step when called again with the same locked step', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const firstNextReadyAt = await repo.finishStepAndEnqueueNext(step);
            const secondNextReadyAt = await repo.finishStepAndEnqueueNext(step);
            (0, strict_1.default)(firstNextReadyAt);
            strict_1.default.equal(secondNextReadyAt, null);
            const allSteps = getStepsByRunId(run.id);
            strict_1.default.equal(allSteps.length, 2);
            const finished = getStepById(stepRow.id);
            strict_1.default.equal(finished.status, 'finished');
            strict_1.default.equal(finished.locked_by, null);
            strict_1.default.equal(finished.locked_at, null);
        });
        it('does not finish or enqueue if the step lock has been taken by another runner', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const otherLockedAt = new Date().toISOString();
            runQuery(queryBuilder('automation_run_steps')
                .update({
                locked_by: 'other-runner-lock',
                locked_at: otherLockedAt,
                updated_at: otherLockedAt
            })
                .where('id', stepRow.id));
            const nextReadyAt = await repo.finishStepAndEnqueueNext(step);
            strict_1.default.equal(nextReadyAt, null);
            const unchanged = getStepById(stepRow.id);
            strict_1.default.equal(unchanged.status, 'pending');
            strict_1.default.equal(unchanged.locked_by, 'other-runner-lock');
            strict_1.default.equal(unchanged.locked_at, otherLockedAt);
            strict_1.default.equal(unchanged.finished_at, null);
            const allSteps = getStepsByRunId(run.id);
            strict_1.default.equal(allSteps.length, 1);
        });
        it('returns null and does not enqueue when there is no next action', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const lastAction = getActionByIndex(automation.id, 3);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, lastAction.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const nextReadyAt = await repo.finishStepAndEnqueueNext(step);
            strict_1.default.equal(nextReadyAt, null);
            const finished = getStepById(stepRow.id);
            strict_1.default.equal(finished.status, 'finished');
            strict_1.default.equal(finished.locked_by, null);
            strict_1.default.equal(finished.locked_at, null);
            const allSteps = getStepsByRunId(run.id);
            strict_1.default.equal(allSteps.length, 1);
        });
        it('enqueues the latest revision of the next action', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const sendEmailAction = getActionByIndex(automation.id, 1);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, sendEmailAction.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const nextActionBeforeEdit = getActionByIndex(automation.id, 2);
            const waitAction = automation.actions.find(action => action.id === nextActionBeforeEdit.action_id);
            (0, strict_1.default)(waitAction);
            const updatedWaitAction = changeWaitHours(waitAction, 96);
            await repo.edit(automation.id, {
                status: automation.status,
                actions: automation.actions.map((action) => {
                    if (action.id === updatedWaitAction.id) {
                        return updatedWaitAction;
                    }
                    return action;
                }),
                edges: automation.edges
            });
            const updatedNextAction = getLatestActionRevisionByActionId(updatedWaitAction.id);
            strict_1.default.equal(updatedNextAction.wait_hours, 96);
            const beforeFinish = Date.now();
            const nextReadyAt = await repo.finishStepAndEnqueueNext(step);
            const afterFinish = Date.now();
            (0, strict_1.default)(nextReadyAt);
            (0, strict_1.default)(nextReadyAt.getTime() >= beforeFinish + (96 * HOUR_MS));
            (0, strict_1.default)(nextReadyAt.getTime() <= afterFinish + (96 * HOUR_MS));
            const allSteps = getStepsByRunId(run.id);
            strict_1.default.equal(allSteps.length, 2);
            const nextStep = allSteps.find(candidate => candidate.id !== stepRow.id);
            (0, strict_1.default)(nextStep);
            strict_1.default.equal(nextStep.automation_action_revision_id, updatedNextAction.revision_id);
            strict_1.default.equal(nextStep.ready_at, nextReadyAt.toISOString());
        });
    });
    describe('markStepTerminal', function () {
        it('marks a locked step with a terminal status and clears the lock', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const lockedStep = getStepById(step.id);
            strict_1.default.equal(typeof lockedStep.started_at, 'string');
            const beforeMark = Date.now();
            const didMark = await repo.markStepTerminal(step, 'member unsubscribed');
            const afterMark = Date.now();
            strict_1.default.equal(didMark, true);
            const marked = getStepById(step.id);
            strict_1.default.equal(marked.status, 'member unsubscribed');
            strict_1.default.equal(marked.locked_by, null);
            strict_1.default.equal(marked.locked_at, null);
            strict_1.default.equal(marked.started_at, lockedStep.started_at);
            strict_1.default.equal(marked.ready_at, lockedStep.ready_at);
            strict_1.default.equal(marked.step_attempts, 1);
            strict_1.default.equal(getStepsByRunId(run.id).length, 1);
            const markedFinishedAt = marked.finished_at;
            (0, strict_1.default)(typeof markedFinishedAt === 'string');
            (0, strict_1.default)(new Date(markedFinishedAt).getTime() >= beforeMark);
            (0, strict_1.default)(new Date(markedFinishedAt).getTime() <= afterMark);
        });
        it('does not overwrite a step that is no longer pending', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const finishedAt = new Date(Date.now() - 500).toISOString();
            runQuery(queryBuilder('automation_run_steps')
                .update({
                status: 'finished',
                finished_at: finishedAt,
                locked_at: null
            })
                .where('id', step.id));
            const didMark = await repo.markStepTerminal(step, 'member unsubscribed');
            strict_1.default.equal(didMark, false);
            const unchanged = getStepById(step.id);
            strict_1.default.equal(unchanged.status, 'finished');
            strict_1.default.equal(unchanged.finished_at, finishedAt);
            strict_1.default.equal(unchanged.locked_by, step.locked_by);
            strict_1.default.equal(unchanged.locked_at, null);
        });
        it('does not mark a step terminal if the step lock has been taken by another runner', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const otherLockedAt = new Date().toISOString();
            runQuery(queryBuilder('automation_run_steps')
                .update({
                locked_by: 'other-runner-lock',
                locked_at: otherLockedAt,
                updated_at: otherLockedAt
            })
                .where('id', stepRow.id));
            const beforeMark = getStepById(stepRow.id);
            const didMark = await repo.markStepTerminal(step, 'member unsubscribed');
            strict_1.default.equal(didMark, false);
            const unchanged = getStepById(stepRow.id);
            strict_1.default.deepEqual(unchanged, beforeMark);
        });
    });
    describe('retryStep', function () {
        it('reschedules a locked step for retry and clears the lock', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const retryAt = new Date(Date.now() + 60 * 1000);
            const beforeRetry = Date.now();
            const didRetry = await repo.retryStep(step, retryAt);
            const afterRetry = Date.now();
            strict_1.default.equal(didRetry, true);
            const retried = getStepById(step.id);
            strict_1.default.equal(retried.status, 'pending');
            strict_1.default.equal(retried.ready_at, retryAt.toISOString());
            strict_1.default.equal(retried.started_at, null);
            strict_1.default.equal(retried.finished_at, null);
            strict_1.default.equal(retried.locked_by, null);
            strict_1.default.equal(retried.locked_at, null);
            strict_1.default.equal(retried.step_attempts, 1);
            const retriedUpdatedAt = retried.updated_at;
            (0, strict_1.default)(typeof retriedUpdatedAt === 'string');
            (0, strict_1.default)(new Date(retriedUpdatedAt).getTime() >= beforeRetry);
            (0, strict_1.default)(new Date(retriedUpdatedAt).getTime() <= afterRetry);
        });
        it('does not retry a locked step that is no longer pending', async function () {
            const automation = await getAutomationBySlug('member-welcome-email-free');
            const action = getActionByIndex(automation.id, 0);
            const run = insertRun(automation.id);
            const stepRow = insertStep(run.id, action.revision_id, {
                ready_at: new Date(Date.now() - 1000).toISOString()
            });
            const step = await getLockedStep(stepRow.id);
            const finishedAt = new Date(Date.now() - 500).toISOString();
            runQuery(queryBuilder('automation_run_steps')
                .update({
                status: 'finished',
                finished_at: finishedAt
            })
                .where('id', step.id));
            const beforeRetry = getStepById(step.id);
            const didRetry = await repo.retryStep(step, new Date(Date.now() + 1000));
            strict_1.default.equal(didRetry, false);
            const unchanged = getStepById(step.id);
            strict_1.default.deepEqual(unchanged, beforeRetry);
        });
    });
});
