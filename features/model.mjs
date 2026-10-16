export const identity = () => ({ tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotation: 0 });
export const uid = () => crypto.randomUUID();
export function newLecture() {
    return { id: uid(), title: 'Untitled lecture', course: '', date: new Date().toLocaleDateString('en-CA'),
        tags: [], bookmarks: [], cards: [], recordings: [], createdAt: Date.now() };
}
export function pageIndex(object, engine) {
    const bounds = window.GeometryUtils.getTransformedBounds(object);
    return Math.max(0, Math.floor(((bounds.minY + bounds.maxY) / 2 - engine.PAGE_MARGIN) /
        (engine.A4_HEIGHT + engine.PAGE_SPACING)));
}
export function moveObject(object, delta) {
    const copy = structuredClone(object);
    copy.transform = { ...identity(), ...copy.transform, ty: (copy.transform?.ty || 0) + delta };
    return copy;
}
export function documentText(objects, selected = null) {
    return objects.filter(o => !selected || selected.has(o.id)).map(o => {
        if (o.type === 'latex') return `$$${o.latex}$$`;
        return o.speechText || o.text || '';
    }).filter(Boolean).join('\n\n');
}
export function validateDocument(data) {
    const bounded = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
    if (!data || data.version !== 2 || !Array.isArray(data.drawnObjects) || data.drawnObjects.length > 200000) {
        throw new Error('Expected a version 2 lecture document (up to 200,000 objects).');
    }
    const dimensions = data.canvas || { width: data.canvasWidth, height: data.canvasHeight, pageHeight: data.pageHeight };
    for (const field of ['width', 'height', 'pageHeight']) {
        if (dimensions[field] != null && !bounded(dimensions[field], 1, 10000000)) throw new Error('Invalid page dimensions.');
    }
    for (const field of ['pageWidth', 'pageAspectHeight', 'pageHeight']) {
        if (data[field] != null && !bounded(data[field], 1, 8192)) throw new Error('Invalid page size.');
    }
    if (data.pageCount != null && (!Number.isSafeInteger(data.pageCount) || data.pageCount < 1 || data.pageCount > 10000)) {
        throw new Error('Invalid page count.');
    }
    if (data.viewScale != null && !bounded(data.viewScale, .05, 20)) throw new Error('Invalid zoom.');
    for (const field of ['viewOffsetX', 'viewOffsetY']) if (data[field] != null && !bounded(data[field], -1e8, 1e8)) throw new Error('Invalid view position.');
    if (data.lecture) {
        const meta = data.lecture;
        if (typeof meta.id !== 'string' || typeof meta.title !== 'string' || typeof meta.course !== 'string' || typeof meta.date !== 'string') throw new Error('Invalid lecture metadata.');
        for (const key of ['tags', 'bookmarks', 'cards', 'recordings']) if (!Array.isArray(meta[key]) || meta[key].length > 10000) throw new Error('Invalid lecture metadata.');
        if (!meta.tags.every(tag => typeof tag === 'string')) throw new Error('Invalid tags.');
        for (const bookmark of meta.bookmarks) if (typeof bookmark.id !== 'string' || typeof bookmark.label !== 'string' ||
            !bounded(bookmark.x, -1e8, 1e8) || !bounded(bookmark.y, -1e8, 1e8)) throw new Error('Invalid bookmark.');
        for (const card of meta.cards) if (typeof card.id !== 'string' || typeof card.question !== 'string' || typeof card.answer !== 'string' ||
            !bounded(card.x, -1e8, 1e8) || !bounded(card.y, -1e8, 1e8)) throw new Error('Invalid flashcard.');
        for (const recording of meta.recordings) if (typeof recording.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(recording.id) ||
            typeof recording.name !== 'string' || !bounded(recording.startedAt, 0, 1e15)) throw new Error('Invalid recording.');
    }
    const ids = new Set();
    let pointCount = 0;
    const types = new Set(['path', 'line', 'circle', 'rect', 'latex', 'image', 'svg', 'speech', 'timestamp', 'text']);
    for (const o of data.drawnObjects) {
        if (!o || !types.has(o.type) || !Number.isSafeInteger(o.id) || o.id < 1 || ids.has(o.id)) {
            throw new Error('Invalid object type or duplicate/missing object ID.');
        }
        ids.add(o.id);
        if (o.type === 'path' && !Array.isArray(o.points)) throw new Error('Missing stroke points.');
        if (o.points) {
            pointCount += o.points.length;
            if (pointCount > 5000000) throw new Error('Document exceeds five million points.');
            for (const p of o.points) {
                if (!bounded(p.x, -1e8, 1e8) || !bounded(p.y, -1e8, 1e8) || !bounded(p.pressure, 0, 1)) {
                    throw new Error('Invalid stroke coordinates or pressure.');
                }
            }
        }
        for (const field of ['x', 'y', 'startX', 'startY', 'endX', 'endY', 'size', 'fontSize']) {
            if (o[field] != null && !bounded(o[field], -1e8, 1e8)) throw new Error('Invalid object coordinates.');
        }
        if (o.transform) for (const field of ['tx', 'ty', 'scaleX', 'scaleY', 'rotation']) {
            if (!bounded(o.transform[field], -1e8, 1e8)) throw new Error('Invalid object transform.');
        }
        if (o.type === 'latex' && typeof o.latex !== 'string') throw new Error('Invalid formula.');
        if (o.dataUrl && !/^data:image\/(png|jpeg|webp);base64,/.test(o.dataUrl)) {
            // SVG conversion produces raster canvas images too; never import executable SVG data.
            throw new Error('Only raster image data is accepted.');
        }
    }
    if (data.nextId != null && (!Number.isSafeInteger(data.nextId) || data.nextId < 1)) throw new Error('Invalid next object ID.');
    const maxId = data.drawnObjects.reduce((max, object) => Math.max(max, object.id), 0);
    data.nextId = Math.max(data.nextId || 1, maxId + 1);
    return data;
}
export function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
