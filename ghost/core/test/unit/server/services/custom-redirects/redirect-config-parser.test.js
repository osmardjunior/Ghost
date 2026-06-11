"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const redirect_config_parser_1 = require("../../../../../core/server/services/custom-redirects/redirect-config-parser");
describe('UNIT: redirect-config-parser', function () {
    describe('parseJson', function () {
        it('parses a JSON string into a RedirectConfig[]', function () {
            const content = JSON.stringify([
                { from: '/old/', to: '/new/', permanent: true },
                { from: '/temp/', to: '/dest/' }
            ]);
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseJson)(content), [
                { from: '/old/', to: '/new/', permanent: true },
                { from: '/temp/', to: '/dest/' }
            ]);
        });
        it('throws BadRequestError on an empty input', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseJson)(''), { errorType: 'BadRequestError' });
        });
        it('throws BadRequestError on malformed JSON', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseJson)('{not json'), {
                errorType: 'BadRequestError',
                message: /Could not parse JSON:/
            });
        });
        it('throws BadRequestError when JSON parses to a non-array', function () {
            for (const input of ['null', '42', '"hello"', '{"from":"/a","to":"/b"}']) {
                strict_1.default.throws(() => (0, redirect_config_parser_1.parseJson)(input), { errorType: 'BadRequestError', message: /must be an array/ }, `expected rejection for: ${input}`);
            }
        });
    });
    describe('parseYaml', function () {
        it('parses 301 and 302 sections into a RedirectConfig[]', function () {
            const content = `
301:
  /old/: /new/
  /old2/: /new2/

302:
  /temp/: /dest/
`;
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseYaml)(content), [
                { from: '/temp/', to: '/dest/', permanent: false },
                { from: '/old/', to: '/new/', permanent: true },
                { from: '/old2/', to: '/new2/', permanent: true }
            ]);
        });
        it('handles a YAML file with only a 301 section', function () {
            const content = '301:\n  /a: /b';
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseYaml)(content), [
                { from: '/a', to: '/b', permanent: true }
            ]);
        });
        it('handles a YAML file with only a 302 section', function () {
            const content = '302:\n  /a: /b';
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseYaml)(content), [
                { from: '/a', to: '/b', permanent: false }
            ]);
        });
        it('throws BadRequestError on an empty input', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)(''), { errorType: 'BadRequestError' });
        });
        it('tolerates an empty status-code section as zero redirects in that group', function () {
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseYaml)('301:\n302:\n  /a: /b'), [{ from: '/a', to: '/b', permanent: false }]);
        });
        it('throws BadRequestError when YAML parses to a non-object', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)('plain string'), {
                errorType: 'BadRequestError',
                message: /YAML input is invalid/
            });
        });
        it('throws BadRequestError when YAML parses to a top-level array', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)('- /a: /b\n- /c: /d'), {
                errorType: 'BadRequestError',
                message: /YAML input is invalid/
            });
        });
        it('throws BadRequestError when neither 301 nor 302 is present', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)('foo: bar'), {
                errorType: 'BadRequestError',
                message: /YAML input is invalid/
            });
        });
        it('throws BadRequestError when a status-code section is not a mapping', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)('301:\n  - /a\n  - /b'), {
                errorType: 'BadRequestError',
                message: /YAML input is invalid/
            });
        });
        it('throws BadRequestError when a redirect target is not a string', function () {
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)('301:\n  /a: 123'), {
                errorType: 'BadRequestError',
                message: /YAML input is invalid/
            });
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)('301:\n  /a: ~'), {
                errorType: 'BadRequestError',
                message: /YAML input is invalid/
            });
        });
        it('throws BadRequestError on malformed YAML', function () {
            const content = `
                301:
                    /a: /b
                    /a: /b
            `;
            strict_1.default.throws(() => (0, redirect_config_parser_1.parseYaml)(content), {
                errorType: 'BadRequestError',
                message: /Could not parse YAML:/
            });
        });
    });
    describe('serializeToYaml', function () {
        it('groups redirects by status code with 301 first', function () {
            const yaml = (0, redirect_config_parser_1.serializeToYaml)([
                { from: '/temp/', to: '/dest/', permanent: false },
                { from: '/old/', to: '/new/', permanent: true }
            ]);
            strict_1.default.match(yaml, /^301:[\s\S]*\n302:/);
            strict_1.default.match(yaml, /\/old\/.*: \/new\//);
            strict_1.default.match(yaml, /\/temp\/.*: \/dest\//);
        });
        it('treats redirects without `permanent` as 302', function () {
            const yaml = (0, redirect_config_parser_1.serializeToYaml)([{ from: '/a', to: '/b' }]);
            strict_1.default.match(yaml, /302:/);
            strict_1.default.doesNotMatch(yaml, /301:/);
        });
        it('preserves relative order within each status code group', function () {
            const yaml = (0, redirect_config_parser_1.serializeToYaml)([
                { from: '/p1', to: '/q1', permanent: true },
                { from: '/t1', to: '/u1', permanent: false },
                { from: '/p2', to: '/q2', permanent: true },
                { from: '/t2', to: '/u2', permanent: false }
            ]);
            const p1 = yaml.indexOf('/p1');
            const p2 = yaml.indexOf('/p2');
            const t1 = yaml.indexOf('/t1');
            const t2 = yaml.indexOf('/t2');
            strict_1.default.ok(p1 < p2, 'permanent redirects keep their relative order');
            strict_1.default.ok(t1 < t2, 'temporary redirects keep their relative order');
        });
        it('returns a self-documenting placeholder for an empty array', function () {
            const yamlString = (0, redirect_config_parser_1.serializeToYaml)([]);
            strict_1.default.match(yamlString, /^301: \{\}/m);
            strict_1.default.match(yamlString, /^302: \{\}/m);
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseYaml)(yamlString), []);
        });
        it('round-trips through parseYaml without losing fields', function () {
            const redirects = [
                { from: '/old/', to: '/new/', permanent: true },
                { from: '/temp/', to: '/dest/', permanent: false }
            ];
            const roundTripped = (0, redirect_config_parser_1.parseYaml)((0, redirect_config_parser_1.serializeToYaml)(redirects));
            // Cross-group order is lost in serialise+parse; compare by content not order.
            strict_1.default.deepEqual([...roundTripped].sort((a, b) => a.from.localeCompare(b.from)), [...redirects].sort((a, b) => a.from.localeCompare(b.from)));
        });
        it('round-trips redirects whose fields require YAML escaping', function () {
            const redirects = [
                { from: '/has:colon', to: '/dest', permanent: true },
                { from: '/has#hash', to: '/dest', permanent: true },
                { from: '-leading-dash', to: '/dest', permanent: true },
                { from: '/multi', to: 'has\nnewline\nvalue', permanent: false },
                { from: '/quote', to: 'has "quotes" inside', permanent: false },
                { from: '301', to: '/numeric-key', permanent: true }
            ];
            const yamlString = (0, redirect_config_parser_1.serializeToYaml)(redirects);
            const roundTripped = (0, redirect_config_parser_1.parseYaml)(yamlString);
            strict_1.default.deepEqual([...roundTripped].sort((a, b) => a.from.localeCompare(b.from)), [...redirects].sort((a, b) => a.from.localeCompare(b.from)));
        });
        it('does not fold long values into block scalars', function () {
            // js-yaml's default lineWidth (80) folds long values into
            // `>-` block scalars, injecting markup the user never wrote.
            const longTo = '/very/long/destination/path/that/is/definitely/longer/than/eighty/characters/total/';
            const redirects = [
                { from: '/old/', to: longTo, permanent: true }
            ];
            const yamlString = (0, redirect_config_parser_1.serializeToYaml)(redirects);
            strict_1.default.doesNotMatch(yamlString, />-/, 'no folded block scalar markup');
            strict_1.default.match(yamlString, new RegExp(`/old/: ${longTo}`));
            strict_1.default.deepEqual((0, redirect_config_parser_1.parseYaml)(yamlString), redirects);
        });
        it('emits unquoted 301 / 302 section headers', function () {
            // Self-hosters diff downloaded files against VCS-tracked
            // originals — quoted numeric keys would create spurious diffs.
            const yamlString = (0, redirect_config_parser_1.serializeToYaml)([
                { from: '/a', to: '/b', permanent: true },
                { from: '/c', to: '/d', permanent: false }
            ]);
            strict_1.default.match(yamlString, /^301:\n/m);
            strict_1.default.match(yamlString, /^302:\n/m);
            strict_1.default.doesNotMatch(yamlString, /^"301":/m);
            strict_1.default.doesNotMatch(yamlString, /^"302":/m);
        });
    });
});
