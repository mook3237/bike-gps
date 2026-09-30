const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('production HTML loads the profile adapter before app boot and starts with the map hidden', () => {
  const html = read('index.html');
  const adapterIndex = html.indexOf('/profile-system.js');
  const appIndex = html.indexOf('/app.js');

  assert.ok(adapterIndex >= 0, 'profile adapter script must be loaded');
  assert.ok(appIndex > adapterIndex, 'profile adapter must load before app.js');
  assert.match(html, /id="profileScreen"/);
  assert.match(html, /<main id="app" class="hidden">/);
  assert.match(html, /id="profileSelectButton"[^>]*disabled/);
});

test('production profile markup keeps selection and management controls as siblings', () => {
  const app = read('app.js');
  assert.match(app, /profile-card-wrapper/);
  assert.match(app, /profile-select-control/);
  assert.match(app, /profile-manage-control/);
  assert.match(app, /<\/button><button class="profile-manage-control"/);
});

test('production persistence functions route through the active profile repository', () => {
  const app = read('app.js');
  assert.match(app, /profileRepository\.readRecentSearches\(activeProfileId\)/);
  assert.match(app, /profileRepository\.replaceRecentSearches\(activeProfileId/);
  assert.match(app, /profileRepository\.prependRide\(activeProfileId/);
});

test('production boot gates initMap behind profile confirmation', () => {
  const app = read('app.js');
  assert.match(app, /bootProfileSelection/);
  assert.match(app, /createProfileSession\(profileRepository,\{startMap:\(\)=>initMap\(\)\}\)/);
  assert.doesNotMatch(app, /\(async\(\)=>\{try\{await initMap\(\)/);
});
