const test = require('node:test');
const { run } = require('./profile-browser-flow.cjs');

test('current visible map and racing menus match the established UI', { timeout: 30000 }, () => run({ menuOnly: true }));
