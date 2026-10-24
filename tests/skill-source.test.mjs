import test from 'node:test';
import assert from 'node:assert/strict';
import { skillSourceLabel } from '../dist/shared.js';
test('skill attribution requires exact HTTPS origin without credentials', () => {
  assert.equal(skillSourceLabel('https://github.com/owner/repo'), 'GITHUB');
  assert.equal(skillSourceLabel('https://officialskills.sh/googleworkspace/docs'), 'OFFICIALSKILLS.SH · GOOGLE WORKSPACE');
  for (const url of ['https://github.com.evil.test/repo', 'https://evil.test/github.com', 'https://github.com@evil.test', 'http://github.com/owner/repo', 'https://user@github.com/owner/repo', 'https://github.com:8443/owner/repo', 'https://officialskills.sh/googleworkspace-fake/docs', 'local.md'])
    assert.equal(skillSourceLabel(url), 'CUSTOM SOURCE', url);
});
