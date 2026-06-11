"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const lodash_1 = __importDefault(require("lodash"));
const role_utils_1 = require("../../../../core/server/models/role-utils");
describe('setIsRoles function behavior', function () {
    // create a fake 'loadedpermissions' object and then confirm the behavior of setIsRoles with it
    const loadedPermissionsEditor = {
        user: {
            roles: [{
                    name: 'Editor'
                }]
        }
    };
    const loadedPermissionsAdmin = {
        user: {
            roles: [{
                    name: 'Administrator'
                }]
        }
    };
    const loadedPermissionsAuthor = {
        user: {
            roles: [{
                    name: 'Author'
                }]
        }
    };
    const loadedPermissionsSuperEditor = {
        user: {
            roles: [{
                    name: 'Super Editor'
                }]
        }
    };
    const loadedPermissionsWithMultipleRoles = {
        user: {
            roles: [{
                    name: 'Editor'
                }, {
                    name: 'Author'
                }]
        }
    };
    const loadedPermissionsWithNoRoles = {
        user: {
            roles: []
        }
    };
    const loadedPermissionsWithNoUser = {
        user: null
    };
    const loadedPermissionswithPermissions = {
        user: {
            permissions: [{
                    id: 'posts.edit'
                }],
            roles: []
        }
    };
    it('returns an object', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsEditor);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
    });
    it('returns the correct object for Editor', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsEditor);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, true);
        strict_1.default.equal(result.isAuthor, false);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, true);
    });
    it('returns the correct object for Administrator', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsAdmin);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, true);
        strict_1.default.equal(result.isEditor, false);
        strict_1.default.equal(result.isAuthor, false);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, false);
    });
    it('returns the correct object for Author', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsAuthor);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, false);
        strict_1.default.equal(result.isAuthor, true);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, false);
    });
    it('returns the correct object for Super Editor', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsSuperEditor);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, false);
        strict_1.default.equal(result.isAuthor, false);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, true);
        strict_1.default.equal(result.isEitherEditor, true);
    });
    it('returns the correct object for multiple roles', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsWithMultipleRoles);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, true);
        strict_1.default.equal(result.isAuthor, true);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, true);
    });
    it('returns the correct object for no roles', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsWithNoRoles);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, false);
        strict_1.default.equal(result.isAuthor, false);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, false);
    });
    it('returns the correct object for no user', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionsWithNoUser);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, false);
        strict_1.default.equal(result.isAuthor, false);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, false);
    });
    it('returns the correct object for permissions without role', function () {
        let result = (0, role_utils_1.setIsRoles)(loadedPermissionswithPermissions);
        (0, strict_1.default)(lodash_1.default.isPlainObject(result));
        strict_1.default.equal(result.isOwner, false);
        strict_1.default.equal(result.isAdmin, false);
        strict_1.default.equal(result.isEditor, false);
        strict_1.default.equal(result.isAuthor, false);
        strict_1.default.equal(result.isContributor, false);
        strict_1.default.equal(result.isSuperEditor, false);
        strict_1.default.equal(result.isEitherEditor, false);
    });
});
