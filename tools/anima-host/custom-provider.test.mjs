// Custom OpenAI-compatible provider — teacher.json shape + URL validation (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, buildTeacherDoc, isHttpsApiBase, isKnownCloudBase, normalizeApiBase, providerOf } from '../../web/shell/ai.js';

test('PROVIDERS.custom is enumerable and proxied', () => {
  assert.ok(PROVIDERS.custom);
  assert.equal(providerOf('custom').proxy, true);
  assert.ok(Object.keys(PROVIDERS).includes('custom'));
});

test('isHttpsApiBase accepts third-party HTTPS bases, rejects LAN http', () => {
  assert.ok(isHttpsApiBase('https://openrouter.ai/api/v1'));
  assert.ok(!isHttpsApiBase('http://192.168.1.10:11434/v1'));
  assert.ok(!isHttpsApiBase('not-a-url'));
  assert.equal(normalizeApiBase('https://x.y/v1/'), 'https://x.y/v1');
});

test('isKnownCloudBase separates built-in hosts from custom', () => {
  assert.ok(isKnownCloudBase('https://api.groq.com/openai/v1'));
  assert.ok(!isKnownCloudBase('https://openrouter.ai/api/v1'));
});

test('buildTeacherDoc(custom) persists provider, base, model, key for firmware', () => {
  const doc = buildTeacherDoc({
    provider: 'custom',
    base: 'https://example.com/v1',
    model: 'my-model',
    key: 'sk-test',
    exec: 'device',
    keys: {},
  });
  assert.equal(doc.provider, 'custom');
  assert.equal(doc.base, 'https://example.com/v1');
  assert.equal(doc.model, 'my-model');
  assert.equal(doc.key, 'sk-test');
  assert.equal(doc.keys.custom.base, 'https://example.com/v1');
});
