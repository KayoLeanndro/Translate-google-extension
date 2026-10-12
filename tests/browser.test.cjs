const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

test('loaded extension: popup, selection, races, editable fields and positioning', async t => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="pt-BR"><body><p id="word">café</p><p id="phrase">good morning</p><p id="slow">slow</p><p id="fast">fast</p><p id="large">' + 'á'.repeat(251) + '</p><p id="edge" style="position:fixed;bottom:0;right:0">bom dia</p><input value="privado"><div id="editable" contenteditable="true">segredo</div></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext('', {
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
      headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const errors = [];
    context.on('weberror', error => errors.push(error.error().message));
    await worker.evaluate(() => {
      globalThis.calls = [];
      globalThis.fetch = async url => {
        const text = url.searchParams.get('q');
        globalThis.calls.push({ text, pair: url.searchParams.get('langpair') });
        await new Promise(resolve => setTimeout(resolve, text === 'slow' ? 750 : 30));
        return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: `traduzido: ${text}` } }) };
      };
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');

    async function card() {
      const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      function find(node) {
        if (node.nodeName === 'SECTION' && node.attributes?.includes('Tradução do texto selecionado')) return node;
        for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
          const match = find(child);
          if (match) return match;
        }
      }
      const node = find(root);
      if (!node) return null;
      const { object } = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId });
      const { result } = await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'function() { const r=this.getBoundingClientRect(); return {text:this.textContent, x:r.x, y:r.y, right:r.right, bottom:r.bottom}; }',
        returnByValue: true
      });
      await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
      return { ...result.value, nodeId: node.nodeId };
    }
    async function until(predicate) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      throw new Error('Condition did not become true');
    }
    async function select(selector, keyboard = false) {
      await page.evaluate(({ selector, keyboard }) => {
        document.activeElement.blur();
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(selector));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(keyboard ? new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }) : new PointerEvent('pointerup', { bubbles: true }));
      }, { selector, keyboard });
    }
    async function translated(text) {
      return until(async () => { const value = await card(); return value?.text.includes(`traduzido: ${text}`) ? value : null; });
    }

    await t.test('extension loads, defaults are correct and accents translate', async () => {
      assert.equal(await popup.locator('#direction').inputValue(), 'pt-en');
      await until(() => popup.locator('#enabled').isEnabled());
      assert.equal(await popup.locator('#enabled').isChecked(), true);
      await select('#word');
      const value = await translated('café');
      assert.match(value.text, /Português → Inglês/);
      assert.deepEqual(await worker.evaluate(() => calls[0]), { text: 'café', pair: 'pt|en' });
    });
    await t.test('manual direction persists and keyboard selection works', async () => {
      await popup.locator('#direction').selectOption('en-pt');
      await popup.locator('#status').filter({ hasText: 'Preferências salvas.' }).waitFor();
      await until(async () => !(await card()));
      await popup.reload();
      await until(async () => await popup.locator('#direction').inputValue() === 'en-pt');
      await select('#phrase', true);
      assert.match((await translated('good morning')).text, /Inglês → Português/);
    });
    await t.test('late responses never overwrite new selections, including repeated key events', async () => {
      await select('#slow');
      await until(async () => (await worker.evaluate(() => calls)).some(call => call.text === 'slow'));
      await select('#fast');
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true })));
      await translated('fast');
      await new Promise(resolve => setTimeout(resolve, 850));
      assert.match((await card()).text, /traduzido: fast/);
      assert.doesNotMatch((await card()).text, /traduzido: slow/);
    });
    await t.test('oversized and editable selections never reach the provider', async () => {
      const count = await worker.evaluate(() => calls.length);
      await select('#large');
      await until(async () => (await card())?.text.includes('máximo de 500 bytes'));
      await select('#editable');
      await until(async () => !(await card()));
      await page.locator('input').focus();
      await page.evaluate(() => {
        document.querySelector('input').select();
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      });
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(await card(), null);
      assert.equal(await worker.evaluate(() => calls.length), count);
    });
    await t.test('box stays inside viewport and all dismissal methods work', async () => {
      await select('#edge');
      const value = await translated('bom dia');
      const viewport = page.viewportSize();
      assert.ok(value.x >= 0 && value.y >= 0 && value.right <= viewport.width && value.bottom <= viewport.height);
      // Resolve the closed-shadow button through CDP to exercise its real handler.
      const { object } = await cdp.send('DOM.resolveNode', { nodeId: value.nodeId });
      await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){this.querySelector("button").click()}' });
      await until(async () => !(await card()));
      await select('#word');
      await translated('café');
      await page.keyboard.press('Escape');
      await until(async () => !(await card()));
      await select('#word');
      await translated('café');
      await page.mouse.click(500, 300);
      await until(async () => !(await card()));
    });
    await t.test('disabling closes box and persists across reopening', async () => {
      await select('#word');
      await translated('café');
      await popup.locator('#enabled').uncheck();
      await until(async () => !(await card()));
      const count = await worker.evaluate(() => calls.length);
      await select('#phrase');
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(await card(), null);
      assert.equal(await worker.evaluate(() => calls.length), count);
      await popup.reload();
      await until(() => popup.locator('#enabled').isEnabled());
      assert.equal(await popup.locator('#enabled').isChecked(), false);
      assert.deepEqual(errors, []);
    });
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
