const assert = require('node:assert/strict');
// Install Playwright outside the repository, then set NODE_PATH to its node_modules.
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
 const context = await browser.newContext({ acceptDownloads: true, permissions: ['microphone'] });
 const page = await context.newPage(); const errors = [];
 page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.message); });
 page.on('requestfailed', request => console.error('FAILED REQUEST:', request.url(), request.failure()?.errorText));
 page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE:', msg.text()); });
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/');
 await page.waitForFunction(() => window.app?.workspace?.ready, { timeout: 20000 });
 console.log('Workspace initialized');
 await page.click('#workspace-toggle');
 await page.fill('#lecture-title', 'Integration lecture'); await page.locator('#lecture-title').press('Tab');
 await page.click('#lecture-save');
 await page.click('#tab-study'); await page.fill('#typed-note', 'Energy conservation'); await page.click('#note-add');
 await page.fill('#manual-latex', 'E=mc^2'); await page.click('#formula-add');
 await page.waitForFunction(() => window.app.drawingEngine.drawnObjects.some(o => o.type === 'latex'));
 await page.fill('#bookmark-label', 'Review energy'); await page.click('#bookmark-add');
 await page.fill('#card-question', 'What is conserved?'); await page.fill('#card-answer', 'Energy'); await page.click('#card-add');
 await page.click('#tab-library'); await page.click('#lecture-save');
 await page.evaluate(() => app.workspace.save());
 const originalId = await page.evaluate(() => app.workspace.metadata.id);
 await page.reload(); await page.waitForFunction(() => window.app?.workspace?.ready);
 assert.equal(await page.evaluate(() => app.workspace.metadata.id), originalId);
 assert.equal(await page.evaluate(() => app.workspace.metadata.title), 'Integration lecture');
 assert.equal(await page.evaluate(() => app.workspace.metadata.cards.length), 1);
 assert.equal(await page.evaluate(() => app.drawingEngine.drawnObjects.filter(o => o.type === 'text').length), 1);
 console.log('Metadata, notes, formulas, bookmarks and cards persisted');
 await page.click('#workspace-toggle'); await page.click('#tab-pages');
 const originalPages = await page.evaluate(() => app.workspace.pageCount());
 await page.locator('#page-list article').first().getByRole('button', { name: 'Duplicate', exact: true }).click();
 assert.equal(await page.evaluate(() => app.workspace.pageCount()), originalPages + 1);
 await page.evaluate(() => app.undo());
 assert.equal(await page.evaluate(() => app.workspace.pageCount()), originalPages);
 await page.evaluate(() => app.redo());
 assert.equal(await page.evaluate(() => app.workspace.pageCount()), originalPages + 1);
 console.log('Page duplicate and undo/redo passed');
 // Real PDF round trip through the importer and selected-page exporter.
 const pdfBytes = await page.evaluate(() => {
    const pdf = new jspdf.jsPDF(); pdf.text('Imported slide one', 20, 20);
    pdf.addPage(); pdf.text('Imported slide two', 20, 20);
    return [...new Uint8Array(pdf.output('arraybuffer'))];
 });
 const countBeforePDF = await page.evaluate(() => app.workspace.pageCount());
 await page.setInputFiles('#slides-file', { name: 'slides.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfBytes) });
 await page.waitForFunction(n => app.workspace.pageCount() === n + 2, countBeforePDF);
 await page.waitForFunction(() => !document.getElementById('slides-file').disabled);
 assert.equal(await page.evaluate(() => app.drawingEngine.drawnObjects.filter(o => o.slide).length), 2);
 assert.ok(await page.evaluate(() => app.drawingEngine.canvas.height < app.drawingEngine.documentHeight));
 await page.locator('#page-list article').last().locator('input[type=checkbox]').check();
 const pdfDownloadPromise = page.waitForEvent('download'); await page.click('#page-export');
 const exportedPDF = await pdfDownloadPromise;
 assert.ok(exportedPDF.suggestedFilename().endsWith('.pdf'));
 await page.evaluate(() => app.workspace.reorderPage(app.workspace.pageCount() - 1, app.workspace.pageCount() - 2));
 page.once('dialog', dialog => dialog.accept());
 await page.locator('#page-list article').last().getByRole('button', { name: 'Delete', exact: true }).click();
 assert.equal(await page.evaluate(() => app.workspace.pageCount()), countBeforePDF + 1);
 // Preserve and restore selected handwritten strokes.
 await page.evaluate(() => {
    const e = app.drawingEngine;
    const stroke = e.addObject({ type: 'path', points: [{ x: 50, y: 220, pressure: .5 }, { x: 100, y: 240, pressure: .5 }], size: 2, color: '#000' });
    e.selectedIds = new Set([stroke.id]); app.workspace.commit();
 });
 await page.click('#tab-study'); await page.fill('#manual-latex', 'x+y'); await page.click('#formula-add');
 await page.waitForFunction(() => app.drawingEngine.drawnObjects.some(o => o.sourceStrokes?.length));
 await page.evaluate(() => { const o = app.drawingEngine.drawnObjects.find(o => o.sourceStrokes?.length); app.drawingEngine.selectedIds = new Set([o.id]); });
 await page.click('#formula-restore');
 assert.ok(await page.evaluate(() => app.drawingEngine.drawnObjects.some(o => o.type === 'path' && o.points[0].y === 220)));
 await page.fill('#document-search', 'Imported slide');
 assert.ok(await page.locator('#search-results article').count() >= 1);
 // Recovery creates a separate lecture, rather than overwriting the current version.
 await page.evaluate(() => app.workspace.save());
 await page.click('#tab-library');
 assert.ok(await page.locator('#recovery-list article').count() > 0);
 console.log('PDF import/export, page reorder/delete, source restoration, search and recovery list passed');
 const beforeRecovery = await page.evaluate(() => app.workspace.metadata.id);
 await page.locator('#recovery-list article').first().getByRole('button', { name: 'Open as recovery copy' }).click();
 await page.waitForFunction(id => app.workspace.metadata.id !== id, beforeRecovery);
 await page.evaluate(() => app.workspace.save());
 assert.ok(await page.evaluate(() => app.workspace.metadata.title.endsWith('(recovered)')));
 // Deliberate storage failure must surface visibly and remain recoverable.
 const failure = await page.evaluate(async () => {
    const save = app.workspace.store.save;
    app.workspace.store.save = async () => { throw new Error('Simulated quota exceeded'); };
    let failed = false; try { await app.workspace.save(); } catch { failed = true; }
    const text = document.getElementById('save-status').textContent;
    app.workspace.store.save = save;
    await app.workspace.save();
    return { failed, text };
 });
 assert.equal(failure.failed, true); assert.match(failure.text, /Save failed/);
 const saveRace = await page.evaluate(async () => {
    const save = app.workspace.store.save;
    let release;
    app.workspace.store.save = () => new Promise(resolve => { release = resolve; });
    const pending = app.workspace.save();
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    app.workspace.metadata.tags.push('edited-during-save'); app.workspace.commit();
    release(); await pending;
    const status = document.getElementById('save-status').textContent;
    app.workspace.store.save = save; await app.workspace.save(); return status;
 });
 assert.notEqual(saveRace, 'Saved locally');

 await page.route('https://generativelanguage.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ question: 'AI question', answer: 'AI answer' }]) }] } }] })
 }));
 await page.evaluate(async () => {
    window.NotesApp.GEMINI_API_KEY = 'test-only-key'; window.NotesApp.GEMINI_MODEL = 'test-model';
    const object = app.drawingEngine.drawnObjects.find(o => o.type === 'text');
    app.drawingEngine.selectedIds = new Set([object.id]);
    await app.workspace.generateCards();
 });
 assert.ok(await page.evaluate(() => app.workspace.metadata.cards.some(c => c.question === 'AI question')));
 await page.unroute('https://generativelanguage.googleapis.com/**');
 // Drive's network adapter uses create-only multipart uploads and a memory-only token.
 await page.route('https://www.googleapis.com/upload/drive/v3/files**', async route => {
    assert.equal(route.request().method(), 'POST');
    assert.match(route.request().headers()['content-type'], /^multipart\/related/);
    assert.equal(route.request().headers().authorization, 'Bearer mocked-token');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-file', name: 'backup.lecture' }) });
 });
 const driveResult = await page.evaluate(async () => {
    app.workspace.drive.token = 'mocked-token';
    return app.workspace.drive.backup(new Blob(['test'], { type: 'application/gzip' }), 'backup.lecture');
 });
 assert.equal(driveResult.id, 'test-file');
 console.log('Recovery copies, visible save failures, mocked AI flashcards and Drive backup passed');


 await page.evaluate(() => {
    const manager = window.TranscriptionManager;
    manager.handleRecognitionResult({ resultIndex: 0, results: [Object.assign([{ transcript: 'A finalized transcript segment' }], { isFinal: true })] });
 });
 assert.equal(await page.evaluate(() => app.drawingEngine.drawnObjects.filter(o => o.type === 'speech').length), 1);
 await page.click('#tab-recording'); await page.click('#audio-record');
 await page.waitForFunction(() => app.workspace.recorder?.state === 'recording');
 await page.waitForTimeout(600);
 await page.click('#audio-record');
 await page.waitForFunction(() => app.workspace.recorder?.state === 'inactive');
 await page.waitForFunction(() => document.querySelector('#recording-list audio'));
 console.log('Microphone recording and audio persistence passed');
 await page.click('#tab-storage');
 const beforeBundle = await page.evaluate(() => app.workspace.metadata.id);
 const bundlePromise = page.waitForEvent('download'); await page.click('#bundle-export');
 const bundle = await bundlePromise; const bundlePath = await bundle.path();
 assert.ok(bundle.suggestedFilename().endsWith('.lecture'));
 await page.setInputFiles('#lecture-file', bundlePath);
 await page.waitForFunction(id => app.workspace.metadata.id !== id, beforeBundle);
 await page.waitForFunction(() => app.workspace.metadata.recordings.length === 1 && document.querySelector('#save-status').textContent === 'Saved locally');
 assert.ok(await page.evaluate(async () => !!await app.workspace.store.get('assets', app.workspace.metadata.recordings[0].id)));
 console.log('Complete compressed bundle export/import passed');
 // Offline shell, vendor math/PDF dependencies and IndexedDB load.
 await page.evaluate(async () => { await navigator.serviceWorker.ready; });
 await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller && window.app?.workspace?.ready);
 await context.setOffline(true); await page.reload(); await page.waitForFunction(() => window.app?.workspace?.ready);
 assert.equal(await page.evaluate(() => typeof pdfjsLib.getDocument), 'function');
 assert.equal(await page.evaluate(() => typeof MathJax.tex2svg), 'function');
 console.log('Offline reload, formulas and PDF library passed');
 await context.setOffline(false);
 await page.click('#workspace-toggle'); await page.click('#tab-library');
 await page.screenshot({ path: '/tmp/livelectures-workspace.png', fullPage: true });
 assert.deepEqual(errors, []);
 const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
 const mobilePage = await mobile.newPage();
 await mobilePage.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/');
 await mobilePage.waitForFunction(() => window.app?.workspace?.ready);
 await mobilePage.click('#workspace-toggle');
 assert.ok(await mobilePage.locator('#lecture-workspace').isVisible());
 const panel = await mobilePage.locator('#lecture-workspace').boundingBox();
 assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
 await mobilePage.click('#workspace-close');
 await mobilePage.locator('#drawingToolBtn').press('Enter');
 assert.ok(await mobilePage.locator('#drawingSubmenu').isVisible());
 console.log('Mobile workspace layout and keyboard toolbar checks passed');
 await mobile.close();
 await browser.close();
 console.log('All browser checks passed.');
})().catch(error => { console.error(error); process.exit(1); });
