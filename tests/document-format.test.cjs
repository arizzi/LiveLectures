const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const storage = new Map();
const context = vm.createContext({
    window: {}, console, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }
});
vm.runInContext(readFileSync('utils.js', 'utf8') + '\nglobalThis.exports = { DocumentCodec, HistoryManager };', context);
const { DocumentCodec: codec, HistoryManager } = context.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const objects = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1, type: 'path', size: 2, color: '#000', timestamp: i,
    points: Array.from({ length: 100 }, (_, j) => ({ x: i + j / 8, y: j / 4, pressure: 0.5 })),
    transform: { tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotation: 0 }
}));
const state = { drawnObjects: objects, nextId: 1001, canvasWidth: 794, canvasHeight: 2246 };
const packed = codec.encode(state);
assert.deepEqual(plain(codec.decode(packed)).drawnObjects, objects);
assert.throws(() => codec.decode({ ...state, version: 1 }), /version/);
assert.throws(() => codec.decode(state), /version/);
const special = { type: 'latex', latex: 'x^2', img: {}, cachedImg: {}, renderedSvg: '<svg/>', isRendering: true };
assert.deepEqual(plain(codec.unpackObject(codec.packObject(special))), { type: 'latex', latex: 'x^2' });
const extraPoint = { points: [{ x: 1, y: 2, pressure: 0, time: 10 }] };
assert.deepEqual(plain(codec.unpackObject(codec.packObject(extraPoint))), extraPoint);
assert.throws(() => codec.decode({ ...state, version: 99 }), /version/);
assert.throws(() => codec.decode({ version: 2, drawnObjects: [{ pointData: [1, 2] }] }), /point/);
assert.throws(() => codec.decode({}), /Invalid/);
let autosave;
const persist = json => { autosave = JSON.parse(json); };
const emptyHistory = new HistoryManager();
emptyHistory.persist = persist;
emptyHistory.getCurrentState = () => ({ drawnObjects: [] });
emptyHistory.scheduleAutosave(true);
assert.equal(codec.decode(autosave).drawnObjects.length, 0);
emptyHistory.pushHistory({ drawnObjects: [] });
emptyHistory.scheduleAutosave(true);
assert.equal(codec.decode(autosave).drawnObjects.length, 0);
const history = new HistoryManager();
history.persist = persist;
const started = performance.now();
history.pushHistory(state);
for (let i = 0; i < 20; i++) {
    objects[0].transform.tx++;
    history.pushHistory(state);
}
const elapsed = performance.now() - started;
assert.equal(history.history[0].objects[1], history.history[20].objects[1]);
assert.notEqual(history.history[0].objects[0], history.history[20].objects[0]);
assert.equal(history.undo().drawnObjects[0].transform.tx, 19);
history.scheduleAutosave(true);
assert.equal(codec.decode(autosave).drawnObjects[0].transform.tx, 19);
assert.equal(history.redo().drawnObjects[0].transform.tx, 20);
history.scheduleAutosave(true);
assert.equal(codec.decode(autosave).drawnObjects[0].transform.tx, 20);
history.undo();
history.pushHistory(state);
assert.equal(history.redo(), null);
clearTimeout(history.autosaveTimer);
const entries = new Set(history.history.flatMap(s => s.objects));
const sharedBytes = [...entries].reduce((sum, entry) => sum + entry.json.length, 0) +
    history.history.reduce((sum, s) => sum + s.metadata.length + s.objects.length * 8, 0);
const oldBytes = JSON.stringify(state).length;
const newBytes = JSON.stringify(packed).length;
console.log(JSON.stringify({ objects: objects.length, points: 100000,
    legacyJSONBytes: oldBytes, compactJSONBytes: newBytes,
    fileReduction: ((1 - newBytes / oldBytes) * 100).toFixed(1) + '%',
    fullSnapshotHistoryBytes: oldBytes * history.history.length,
    sharedPayloadBytesEstimate: sharedBytes,
    historyCaptureMilliseconds: Math.round(elapsed)
}, null, 2));
console.log('All document format and history tests passed.');
