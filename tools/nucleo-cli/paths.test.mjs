import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normDevicePath } from './lib/paths.mjs';

test('normDevicePath resolves relative paths and rejects .. escape', () => {
  assert.equal(normDevicePath('/data'), '/data');
  assert.equal(normDevicePath('foo', { cwd: '/data' }), '/data/foo');
  assert.equal(normDevicePath('../x', { cwd: '/data/sub' }), '/data/x');
  assert.throws(() => normDevicePath('../../etc/passwd', { cwd: '/data' }));
});

test('normDevicePath collapses duplicate slashes', () => {
  assert.equal(normDevicePath('//data///a'), '/data/a');
});
