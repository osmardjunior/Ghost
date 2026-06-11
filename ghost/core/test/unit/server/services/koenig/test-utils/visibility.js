"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDefaultVisibility = exports.DEFAULT_VISIBILITY = exports.NO_MEMBERS_SEGMENT = exports.FREE_MEMBERS_SEGMENT = exports.PAID_MEMBERS_SEGMENT = exports.ALL_MEMBERS_SEGMENT = void 0;
exports.ALL_MEMBERS_SEGMENT = 'status:free,status:-free';
exports.PAID_MEMBERS_SEGMENT = 'status:-free'; // paid + comped + gift
exports.FREE_MEMBERS_SEGMENT = 'status:free';
exports.NO_MEMBERS_SEGMENT = '';
exports.DEFAULT_VISIBILITY = {
    web: {
        nonMember: true,
        memberSegment: exports.ALL_MEMBERS_SEGMENT
    },
    email: {
        memberSegment: exports.ALL_MEMBERS_SEGMENT
    }
};
const buildDefaultVisibility = () => JSON.parse(JSON.stringify(exports.DEFAULT_VISIBILITY));
exports.buildDefaultVisibility = buildDefaultVisibility;
