"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const sinon_1 = __importDefault(require("sinon"));
const notification_email_1 = require("../../../../../core/server/services/notifications/notification-email");
function fakeMailer() {
    return { send: sinon_1.default.stub().resolves() };
}
describe('NotificationEmailService', function () {
    it('sends one email per recipient, shell-rendered with that recipient interpolated', async function () {
        const mailer = fakeMailer();
        const generateEmailContent = sinon_1.default.stub().callsFake(async (opts) => ({
            html: `<html>shell:${opts.data.recipientEmail}:${opts.data.message}</html>`,
            text: 'plain'
        }));
        const service = new notification_email_1.NotificationEmailService({
            mailer,
            generateEmailContent,
            getSiteUrl: () => 'https://example.com'
        });
        await service.send({
            to: ['owner@example.com', 'admin@example.com'],
            subject: 'Security update',
            content: '<p>Update now</p>'
        });
        sinon_1.default.assert.calledTwice(mailer.send);
        strict_1.default.equal(mailer.send.args[0][0].to, 'owner@example.com');
        strict_1.default.equal(mailer.send.args[1][0].to, 'admin@example.com');
        strict_1.default.equal(mailer.send.args[0][0].subject, 'Security update');
        strict_1.default.match(mailer.send.args[0][0].html, /shell:owner@example.com:/);
        strict_1.default.match(mailer.send.args[1][0].html, /shell:admin@example.com:/);
    });
    it('sanitises the content before passing it to the shell', async function () {
        const mailer = fakeMailer();
        const generateEmailContent = sinon_1.default.stub().resolves({ html: '<html></html>' });
        const service = new notification_email_1.NotificationEmailService({
            mailer,
            generateEmailContent,
            getSiteUrl: () => 'https://example.com'
        });
        await service.send({
            to: ['owner@example.com'],
            subject: 'x',
            content: '<p>hi</p><script>alert(1)</script>'
        });
        const renderedMessage = generateEmailContent.args[0][0].data.message;
        strict_1.default.equal(renderedMessage.includes('<script>'), false);
        strict_1.default.ok(renderedMessage.includes('<p>hi</p>'));
    });
    it('does nothing when there are no recipients', async function () {
        const mailer = fakeMailer();
        const generateEmailContent = sinon_1.default.stub();
        const service = new notification_email_1.NotificationEmailService({
            mailer,
            generateEmailContent,
            getSiteUrl: () => 'https://example.com'
        });
        await service.send({ to: [], subject: 'x', content: '<p>hi</p>' });
        sinon_1.default.assert.notCalled(generateEmailContent);
        sinon_1.default.assert.notCalled(mailer.send);
    });
});
