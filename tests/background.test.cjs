const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'background.js'), 'utf8');

function setup(fetch) {
  let listener;
  const context = vm.createContext({
    chrome: { runtime: { onMessage: { addListener: fn => { listener = fn; } } } },
    fetch, URL, TextEncoder, AbortController, setTimeout, clearTimeout, TypeError
  });
  vm.runInContext(source, context);
  return message => new Promise(resolve => {
    const handled = listener(message, {}, resolve);
    if (handled !== true) resolve(undefined);
  });
}
const success = translation => ({ ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: translation } }) });

test('directions and URL encoding preserve accents and punctuation', async () => {
  for (const [direction, text, pair] of [['pt-en', 'ação & café?', 'pt|en'], ['en-pt', 'good morning', 'en|pt']]) {
    const send = setup(async (url, options) => {
      assert.equal(url.origin, 'https://api.mymemory.translated.net');
      assert.equal(url.searchParams.get('q'), text);
      assert.equal(url.searchParams.get('langpair'), pair);
      assert.equal(options.credentials, 'omit');
      return success('translation');
    });
    assert.equal((await send({ type: 'translate', text, direction })).translation, 'translation');
  }
});
test('rejects empty, oversized and invalid inputs without network access', async () => {
  const send = setup(() => { throw new Error('must not fetch'); });
  for (const [text, direction] of [[' ', 'pt-en'], [null, 'pt-en'], ['á'.repeat(251), 'pt-en'], ['hello', '__proto__']]) {
    assert.equal((await send({ type: 'translate', text, direction })).ok, false);
  }
  assert.equal(await send({ type: 'other' }), undefined);
});
test('accepts exactly 500 UTF-8 bytes', async () => {
  const send = setup(async () => success('ok'));
  assert.equal((await send({ type: 'translate', text: 'á'.repeat(250), direction: 'pt-en' })).ok, true);
});
test('handles rate limits, unavailable service and malformed responses', async () => {
  for (const response of [
    { ok: false, status: 429 },
    { ok: false, status: 503 },
    { ok: true, status: 200, json: async () => ({ responseStatus: 429 }) },
    { ok: true, status: 200, json: async () => ({ responseStatus: 200, quotaFinished: true }) },
    { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: {} }) },
    { ok: true, status: 200, json: async () => { throw new SyntaxError(); } }
  ]) {
    const result = await setup(async () => response)({ type: 'translate', text: 'casa', direction: 'pt-en' });
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  }
});
test('connection errors and timeout have specific messages', async () => {
  const send = setup(async () => { throw new TypeError('network'); });
  assert.match((await send({ type: 'translate', text: 'casa', direction: 'pt-en' })).error, /internet/);
  const timeout = setup(async () => { const error = new Error(); error.name = 'AbortError'; throw error; });
  assert.match((await timeout({ type: 'translate', text: 'casa', direction: 'pt-en' })).error, /demorou/);
});
