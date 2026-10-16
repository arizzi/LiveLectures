import { LectureStore } from './storage.mjs';
import { newLecture, uid, identity, pageIndex, moveObject, documentText, validateDocument, download } from './model.mjs';
import { DriveStorage } from './drive.mjs';

export class LectureWorkspace {
    constructor(app) {
        this.app = app; this.engine = app.drawingEngine; this.store = new LectureStore();
        this.drive = new DriveStorage(); this.saveQueue = Promise.resolve(); this.urls = [];
        this.checkedPages = new Set(); this.replaying = false; this.revision = 0;
    }
    $(id) { return document.getElementById(id); }
    message(text) { this.$('workspace-message').textContent = text; }
    status(text, error = false) {
        this.$('save-status').textContent = text; this.$('save-status').dataset.error = String(error);
    }
    action(id, handler) {
        this.$(id).addEventListener('click', async event => {
            const button = event.currentTarget; button.disabled = true;
            try { await handler(event); } catch (error) { if (error.name !== 'AbortError') this.message(error.message); }
            finally { button.disabled = false; }
        });
    }
    item(parent, title, text, actions = []) {
        const item = document.createElement('article'); item.className = 'workspace-item';
        const heading = document.createElement('strong'); heading.textContent = title; item.append(heading);
        if (text) { const p = document.createElement('p'); p.textContent = text; item.append(p); }
        for (const [label, handler] of actions) {
            const button = document.createElement('button'); button.textContent = label;
            button.addEventListener('click', async () => {
                button.disabled = true;
                try { await handler(); } catch (error) { this.message(error.message); }
                finally { button.disabled = false; }
            }); item.append(button);
        }
        parent.append(item); return item;
    }
    async start() {
        const response = await fetch(new URL('./workspace.html', import.meta.url));
        if (!response.ok) throw new Error('Could not load lecture workspace.');
        const panel = document.createElement('aside'); panel.id = 'lecture-workspace';
        panel.setAttribute('aria-label', 'Lecture workspace'); panel.hidden = true;
        panel.innerHTML = await response.text(); document.body.append(panel);
        const toolbar = document.querySelector('.toolbar');
        const button = document.createElement('button'); button.id = 'workspace-toggle'; button.textContent = 'Lectures';
        button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
        const status = document.createElement('span'); status.id = 'save-status'; status.role = 'status';
        status.setAttribute('aria-live', 'polite'); toolbar.prepend(button, status);
        this.action('workspace-toggle', () => { panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); });
        this.action('workspace-close', () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); button.focus(); });
        await this.store.open();
        const active = await this.store.get('settings', 'active');
        const record = active && await this.store.get('lectures', active);
        if (record) this.engine.setState(validateDocument(window.DocumentCodec.decode(JSON.parse(record.json))));
        if (!this.engine.lecture) this.engine.lecture = newLecture();
        this.engine.lecture.tags ||= []; this.engine.lecture.bookmarks ||= [];
        this.engine.lecture.cards ||= []; this.engine.lecture.recordings ||= [];
        this.app.historyManager.persist = json => this.persist(json);
        this.app.historyManager.onChange = () => { this.revision++; this.status('Unsaved changes'); this.refreshSoon(); };
        this.app.historyManager.pushHistory(this.engine.getState());
        this.bind(); this.accessibility(); this.populate(); this.tab('library');
        await this.save(); this.engine.redrawAll();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.app.historyManager.scheduleAutosave(true);
        });
        window.addEventListener('beforeunload', event => {
            if (this.recorder?.state === 'recording' || this.saving || this.$('save-status').textContent !== 'Saved locally') {
                event.preventDefault(); event.returnValue = '';
            }
        });
        this.ready = true;
        return this;
    }
    get metadata() { return this.engine.lecture; }
    commit() { this.app.historyManager.pushHistory(this.engine.getState()); this.engine.redrawAll(); }
    async persist(json) {
        const data = JSON.parse(json), id = data.lecture.id, revision = this.revision;
        const record = { id, json, metadata: structuredClone(data.lecture), updatedAt: Date.now(), thumbnail: this.thumbnail() };
        this.saving = true; this.status('Saving…');
        const task = this.saveQueue.catch(() => {}).then(() => this.store.save(record));
        this.saveQueue = task;
        try { await task; if (id === this.metadata.id && task === this.saveQueue && revision === this.revision) this.status('Saved locally'); }
        catch (error) { this.status('Save failed — export a backup', true); throw error; }
        finally { if (task === this.saveQueue) this.saving = false; }
    }
    async save() { await this.app.historyManager.scheduleAutosave(true); await this.saveQueue; }
    thumbnail() {
        try {
            const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 110;
            canvas.getContext('2d').drawImage(this.engine.canvas, 0, 0, 160, 110);
            return canvas.toDataURL('image/jpeg', .55);
        } catch { return ''; }
    }
    populate() {
        for (const [field, key] of [['title', 'title'], ['course', 'course'], ['date', 'date'], ['tags', 'tags']]) {
            this.$(`lecture-${field}`).value = key === 'tags' ? this.metadata.tags.join(', ') : this.metadata[key] || '';
        }
        this.$('speech-language').value = this.metadata.language || 'it-IT';
        window.TranscriptionManager?.setLanguage(this.$('speech-language').value);
        this.$('pen-button').value = localStorage.getItem('pen.button') || 'eraser';
        this.$('pen-tilt').checked = localStorage.getItem('pen.tilt') === 'true';
        this.$('ai-key').value = window.NotesApp.GEMINI_API_KEY;
        this.$('ai-model').value = window.NotesApp.GEMINI_MODEL || '';
        this.$('ai-remember').checked = !!localStorage.getItem('gemini_api_key');
        this.$('drive-client').value = localStorage.getItem('drive.client') || '';
        this.$('drive-key').value = localStorage.getItem('drive.picker') || '';
    }
    tab(name) {
        this.currentTab = name;
        document.querySelectorAll('[data-section]').forEach(s => s.hidden = s.dataset.section !== name);
        document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
        return this.refresh();
    }
    refreshSoon() {
        clearTimeout(this.refreshTimer); this.refreshTimer = setTimeout(() => this.refresh().catch(e => this.message(e.message)), 300);
    }
    async refresh() {
        if (this.currentTab === 'library') await this.renderLibrary();
        if (this.currentTab === 'pages') this.renderPages();
        if (this.currentTab === 'study') this.renderStudy();
        if (this.currentTab === 'recording') await this.renderAudio();
        if (this.currentTab === 'storage' && navigator.storage?.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            this.$('storage-usage').textContent = `${(usage / 1048576).toFixed(1)} MB used of approximately ${(quota / 1048576).toFixed(0)} MB available.`;
        }
    }
    async renderLibrary() {
        const query = this.$('library-search').value.toLowerCase();
        const list = this.$('lecture-list'); list.replaceChildren();
        const records = (await this.store.all('lectures')).sort((a, b) => b.updatedAt - a.updatedAt);
        for (const record of records) {
            const meta = record.metadata;
            if (!`${meta.title} ${meta.course} ${meta.tags.join(' ')}`.toLowerCase().includes(query)) continue;
            const item = this.item(list, meta.title, `${meta.course} · ${meta.date} · ${meta.tags.join(', ')}`, [
                [record.id === this.metadata.id ? 'Current lecture' : 'Open', () => this.openRecord(record)],
                ['Delete', async () => {
                    if (record.id === this.metadata.id) throw new Error('Open another lecture before deleting this one.');
                    if (confirm(`Delete “${meta.title}” and its local recordings?`)) { await this.store.deleteLecture(record.id); await this.renderLibrary(); }
                }]
            ]);
            if (record.thumbnail) { const image = new Image(); image.loading = 'lazy'; image.alt = 'Lecture preview'; image.src = record.thumbnail; item.prepend(image); }
        }
        const recovery = this.$('recovery-list'); recovery.replaceChildren();
        for (const record of await this.store.get('recovery', this.metadata.id) || []) {
            this.item(recovery, new Date(record.updatedAt).toLocaleString(), '', [['Open as recovery copy', async () => {
                await this.openData(window.DocumentCodec.decode(JSON.parse(record.json)), true, ' (recovered)');
            }]]);
        }
    }
    async settle() {
        if (this.recorder?.state === 'recording') await this.stopRecording();
        const speech = window.TranscriptionManager;
        if (speech?.isListening && speech.recognition) {
            await new Promise(resolve => {
                const done = () => { clearTimeout(timer); resolve(); };
                const timer = setTimeout(done, 1500);
                speech.recognition.addEventListener('end', done, { once: true }); speech.stop();
            });
        }
        this.stopReplay(); await this.save();
    }
    async openRecord(record) {
        if (record.id === this.metadata.id) return;
        await this.settle(); this.fileHandle = null;
        this.apply(validateDocument(window.DocumentCodec.decode(JSON.parse(record.json))));
        await this.save(); await this.refresh();
    }
    apply(data) {
        this.engine.setState(data); this.app.historyManager.history = []; this.app.historyManager.redoStack = [];
        this.app.historyManager.pushHistory(this.engine.getState()); this.populate(); this.engine.redrawAll();
    }
    async openData(data, copy = true, suffix = '') {
        validateDocument(data); await this.settle(); this.fileHandle = null;
        if (copy) {
            const metadata = { ...newLecture(), ...data.lecture, id: uid() };
            metadata.title += suffix;
            metadata.recordings = structuredClone(metadata.recordings || []);
            // Copy recording assets so deleting the original does not delete this lecture's audio.
            for (const recording of metadata.recordings || []) {
                const blob = await this.store.get('assets', recording.id);
                const oldId = recording.id; recording.id = uid();
                if (blob) await this.store.put('assets', recording.id, blob);
                for (const object of data.drawnObjects) if (object.recordingId === oldId) object.recordingId = recording.id;
            }
            data.lecture = metadata;
        }
        this.apply(data); await this.save(); await this.refresh();
    }
    bind() {
        document.querySelectorAll('[data-tab]').forEach(b => this.action(b.id || (b.id = `tab-${b.dataset.tab}`), () => this.tab(b.dataset.tab)));
        for (const field of ['title', 'course', 'date', 'tags']) this.$(`lecture-${field}`).addEventListener('change', () => {
            const value = this.$(`lecture-${field}`).value.trim();
            this.metadata[field] = field === 'tags' ? value.split(',').map(s => s.trim()).filter(Boolean) : value;
            if (!this.metadata.title) this.metadata.title = 'Untitled lecture'; this.commit();
        });
        this.action('lecture-save', () => this.save());
        this.action('lecture-new', async () => {
            await this.settle(); this.engine.clear(); this.engine.lecture = newLecture(); this.engine.pageCount = 1;
            this.engine.backgroundType = 'white'; this.apply(this.engine.getState()); await this.save(); await this.refresh();
        });
        this.$('library-search').addEventListener('input', () => this.refreshSoon());
        this.$('document-search').addEventListener('input', () => this.renderStudy());
        this.action('page-add', () => { this.app.addPage(); this.renderPages(); });
        this.$('slides-file').addEventListener('change', event => this.runFile(event, file => this.importSlides(file)));
        this.action('page-export', () => this.exportPages());
        this.action('note-add', () => {
            const text = this.$('typed-note').value.trim(); if (!text) return;
            this.engine.addObject({ type: 'text', text, x: this.engine.viewOffsetX + 50,
                y: this.engine.viewOffsetY + 70, fontSize: 18, color: '#17304a', transform: identity() });
            this.$('typed-note').value = ''; this.commit();
        });
        this.action('formula-preview-btn', () => this.previewFormula());
        this.action('formula-add', () => this.addFormula());
        this.action('formula-restore', () => this.restoreFormula());
        this.action('bookmark-add', () => {
            this.metadata.bookmarks.push({ id: uid(), label: this.$('bookmark-label').value.trim() || 'Review later',
                x: this.engine.viewOffsetX, y: this.engine.viewOffsetY, time: Date.now() }); this.commit();
        });
        this.action('card-add', () => {
            const question = this.$('card-question').value.trim(), answer = this.$('card-answer').value.trim();
            if (!question || !answer) throw new Error('Enter a question and answer.');
            this.addCard(question, answer); this.$('card-question').value = ''; this.$('card-answer').value = '';
        });
        this.action('card-ai', () => this.generateCards());
        this.action('markdown-export', () => this.exportMarkdown());
        this.action('speech-toggle', () => {
            if (!window.TranscriptionManager?.isSupported) throw new Error('Speech recognition is not supported by this browser.');
            window.TranscriptionManager.toggle();
        });
        this.$('speech-language').addEventListener('change', () => {
            window.TranscriptionManager?.stop(); window.TranscriptionManager?.setLanguage(this.$('speech-language').value);
            this.metadata.language = this.$('speech-language').value; this.commit();
        });
        this.action('audio-record', () => this.recorder?.state === 'recording' ? this.stopRecording() : this.startRecording());
        this.action('replay-stop', () => this.stopReplay());
        this.$('replay-enabled').addEventListener('change', () => { if (!this.$('replay-enabled').checked) this.stopReplay(); });
        this.action('file-save', () => this.saveFile());
        this.action('bundle-export', async () => download(await this.bundle(), this.filename('.lecture')));
        this.$('lecture-file').addEventListener('change', event => this.runFile(event, file => this.openFile(file)));
        this.action('storage-persist', async () => this.message(await navigator.storage?.persist?.() ?
            'Persistent local storage granted.' : 'The browser did not grant persistent storage. Export backups regularly.'));
        this.action('drive-connect', async () => {
            localStorage.setItem('drive.client', this.$('drive-client').value.trim());
            localStorage.setItem('drive.picker', this.$('drive-key').value.trim());
            await this.drive.connect(this.$('drive-client').value.trim()); this.message('Google Drive connected.');
        });
        this.action('drive-backup', async () => {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const result = await this.drive.backup(await this.bundle(), this.filename(`-${stamp}.lecture`));
            this.message(`Created Drive backup: ${result.name}`);
        });
        this.action('drive-open', async () => this.openFile(await this.drive.open(this.$('drive-key').value.trim())));
        this.action('drive-disconnect', () => { this.drive.disconnect(); this.message('Google Drive disconnected.'); });
        this.action('ai-settings-save', () => {
            window.ApiManager.updateApiKey(this.$('ai-key').value, this.$('ai-remember').checked);
            const model = this.$('ai-model').value.trim();
            if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Enter a valid Gemini model ID.');
            window.NotesApp.GEMINI_MODEL = model; localStorage.setItem('gemini_model', model); this.message('AI settings saved.');
        });
        this.action('ai-cancel', () => window.ApiManager.cancel());
        this.$('pen-button').addEventListener('change', () => localStorage.setItem('pen.button', this.$('pen-button').value));
        this.$('pen-tilt').addEventListener('change', () => localStorage.setItem('pen.tilt', String(this.$('pen-tilt').checked)));
        this.action('focus-toggle', () => document.body.classList.toggle('focus-mode'));
    }
    async runFile(event, handler) {
        const file = event.target.files[0]; if (!file) return;
        event.target.disabled = true;
        try { await handler(file); } catch (error) { this.message(error.message); }
        finally { event.target.disabled = false; event.target.value = ''; }
    }
    filename(suffix) { return (this.metadata.title || 'lecture').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) + suffix; }
    async saveFile() {
        const blob = new Blob([JSON.stringify(window.DocumentCodec.encode(this.engine.getState()))], { type: 'application/json' });
        if ('showSaveFilePicker' in window) {
            this.fileHandle ||= await showSaveFilePicker({ suggestedName: this.filename('.json'),
                types: [{ description: 'Lecture document', accept: { 'application/json': ['.json'] } }] });
            const writable = await this.fileHandle.createWritable();
            try { await writable.write(blob); await writable.close(); }
            catch (error) { await writable.abort().catch(() => {}); throw error; }
            this.message('Document saved to file. Audio is included only in complete bundles.');
        } else download(blob, this.filename('.json'));
    }
    async bundle() {
        if (this.recorder?.state === 'recording') await this.stopRecording();
        await this.save();
        const assets = [];
        for (const recording of this.metadata.recordings) {
            const blob = await this.store.get('assets', recording.id);
            if (!blob) throw new Error(`Audio is missing for ${recording.name}. Import its original bundle first.`);
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
            }); assets.push({ id: recording.id, data });
        }
        const json = JSON.stringify({ kind: 'livelectures-bundle', version: 1,
            document: window.DocumentCodec.encode(this.engine.getState()), assets });
        const blob = new Blob([json], { type: 'application/json' });
        return typeof CompressionStream === 'function' ?
            new Blob([await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()], { type: 'application/gzip' }) : blob;
    }
    async openFile(file) {
        if (file.size > 300 * 1048576) throw new Error('File exceeds the 300 MB import limit.');
        const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
        let blob = file;
        if (magic[0] === 31 && magic[1] === 139) {
            if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress lecture bundles.');
            const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
            const chunks = []; let total = 0;
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                total += value.byteLength;
                if (total > 600 * 1048576) { await reader.cancel(); throw new Error('Expanded bundle exceeds 600 MB.'); }
                chunks.push(value);
            }
            blob = new Blob(chunks);
        }
        const parsed = JSON.parse(await blob.text());
        if (parsed.kind === 'livelectures-bundle') {
            if (parsed.version !== 1 || !Array.isArray(parsed.assets)) throw new Error('Unsupported lecture bundle.');
            const data = validateDocument(window.DocumentCodec.decode(parsed.document));
            const assets = new Map();
            for (const asset of parsed.assets) {
                if (typeof asset.id !== 'string' || typeof asset.data !== 'string' ||
                    !/^data:audio\/[\w.+;= -]+;base64,/.test(asset.data)) throw new Error('Invalid audio asset.');
                assets.set(asset.id, await (await fetch(asset.data)).blob());
            }
            for (const recording of data.lecture?.recordings || []) if (!assets.has(recording.id)) throw new Error('Bundle is missing a recording.');
            // Use fresh asset IDs: imported bundles must never overwrite an existing lecture's audio.
            for (const recording of data.lecture?.recordings || []) {
                const old = recording.id; recording.id = uid(); await this.store.put('assets', recording.id, assets.get(old));
                for (const object of data.drawnObjects) if (object.recordingId === old) object.recordingId = recording.id;
            }
            data.lecture = { ...newLecture(), ...data.lecture, id: uid() };
            await this.openData(data, false);
        } else await this.openData(window.DocumentCodec.decode(parsed));
        this.message('Opened as a new local lecture.');
    }
    pageCount() { return this.engine.pageCount || Math.max(1, Math.ceil((this.engine.canvas.height - this.engine.PAGE_MARGIN) / (this.engine.A4_HEIGHT + this.engine.PAGE_SPACING))); }
    pageY(index) { return this.engine.PAGE_MARGIN + index * (this.engine.A4_HEIGHT + this.engine.PAGE_SPACING); }
    goto(x, y) { this.engine.viewOffsetX = x; this.engine.viewOffsetY = Math.max(0, y - 40); this.engine.redrawAll(); }
    gotoObject(object) {
        const b = window.GeometryUtils.getTransformedBounds(object);
        this.goto(Math.max(0, b.minX - 30), b.minY);
        this.engine.selectedIds = new Set([object.id]); this.engine.drawOverlay();
    }
    async importSlides(file) {
        if (file.size > 100 * 1048576) throw new Error('PDF exceeds 100 MB.');
        if (!window.pdfjsLib) throw new Error('PDF renderer is unavailable. Reload the app.');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
        const loading = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        const pdf = await loading.promise;
        try {
            if (pdf.numPages > 300) throw new Error('Import at most 300 PDF pages at a time.');
            const staged = []; const start = this.pageCount();
            for (let i = 1; i <= pdf.numPages; i++) {
                this.message(`Importing slide ${i} of ${pdf.numPages}…`);
                const page = await pdf.getPage(i); const base = page.getViewport({ scale: 1 });
                const scale = Math.min(1600 / base.width, 2000 / base.height, 2);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                const width = this.engine.A4_WIDTH, height = this.engine.A4_HEIGHT;
                const fit = Math.min(width / viewport.width, height / viewport.height);
                const w = viewport.width * fit, h = viewport.height * fit;
                const x = this.engine.PAGE_MARGIN + (width - w) / 2, y = this.pageY(start + i - 1) + (height - h) / 2;
                const text = (await page.getTextContent()).items.map(item => item.str || '').join(' ');
                staged.push({ type: 'image', slide: true, text, dataUrl: canvas.toDataURL('image/jpeg', .88),
                    startX: x, startY: y, endX: x + w, endY: y + h, transform: identity() });
                page.cleanup();
            }
            for (const object of staged) { object.id = this.engine.idGenerator.generate(); this.engine.drawnObjects.push(object); }
            this.engine.pageCount = start + staged.length;
            this.commit(); await this.save(); this.renderPages(); this.goto(0, this.pageY(start));
            this.message(`Imported ${pdf.numPages} slides.`);
        } finally { await pdf.destroy(); }
    }
    renderPages() {
        const list = this.$('page-list'); list.replaceChildren();
        for (let i = 0; i < this.pageCount(); i++) {
            const item = this.item(list, `Page ${i + 1}`, '', [
                ['Go', () => this.goto(0, this.pageY(i))],
                ['↑', () => this.reorderPage(i, i - 1)], ['↓', () => this.reorderPage(i, i + 1)],
                ['Duplicate', () => this.duplicatePage(i)], ['Delete', () => this.deletePage(i)]
            ]);
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
            checkbox.setAttribute('aria-label', `Export page ${i + 1}`); checkbox.checked = this.checkedPages.has(i);
            checkbox.addEventListener('change', () => checkbox.checked ? this.checkedPages.add(i) : this.checkedPages.delete(i));
            item.prepend(checkbox);
            const slide = this.engine.drawnObjects.find(o => o.slide && pageIndex(o, this.engine) === i);
            if (slide) { const image = new Image(); image.src = slide.dataUrl; image.loading = 'lazy'; image.alt = `Slide ${i + 1}`; item.prepend(image); }
            else {
                const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 110;
                const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 80, 110);
                ctx.scale(80 / this.engine.A4_WIDTH, 110 / this.engine.A4_HEIGHT);
                ctx.translate(-this.engine.PAGE_MARGIN, -this.pageY(i));
                this.engine.drawnObjects.filter(o => pageIndex(o, this.engine) === i).forEach(o => this.engine.drawObject(ctx, o));
                const image = new Image(); image.src = canvas.toDataURL(); image.alt = `Page ${i + 1}`; item.prepend(image);
            }
        }
    }
    reorderPage(from, to) {
        if (to < 0 || to >= this.pageCount()) return;
        const step = this.engine.A4_HEIGHT + this.engine.PAGE_SPACING;
        this.moveLinks(index => index === from ? to : index === to ? from : index);
        for (const o of this.engine.drawnObjects) {
            const index = pageIndex(o, this.engine); window.GeometryUtils.ensureTransform(o);
            if (index === from) o.transform.ty += (to - from) * step;
            else if (index === to) o.transform.ty += (from - to) * step;
        }
        this.checkedPages.clear(); this.commit(); this.renderPages();
    }
    moveLinks(mapping) {
        const step = this.engine.A4_HEIGHT + this.engine.PAGE_SPACING;
        for (const link of [...this.metadata.bookmarks, ...this.metadata.cards]) {
            const page = Math.max(0, Math.floor((link.y - this.engine.PAGE_MARGIN) / step));
            link.y += (mapping(page) - page) * step;
        }
    }
    duplicatePage(index) {
        const target = this.pageCount(), delta = (target - index) * (this.engine.A4_HEIGHT + this.engine.PAGE_SPACING);
        const copies = this.engine.drawnObjects.filter(o => pageIndex(o, this.engine) === index).map(o => {
            const copy = moveObject(window.DocumentCodec.unpackObject(window.DocumentCodec.packObject(o)), delta);
            copy.id = this.engine.idGenerator.generate(); return copy;
        });
        this.engine.drawnObjects.push(...copies); this.engine.pageCount = target + 1; this.commit(); this.renderPages();
    }
    deletePage(index) {
        if (this.pageCount() === 1) throw new Error('Keep at least one page.');
        if (!confirm(`Delete page ${index + 1} and its notes?`)) return;
        const step = this.engine.A4_HEIGHT + this.engine.PAGE_SPACING;
        this.moveLinks(page => page > index ? page - 1 : page === index ? Math.max(0, index - 1) : page);
        this.engine.drawnObjects = this.engine.drawnObjects.filter(o => pageIndex(o, this.engine) !== index);
        for (const o of this.engine.drawnObjects) if (pageIndex(o, this.engine) > index) {
            window.GeometryUtils.ensureTransform(o); o.transform.ty -= step;
        }
        this.engine.pageCount--; this.checkedPages.clear(); this.commit(); this.renderPages();
    }
    async exportPages() {
        const pages = [...this.checkedPages].filter(i => i < this.pageCount()).sort((a, b) => a - b);
        if (!pages.length) throw new Error('Check at least one page to export.');
        await window.pdfExporter.exportToPDF(this.engine, this.filename('.pdf'), pages);
    }
    async previewFormula() {
        if (!window.MathJax?.startup?.promise) throw new Error('Math renderer is still loading.');
        await MathJax.startup.promise;
        const source = this.$('manual-latex').value.trim();
        if (!source) throw new Error('Enter LaTeX source.');
        this.$('formula-preview').replaceChildren(MathJax.tex2svg(source, { display: true }));
    }
    async addFormula() {
        await this.previewFormula();
        const selected = this.engine.drawnObjects.filter(o => this.engine.selectedIds.has(o.id) && !o.slide);
        const bounds = selected.length ? selected.map(o => window.GeometryUtils.getTransformedBounds(o)) : null;
        const x = bounds ? Math.min(...bounds.map(b => b.minX)) : this.engine.viewOffsetX + 50;
        const y = bounds ? Math.min(...bounds.map(b => b.minY)) : this.engine.viewOffsetY + 70;
        const object = { type: 'latex', latex: this.$('manual-latex').value.trim(), startX: x, startY: y,
            endX: bounds ? Math.max(...bounds.map(b => b.maxX)) : x + 250,
            endY: bounds ? Math.max(...bounds.map(b => b.maxY)) : y + 70, transform: identity(),
            sourceStrokes: selected.map(o => window.DocumentCodec.packObject(o)) };
        this.engine.replaceObjects(selected.map(o => o.id), [object]); this.renderStudy();
    }
    restoreFormula() {
        const objects = this.engine.drawnObjects.filter(o => this.engine.selectedIds.has(o.id) && o.sourceStrokes?.length);
        if (!objects.length) throw new Error('Select a converted formula with saved handwriting.');
        const restored = objects.flatMap(o => o.sourceStrokes.map(source => {
            const original = window.DocumentCodec.unpackObject(source); original.id = this.engine.idGenerator.generate(); return original;
        }));
        this.engine.replaceObjects(objects.map(o => o.id), restored); this.message('Original handwriting restored at its original position.');
    }
    renderStudy() {
        const results = this.$('search-results'); results.replaceChildren();
        const query = this.$('document-search').value.trim().toLowerCase();
        if (query) for (const o of this.engine.drawnObjects.filter(o =>
            `${o.speechText || ''} ${o.text || ''} ${o.latex || ''}`.toLowerCase().includes(query)).slice(0, 100)) {
            this.item(results, `Page ${pageIndex(o, this.engine) + 1} · ${o.type}`, o.speechText || o.text || o.latex,
                [['Jump to note', () => this.gotoObject(o)]]);
        }
        const bookmarks = this.$('bookmark-list'); bookmarks.replaceChildren();
        for (const bookmark of this.metadata.bookmarks) this.item(bookmarks, bookmark.label, '', [
            ['Go', () => this.goto(bookmark.x, bookmark.y)], ['Remove', () => {
                this.metadata.bookmarks = this.metadata.bookmarks.filter(b => b.id !== bookmark.id); this.commit(); this.renderStudy();
            }]
        ]);
        const cards = this.$('card-list'); cards.replaceChildren();
        for (const card of this.metadata.cards) {
            const item = this.item(cards, card.question, '', [['Reveal answer', () => {
                const p = document.createElement('p'); p.textContent = card.answer; item.append(p);
            }], ['Source', () => this.goto(card.x, card.y)], ['Remove', () => {
                this.metadata.cards = this.metadata.cards.filter(c => c.id !== card.id); this.commit(); this.renderStudy();
            }]]);
        }
    }
    addCard(question, answer) {
        this.metadata.cards.push({ id: uid(), question, answer, x: this.engine.viewOffsetX, y: this.engine.viewOffsetY,
            objectIds: [...this.engine.selectedIds] }); this.commit(); this.renderStudy();
    }
    async generateCards() {
        if (!this.engine.selectedIds.size) throw new Error('Select notes or formulas to use as source.');
        const text = documentText(this.engine.drawnObjects, this.engine.selectedIds);
        if (!text) throw new Error('Select text, transcript or converted formulas.');
        const result = await window.ApiManager.callGeminiApi(null,
            'Create up to 5 study flashcards from this source. Return only a JSON array of {"question":"...","answer":"..."}. Source:\n' + text);
        const cards = JSON.parse(result.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (!Array.isArray(cards)) throw new Error('AI did not return valid flashcards.');
        for (const card of cards.slice(0, 5)) if (typeof card.question === 'string' && typeof card.answer === 'string') this.addCard(card.question, card.answer);
    }
    exportMarkdown() {
        const selection = this.engine.selectedIds.size ? this.engine.selectedIds : null;
        const text = `# ${this.metadata.title}\n\n${this.metadata.course} · ${this.metadata.date}\n\n` +
            documentText(this.engine.drawnObjects, selection) + '\n\n' + this.metadata.cards.map(c => `### ${c.question}\n\n${c.answer}`).join('\n\n');
        download(new Blob([text], { type: 'text/markdown' }), this.filename('.md'));
    }
    async startRecording() {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Audio recording requires a supported browser on HTTPS or localhost.');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
        try { this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
        catch (error) { stream.getTracks().forEach(t => t.stop()); throw error; }
        const recording = { id: uid(), name: `Recording ${this.metadata.recordings.length + 1}`, startedAt: Date.now(), mimeType: this.recorder.mimeType };
        this.activeRecording = recording;
        const chunks = []; this.audioWrite = Promise.resolve();
        this.recorder.ondataavailable = event => {
            if (event.data.size) {
                chunks.push(event.data);
                // Persist partial recordings, so a refresh does not discard the whole session.
                const blob = new Blob(chunks, { type: recording.mimeType });
                this.audioWrite = this.audioWrite.then(() => this.store.put('assets', recording.id, blob)).catch(error => {
                    this.message(`Audio save failed: ${error.message}`); throw error;
                });
                this.audioWrite.catch(() => {});
            }
        };
        this.recorder.onerror = event => this.message(`Recording error: ${event.error?.message || 'unknown error'}`);
        this.recorder.onstop = () => stream.getTracks().forEach(t => t.stop());
        this.metadata.recordings.push(recording); this.recorder.start(5000); this.commit();
        this.$('audio-record').textContent = 'Stop and save recording'; this.$('audio-state').textContent = 'Recording microphone';
        await this.save();
    }
    async stopRecording() {
        if (!this.recorder || this.recorder.state !== 'recording') return;
        const recording = this.activeRecording;
        await new Promise(resolve => {
            this.recorder.addEventListener('stop', resolve, { once: true }); this.recorder.stop();
        });
        await this.audioWrite; recording.endedAt = Date.now(); this.activeRecording = null;
        this.$('audio-record').textContent = 'Record microphone'; this.$('audio-state').textContent = 'Recording saved locally';
        this.commit(); await this.save(); await this.renderAudio();
    }
    async renderAudio() {
        if (this.replaying) return; // Do not replace an actively playing media element.
        this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls = [];
        const list = this.$('recording-list'); list.replaceChildren();
        for (const recording of this.metadata.recordings) {
            const blob = await this.store.get('assets', recording.id);
            const item = this.item(list, recording.name, new Date(recording.startedAt).toLocaleString(), []);
            if (!blob) { const p = document.createElement('p'); p.textContent = 'Audio unavailable. Open the complete lecture bundle.'; item.append(p); continue; }
            const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata';
            const url = URL.createObjectURL(blob); this.urls.push(url); audio.src = url; audio.dataset.recording = recording.id;
            audio.addEventListener('timeupdate', () => {
                if (!this.$('replay-enabled').checked) return;
                this.replaying = true; this.engine.replayTime = recording.startedAt + audio.currentTime * 1000;
                this.engine.redrawAll();
            });
            audio.addEventListener('play', () => {
                for (const other of list.querySelectorAll('audio')) if (other !== audio) other.pause();
                this.replaying = true;
            });
            audio.addEventListener('ended', () => this.stopReplay());
            item.append(audio);
            const save = document.createElement('button'); save.textContent = 'Download audio';
            save.onclick = () => download(blob, `${recording.name}.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`); item.append(save);
        }
        this.renderTranscript();
    }
    renderTranscript() {
        const list = this.$('transcript-list'); list.replaceChildren();
        for (const speech of this.engine.drawnObjects.filter(o => o.type === 'speech')) {
            this.item(list, new Date(speech.timestamp).toLocaleTimeString(), speech.speechText, [
                ['Jump to handwriting', () => {
                    const nearby = this.engine.drawnObjects.filter(o => o.type === 'path' && Math.abs(o.timestamp - speech.timestamp) < 30000);
                    const target = nearby[0] || speech; this.gotoObject(target);
                    this.engine.selectedIds = new Set(nearby.map(o => o.id)); this.engine.drawOverlay();
                }], ['Play from here', () => {
                    const recording = this.metadata.recordings.find(r => r.id === speech.recordingId) ||
                        this.metadata.recordings.find(r => r.startedAt <= speech.timestamp && (!r.endedAt || r.endedAt >= speech.timestamp));
                    if (!recording) throw new Error('No recording covers this transcript segment.');
                    const audio = this.$('recording-list').querySelector(`audio[data-recording="${recording.id}"]`);
                    if (!audio) throw new Error('Audio file is unavailable.');
                    audio.currentTime = Math.max(0, (speech.timestamp - recording.startedAt) / 1000); return audio.play();
                }]
            ]);
        }
    }
    stopReplay() {
        this.$('recording-list')?.querySelectorAll('audio').forEach(a => a.pause());
        this.replaying = false; this.engine.replayTime = null; this.engine.redrawAll();
    }
    accessibility() {
        document.querySelectorAll('.toolbar-button, .submenu-item, .sidebar-toggle-btn, .hide-toggle').forEach(element => {
            if (element.querySelector('a')) return;
            element.tabIndex = 0; element.setAttribute('role', 'button');
            element.setAttribute('aria-label', element.title || element.textContent.trim() || element.id);
            element.addEventListener('keydown', event => {
                if (event.target === element && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); element.click(); }
            });
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.$('lecture-workspace').hidden) this.$('workspace-close').click();
            if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); this.save().catch(error => this.message(error.message)); }
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault(); this.$('lecture-workspace').hidden = false;
                this.tab('study'); this.$('document-search').focus();
            }
        });
    }
}
