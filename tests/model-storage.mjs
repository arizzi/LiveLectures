import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { indexedDB } = require('fake-indexeddb');
globalThis.indexedDB = indexedDB;
const { LectureStore } = await import('../features/storage.mjs');
const { newLecture, validateDocument, moveObject, documentText } = await import('../features/model.mjs');
const metadata = newLecture();
const object = { id: 1, type: 'path', points: [{ x: 2, y: 3, pressure: 0 }], transform: { tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotation: 0 } };
const state = { version: 2, lecture: metadata, pageCount: 2, drawnObjects: [object], nextId: 1 };
assert.equal(validateDocument(structuredClone(state)).nextId, 2);
for (const changes of [{ version: 1 }, { pageCount: -1 }, { pageWidth: Infinity }, { drawnObjects: [object, object] },
    { drawnObjects: [{ ...object, points: [{ x: NaN, y: 0, pressure: 1 }] }] },
    { drawnObjects: [{ ...object, transform: { tx: Infinity } }] },
    { lecture: { ...metadata, cards: 'bad' } }]) assert.throws(() => validateDocument({ ...state, ...changes }));
assert.equal(moveObject(object, 200).transform.ty, 200);
assert.equal(object.transform.ty, 0);
assert.equal(documentText([{ id: 1, type: 'text', text: 'hello' }, { id: 2, type: 'latex', latex: 'x^2' }]), 'hello\n\n$$x^2$$');
const store = await new LectureStore().open();
for (let i = 0; i < 8; i++) await store.save({ id: metadata.id, metadata, json: String(i), updatedAt: i });
assert.equal((await store.get('lectures', metadata.id)).json, '7');
assert.deepEqual((await store.get('recovery', metadata.id)).map(r => r.json), ['6', '5', '4', '3', '2']);
assert.equal(await store.get('settings', 'active'), metadata.id);
await store.save({ id: metadata.id, metadata, json: '7', updatedAt: 10 });
assert.deepEqual((await store.get('recovery', metadata.id)).map(r => r.json), ['6', '5', '4', '3', '2']);
const recordingId = 'recording-id'; metadata.recordings.push({ id: recordingId });
await store.put('assets', recordingId, new Blob(['audio']));
await store.save({ id: metadata.id, metadata, json: '8', updatedAt: 8 });
await store.deleteLecture(metadata.id);
assert.equal(await store.get('assets', recordingId), undefined);
assert.equal(await store.get('lectures', metadata.id), undefined);
assert.equal(await store.get('recovery', metadata.id), undefined);
// A failed transaction must not partially commit.
await assert.rejects(store.transaction(['lectures'], 'readwrite', tx => {
    tx.objectStore('lectures').put({ value: 1 }, 'aborted'); throw new Error('abort test');
}));
assert.equal(await store.get('lectures', 'aborted'), undefined);
console.log('Document validation, page helpers, IndexedDB recovery and transaction tests passed.');
store.db.close();
