"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFakeDatabaseAutomationsRepository = createFakeDatabaseAutomationsRepository;
const errors_1 = __importDefault(require("@tryghost/errors"));
const tpl_1 = __importDefault(require("@tryghost/tpl"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const bson_objectid_1 = __importDefault(require("bson-objectid"));
const dequal_1 = require("dequal");
const knex_1 = __importDefault(require("knex"));
const constants_1 = require("../member-welcome-emails/constants");
const constants_2 = require("./constants");
const HOUR_MS = 60 * 60 * 1000;
const queryBuilder = (0, knex_1.default)({ client: 'sqlite', useNullAsDefault: true });
const messages = {
    invalidAutomationActionRevision: 'Automation action "{actionId}" of type "{actionType}" is missing required revision field "{field}".',
    conflictingAutomationActionId: 'Automation action "{actionId}" already exists and cannot be inserted.',
    conflictingAutomationActionType: 'Automation action "{actionId}" already exists with a different type.'
};
function toNativeQuery(builder) {
    const { sql, bindings } = builder.toSQL().toNative();
    return {
        sql,
        bindings: bindings
    };
}
function getRow(database, builder) {
    const { sql, bindings } = toNativeQuery(builder);
    return database.prepare(sql).get(...bindings);
}
function getRows(database, builder) {
    const { sql, bindings } = toNativeQuery(builder);
    return database.prepare(sql).all(...bindings);
}
function runQuery(database, builder) {
    const { sql, bindings } = toNativeQuery(builder);
    return database.prepare(sql).run(...bindings);
}
function createFakeDatabaseAutomationsRepository({ getDatabase }) {
    return {
        async browse() {
            const database = getDatabase();
            return withTransaction(database, () => {
                const rows = loadAutomations(database).map(row => buildAutomationSummary(row));
                return {
                    data: rows,
                    meta: {
                        pagination: buildPagination(rows.length)
                    }
                };
            });
        },
        async getById(id) {
            const database = getDatabase();
            return withTransaction(database, () => {
                const automation = loadAutomation(database, id);
                if (!automation) {
                    return null;
                }
                return buildAutomation(database, automation);
            });
        },
        async edit(id, data) {
            const database = getDatabase();
            return withTransaction(database, () => {
                const automation = loadAutomation(database, id);
                if (!automation) {
                    return null;
                }
                const updatedAutomation = updateAutomation(database, {
                    ...automation,
                    status: data.status,
                    updated_at: new Date().toISOString()
                });
                replaceAutomationGraph(database, updatedAutomation.id, data.actions, data.edges);
                return buildAutomation(database, updatedAutomation);
            });
        },
        async trigger(options) {
            const database = getDatabase();
            return withTransaction(database, () => trigger(database, options));
        },
        async fetchAndLockSteps(limit) {
            const database = getDatabase();
            return withTransaction(database, () => fetchAndLockSteps(database, limit));
        },
        async finishStepAndEnqueueNext(step) {
            const database = getDatabase();
            return withTransaction(database, () => finishStepAndEnqueueNext(database, step));
        },
        async markStepTerminal(step, status) {
            const database = getDatabase();
            return withTransaction(database, () => markStepTerminal(database, step, status));
        },
        async retryStep(step, retryAt) {
            const database = getDatabase();
            return withTransaction(database, () => retryStep(database, step, retryAt));
        }
    };
}
function withTransaction(database, operation) {
    database.exec('BEGIN TRANSACTION');
    try {
        const result = operation();
        database.exec('COMMIT');
        return result;
    }
    catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
}
function trigger(database, { memberEmail, memberId, memberStatus }) {
    const firstAction = findFirstActionRevision(database, memberStatus);
    if (!firstAction) {
        return;
    }
    const now = new Date();
    const nowString = now.toISOString();
    const readyAt = getReadyAtForAction(firstAction, now);
    const run = {
        id: (0, bson_objectid_1.default)().toHexString(),
        created_at: nowString,
        updated_at: nowString,
        automation_id: firstAction.automation_id,
        member_id: memberId,
        member_email: memberEmail
    };
    runQuery(database, queryBuilder('automation_runs').insert(run));
    insertRunStep(database, {
        automationRunId: run.id,
        automationActionRevisionId: firstAction.automation_action_revision_id,
        now,
        readyAt
    });
}
function insertRunStep(database, { automationRunId, automationActionRevisionId, now, readyAt }) {
    const nowString = now.toISOString();
    runQuery(database, queryBuilder('automation_run_steps').insert({
        id: (0, bson_objectid_1.default)().toHexString(),
        created_at: nowString,
        updated_at: nowString,
        automation_run_id: automationRunId,
        automation_action_revision_id: automationActionRevisionId,
        ready_at: readyAt.toISOString()
    }));
}
function fetchAndLockSteps(database, limit) {
    // Two things make this tricky:
    //
    // - We want to do row-level locking, so multiple calls don't step on each other.
    // - We can't `UPDATE` a fixed number of rows.
    //
    // To get around these problems, here's what we do:
    //
    // 1. Select up to `limit` candidate rows.
    // 2. Try to lock those rows.
    // 3. Select any rows we successfully locked.
    const now = new Date();
    const nowString = now.toISOString();
    const staleLockCutoff = new Date(now.getTime() - constants_2.LOCK_TIMEOUT_MS);
    const staleLockCutoffString = staleLockCutoff.toISOString();
    const lockId = node_crypto_1.default.randomUUID();
    // 1. Select up to `limit` candidate rows.
    const candidates = getRows(database, queryBuilder('automation_run_steps')
        .select('id')
        .where('status', 'pending')
        .where('ready_at', '<=', nowString)
        .where((builder) => {
        builder
            .whereNull('locked_by')
            .orWhere('locked_at', '<', staleLockCutoffString);
    })
        .orderBy([
        'ready_at',
        'created_at',
        'id'
    ])
        .limit(limit));
    if (candidates.length === 0) {
        return {
            steps: [],
            nextStepReadyAt: findNextPendingReadyAt(database, staleLockCutoff)
        };
    }
    const candidateIds = candidates.map(candidate => candidate.id);
    // 2. Try to lock those rows.
    runQuery(database, queryBuilder('automation_run_steps')
        .update({
        locked_by: lockId,
        locked_at: nowString,
        started_at: nowString,
        updated_at: nowString
    })
        .increment('step_attempts', 1)
        .whereIn('id', candidateIds)
        .where('status', 'pending')
        .where('ready_at', '<=', nowString)
        .where((builder) => {
        builder
            .whereNull('locked_by')
            .orWhere('locked_at', '<', staleLockCutoffString);
    }));
    // 3. Select any rows we successfully locked.
    const rows = getRows(database, queryBuilder('automation_run_steps as step')
        .select('step.id as id', 'step.locked_by as locked_by', 'step.automation_run_id as automation_run_id', 'run.automation_id as automation_id', 'automation.slug as automation_slug', 'automation.status as automation_status', 'run.member_id as member_id', 'run.member_email as member_email', 'action.id as action_id', 'revision.id as automation_action_revision_id', 'action.type as type', 'step.ready_at as ready_at', 'step.step_attempts as step_attempts', 'revision.wait_hours as wait_hours', 'revision.email_subject as email_subject', 'revision.email_lexical as email_lexical', 'revision.email_sender_name as email_sender_name', 'revision.email_sender_email as email_sender_email', 'revision.email_sender_reply_to as email_sender_reply_to', 'revision.email_design_setting_id as email_design_setting_id')
        .innerJoin('automation_runs as run', 'run.id', 'step.automation_run_id')
        .innerJoin('automations as automation', 'automation.id', 'run.automation_id')
        .innerJoin('automation_action_revisions as revision', 'revision.id', 'step.automation_action_revision_id')
        .innerJoin('automation_actions as action', 'action.id', 'revision.action_id')
        .where('step.locked_by', lockId)
        .orderBy([
        'step.ready_at',
        'step.created_at',
        'step.id'
    ]));
    return {
        steps: rows.map(row => buildStepToRun(row)),
        nextStepReadyAt: findNextPendingReadyAt(database, staleLockCutoff)
    };
}
function findNextPendingReadyAt(database, staleLockCutoff) {
    const row = getRow(database, queryBuilder('automation_run_steps')
        .min({ next_ready_at: 'ready_at' })
        .where('status', 'pending')
        .where((builder) => {
        builder
            .whereNull('locked_by')
            .orWhere('locked_at', '<', staleLockCutoff.toISOString());
    }));
    return row?.next_ready_at ? new Date(row.next_ready_at) : null;
}
function buildStepToRun(row) {
    const base = {
        id: row.id,
        step_attempts: row.step_attempts,
        ready_at: new Date(row.ready_at),
        locked_by: row.locked_by,
        automation_run_id: row.automation_run_id,
        automation_id: row.automation_id,
        automation_slug: row.automation_slug,
        automation_status: row.automation_status,
        member_id: row.member_id,
        member_email: row.member_email,
        action_id: row.action_id,
        automation_action_revision_id: row.automation_action_revision_id
    };
    switch (row.type) {
        case 'wait':
            return {
                ...base,
                type: 'wait',
                wait_hours: requireValue(row, 'wait_hours')
            };
        case 'send_email':
            return {
                ...base,
                type: 'send_email',
                email_subject: requireValue(row, 'email_subject'),
                email_lexical: requireValue(row, 'email_lexical'),
                email_sender_name: row.email_sender_name,
                email_sender_email: row.email_sender_email,
                email_sender_reply_to: row.email_sender_reply_to,
                email_design_setting_id: row.email_design_setting_id
            };
        default:
            throw new errors_1.default.InternalServerError({
                message: `Unexpected action type from database: ${row.type}`
            });
    }
}
function findFirstActionRevision(database, memberStatus) {
    const automationSlug = constants_1.MEMBER_WELCOME_EMAIL_SLUGS[memberStatus];
    const row = getRow(database, queryBuilder('automations as automation')
        .select('automation.id as automation_id', 'actions.id as action_id', 'revisions.id as automation_action_revision_id', 'actions.type as type', 'revisions.wait_hours as wait_hours')
        .innerJoin('automation_actions as actions', 'actions.automation_id', 'automation.id')
        .innerJoin('automation_action_revisions as revisions', 'revisions.action_id', 'actions.id')
        .where('automation.slug', automationSlug)
        .where('automation.status', 'active')
        .whereNull('actions.deleted_at')
        .whereNotExists(queryBuilder('automation_action_edges as edge')
        .select('edge.target_action_id')
        .innerJoin('automation_actions as source_actions', 'source_actions.id', 'edge.source_action_id')
        .whereNull('source_actions.deleted_at')
        .where('edge.target_action_id', queryBuilder.ref('actions.id')))
        .where('revisions.created_at', queryBuilder('automation_action_revisions')
        .max('created_at')
        .where('action_id', queryBuilder.ref('actions.id')))
        .orderBy([
        'actions.created_at',
        'actions.id'
    ])
        .limit(1));
    return row ?? null;
}
function finishStepAndEnqueueNext(database, step) {
    const didFinish = markStepTerminal(database, step, 'finished');
    if (!didFinish) {
        return null;
    }
    const next = findNextActionRevision(database, step.action_id);
    if (!next) {
        return null;
    }
    const now = new Date();
    const nextReadyAt = getReadyAtForAction(next, now);
    insertRunStep(database, {
        automationRunId: step.automation_run_id,
        automationActionRevisionId: next.automation_action_revision_id,
        now,
        readyAt: nextReadyAt
    });
    return nextReadyAt;
}
function findNextActionRevision(database, sourceActionId) {
    const row = getRow(database, queryBuilder('automation_action_edges as edge')
        .select('action.id as action_id', 'revision.id as automation_action_revision_id', 'action.type as type', 'revision.wait_hours as wait_hours')
        .innerJoin('automation_actions as action', 'action.id', 'edge.target_action_id')
        .innerJoin('automation_action_revisions as revision', 'revision.action_id', 'action.id')
        .where('edge.source_action_id', sourceActionId)
        .whereNull('action.deleted_at')
        .where('revision.created_at', queryBuilder('automation_action_revisions')
        .max('created_at')
        .where('action_id', queryBuilder.ref('action.id')))
        .orderBy('revision.created_at', 'desc')
        .orderBy('revision.id', 'desc')
        .limit(1));
    return row ?? null;
}
function markStepTerminal(database, step, status) {
    const nowString = new Date().toISOString();
    return updateStep(database, step, {
        status,
        finished_at: nowString,
        updated_at: nowString
    });
}
function retryStep(database, step, retryAt) {
    const nowString = new Date().toISOString();
    return updateStep(database, step, {
        status: 'pending',
        started_at: null,
        finished_at: null,
        ready_at: retryAt.toISOString(),
        updated_at: nowString
    });
}
function getReadyAtForAction(action, now) {
    switch (action.type) {
        case 'wait': {
            const waitHours = requireValue({
                ...action,
                id: action.action_id
            }, 'wait_hours');
            const waitMs = waitHours * HOUR_MS;
            return new Date(now.getTime() + waitMs);
        }
        case 'send_email':
            return now;
        default: {
            const _exhaustive = action.type;
            throw new errors_1.default.IncorrectUsageError({
                message: `Unexpected action type ${_exhaustive}`
            });
        }
    }
}
/**
 * Update a step. Returns whether the update succeeded.
 *
 * Should only update locked steps to avoid race conditions. Imagine the following scenario:
 *
 * 1. A step is locked by Worker A.
 * 2. The lock expires.
 * 3. The step is locked by Worker B.
 * 4. Worker A finishes its work.
 *
 * Worker A has lost its lock, so it shouldn't be updating the step any more.
 */
function updateStep(database, step, attrs) {
    /* eslint-disable camelcase */
    const { started_at, finished_at, ready_at } = attrs;
    const result = runQuery(database, queryBuilder('automation_run_steps')
        .update({
        status: attrs.status,
        updated_at: attrs.updated_at,
        locked_by: null,
        locked_at: null,
        ...(started_at === undefined ? {} : { started_at }),
        ...(finished_at === undefined ? {} : { finished_at }),
        ...(ready_at === undefined ? {} : { ready_at })
    })
        .where('id', step.id)
        .where('status', 'pending')
        .where('locked_by', step.locked_by));
    /* eslint-enable camelcase */
    return result.changes >= 1;
}
function loadAutomation(database, automationId) {
    const automation = getRow(database, queryBuilder('automations')
        .select('id', 'slug', 'name', 'status', 'created_at', 'updated_at')
        .where('id', automationId));
    return automation ?? null;
}
function loadAutomations(database) {
    return getRows(database, queryBuilder('automations')
        .select('id', 'slug', 'name', 'status', 'created_at', 'updated_at')
        .orderBy([
        'created_at',
        'id'
    ]));
}
function updateAutomation(database, automation) {
    runQuery(database, queryBuilder('automations')
        .update({
        status: automation.status,
        updated_at: automation.updated_at
    })
        .where('id', automation.id));
    return requireAutomation(loadAutomation(database, automation.id), automation.id);
}
function replaceAutomationGraph(database, automationId, actions, edges) {
    const existingActions = loadAutomationActionRows(database, automationId);
    const existingActionIds = new Set(existingActions.map(action => action.id));
    const submittedActionIds = new Set(actions.map(action => action.id));
    const now = new Date().toISOString();
    for (const action of actions) {
        if (existingActionIds.has(action.id)) {
            const existingAction = existingActions.find(({ id }) => id === action.id);
            if (existingAction?.type !== action.type) {
                throw new errors_1.default.ValidationError({
                    message: (0, tpl_1.default)(messages.conflictingAutomationActionType, {
                        actionId: action.id
                    }),
                    property: 'actions.type'
                });
            }
        }
        else {
            if (loadActionOwner(database, action.id)) {
                throw new errors_1.default.ValidationError({
                    message: (0, tpl_1.default)(messages.conflictingAutomationActionId, {
                        actionId: action.id
                    }),
                    property: 'actions.id'
                });
            }
            insertAction(database, {
                id: action.id,
                created_at: now,
                updated_at: now,
                automation_id: automationId,
                type: action.type
            });
        }
        const latestRevision = loadLatestActionRevision(database, action.id);
        if (shouldInsertActionRevision(action, latestRevision)) {
            insertActionRevision(database, action.id, action, now, latestRevision);
        }
    }
    for (const existingAction of existingActions) {
        if (!submittedActionIds.has(existingAction.id)) {
            softDeleteAction(database, existingAction.id, now);
        }
    }
    deleteAutomationEdges(database, automationId);
    for (const edge of edges) {
        insertActionEdge(database, edge);
    }
}
function loadAutomationActionRows(database, automationId) {
    return getRows(database, queryBuilder('automation_actions')
        .select('id', 'type')
        .where('automation_id', automationId)
        .whereNull('deleted_at'));
}
function loadActionOwner(database, actionId) {
    const row = getRow(database, queryBuilder('automation_actions')
        .select('automation_id')
        .where('id', actionId));
    return row?.automation_id ?? null;
}
function insertAction(database, action) {
    runQuery(database, queryBuilder('automation_actions').insert(action));
}
function shouldInsertActionRevision(action, latestRevision) {
    if (!latestRevision) {
        return true;
    }
    return !(0, dequal_1.dequal)(buildRevisionActionData(action, latestRevision), action.data);
}
function buildRevisionActionData(action, revision) {
    switch (action.type) {
        case 'wait':
            return {
                wait_hours: revision.wait_hours
            };
        case 'send_email':
            return {
                email_subject: revision.email_subject,
                email_lexical: revision.email_lexical,
                email_sender_name: revision.email_sender_name,
                email_sender_email: revision.email_sender_email,
                email_sender_reply_to: revision.email_sender_reply_to,
                email_design_setting_id: revision.email_design_setting_id
            };
        default: {
            const _exhaustive = action;
            throw new errors_1.default.InternalServerError({
                message: `Unhandled action type: ${_exhaustive}`
            });
        }
    }
}
function loadLatestActionRevision(database, actionId) {
    const row = getRow(database, queryBuilder('automation_action_revisions')
        .select('action_id', 'created_at', 'wait_hours', 'email_subject', 'email_lexical', 'email_sender_name', 'email_sender_email', 'email_sender_reply_to', 'email_design_setting_id')
        .where('action_id', actionId)
        .where('created_at', queryBuilder('automation_action_revisions')
        .max('created_at')
        .where('action_id', actionId)));
    return row ?? null;
}
function softDeleteAction(database, actionId, deletedAt) {
    runQuery(database, queryBuilder('automation_actions')
        .update({
        deleted_at: deletedAt,
        updated_at: deletedAt
    })
        .where('id', actionId));
}
function insertActionRevision(database, actionId, action, createdAt, latestRevision) {
    const revision = buildActionRevision(actionId, action, getNextRevisionCreatedAt(latestRevision?.created_at ?? null, createdAt));
    runQuery(database, queryBuilder('automation_action_revisions').insert(revision));
}
function getNextRevisionCreatedAt(latestCreatedAt, requestedCreatedAt) {
    if (!latestCreatedAt) {
        return requestedCreatedAt;
    }
    const requestedTime = new Date(requestedCreatedAt).getTime();
    const latestTime = new Date(latestCreatedAt).getTime();
    if (requestedTime > latestTime) {
        return requestedCreatedAt;
    }
    return new Date(latestTime + 1).toISOString();
}
function buildActionRevision(actionId, action, createdAt) {
    if (action.type === 'wait') {
        return {
            id: (0, bson_objectid_1.default)().toString(),
            created_at: createdAt,
            action_id: actionId,
            wait_hours: action.data.wait_hours,
            email_subject: null,
            email_lexical: null,
            email_sender_name: null,
            email_sender_email: null,
            email_sender_reply_to: null,
            email_design_setting_id: null
        };
    }
    return {
        id: (0, bson_objectid_1.default)().toString(),
        created_at: createdAt,
        action_id: actionId,
        wait_hours: null,
        email_subject: action.data.email_subject,
        email_lexical: action.data.email_lexical,
        email_sender_name: action.data.email_sender_name,
        email_sender_email: action.data.email_sender_email,
        email_sender_reply_to: action.data.email_sender_reply_to,
        email_design_setting_id: action.data.email_design_setting_id
    };
}
function deleteAutomationEdges(database, automationId) {
    runQuery(database, queryBuilder('automation_action_edges')
        .delete()
        .whereIn('source_action_id', queryBuilder('automation_actions')
        .select('id')
        .where('automation_id', automationId)));
}
function insertActionEdge(database, edge) {
    runQuery(database, queryBuilder('automation_action_edges').insert({
        source_action_id: edge.source_action_id,
        target_action_id: edge.target_action_id
    }));
}
function requireAutomation(automation, id) {
    if (!automation) {
        throw new errors_1.default.InternalServerError({
            message: `Updated automation "${id}" could not be loaded.`
        });
    }
    return automation;
}
function buildAutomation(database, automation) {
    return {
        ...buildAutomationSummary(automation),
        actions: loadActionRows(database, automation.id).map(row => buildActionPayload(row)),
        edges: loadEdgeRows(database, automation.id).map(row => buildEdgePayload(row))
    };
}
function buildAutomationSummary(automation) {
    return {
        id: automation.id,
        slug: automation.slug,
        name: automation.name,
        status: automation.status,
        created_at: serializeDate(automation.created_at),
        updated_at: serializeDate(automation.updated_at)
    };
}
function serializeDate(date) {
    const normalizedDate = new Date(date);
    normalizedDate.setMilliseconds(0);
    return normalizedDate.toISOString();
}
function loadActionRows(database, automationId) {
    return getRows(database, queryBuilder('automation_actions as a')
        .select('a.id as id', 'a.type as type', 'r.wait_hours as wait_hours', 'r.email_subject as email_subject', 'r.email_lexical as email_lexical', 'r.email_sender_name as email_sender_name', 'r.email_sender_email as email_sender_email', 'r.email_sender_reply_to as email_sender_reply_to', 'r.email_design_setting_id as email_design_setting_id')
        .innerJoin('automation_action_revisions as r', 'r.action_id', 'a.id')
        .where('a.automation_id', automationId)
        .whereNull('a.deleted_at')
        .where('r.created_at', queryBuilder('automation_action_revisions')
        .max('created_at')
        .where('action_id', queryBuilder.ref('a.id')))
        .orderBy([
        'a.created_at',
        'a.id'
    ]));
}
function loadEdgeRows(database, automationId) {
    return getRows(database, queryBuilder('automation_action_edges as e')
        .select('e.source_action_id', 'e.target_action_id')
        .innerJoin('automation_actions as source_action', (join) => {
        join
            .on('source_action.id', 'e.source_action_id')
            .onNull('source_action.deleted_at');
    })
        .innerJoin('automation_actions as target_action', (join) => {
        join
            .on('target_action.id', 'e.target_action_id')
            .onNull('target_action.deleted_at')
            .on('target_action.automation_id', 'source_action.automation_id');
    })
        .where('source_action.automation_id', automationId)
        .orderBy([
        'e.source_action_id',
        'e.target_action_id'
    ]));
}
function buildActionPayload(row) {
    switch (row.type) {
        case 'wait':
            return {
                id: row.id,
                type: 'wait',
                data: {
                    wait_hours: requireValue(row, 'wait_hours')
                }
            };
        case 'send_email':
            return {
                id: row.id,
                type: 'send_email',
                data: {
                    email_subject: requireValue(row, 'email_subject'),
                    email_lexical: requireValue(row, 'email_lexical'),
                    email_sender_name: row.email_sender_name,
                    email_sender_email: row.email_sender_email,
                    email_sender_reply_to: row.email_sender_reply_to,
                    email_design_setting_id: requireValue(row, 'email_design_setting_id')
                }
            };
    }
}
function requireValue(row, field) {
    const value = row[field];
    if ((value === null) || (value === undefined)) {
        throw new errors_1.default.InternalServerError({
            message: (0, tpl_1.default)(messages.invalidAutomationActionRevision, {
                actionId: row.id,
                actionType: row.type,
                field
            })
        });
    }
    return value;
}
function buildEdgePayload(edge) {
    return {
        source_action_id: edge.source_action_id,
        target_action_id: edge.target_action_id
    };
}
function buildPagination(total) {
    return {
        page: 1,
        pages: 1,
        limit: 'all',
        total,
        prev: null,
        next: null
    };
}
