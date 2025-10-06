/* ==========================================================================
   Notes App v2.1 - Utilities Module
   ========================================================================== */

// Global app state
window.NotesApp = {
    VERSION: '2.1',
    GEMINI_API_KEY: localStorage.getItem('gemini_api_key') || '',
    MIN_ZOOM: 0.25,
    MAX_ZOOM: 3,
    ZOOM_STEP: 0.1,
    HISTORY_LIMIT: 100,
    AUTO_ADD_COOLDOWN: 400
};

console.log('Notes App v' + window.NotesApp.VERSION);

/* ==========================================================================
   History Management
   ========================================================================== */
class HistoryManager {
    constructor() {
        this.history = [];
        this.redoStack = [];
        this.autosaveTimer = null;
    }

    pushHistory(state) {
        const snap = JSON.stringify(state);
        this.history.push(snap);
        if (this.history.length > window.NotesApp.HISTORY_LIMIT) {
            this.history.shift();
        }
        this.redoStack.length = 0;
        this.scheduleAutosave();
    }

    undo() {
        if (this.history.length > 1) {
            const current = this.history.pop();
            this.redoStack.push(current);
            return JSON.parse(this.history[this.history.length - 1]);
        }
        return null;
    }

    redo() {
        if (this.redoStack.length > 0) {
            const snap = this.redoStack.pop();
            this.history.push(snap);
            return JSON.parse(snap);
        }
        return null;
    }

    scheduleAutosave() {
        if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => {
            const snap = this.history.length ? 
                this.history[this.history.length - 1] : 
                JSON.stringify(this.getCurrentState());
            try {
                localStorage.setItem('notes.autosave', snap);
            } catch (e) {
                console.warn('Failed to autosave:', e);
            }
        }, 500);
    }

    loadAutosave() {
        try {
            const snap = localStorage.getItem('notes.autosave');
            if (snap) {
                return JSON.parse(snap);
            }
        } catch (e) {
            console.warn('Failed to load autosave:', e);
        }
        return null;
    }

    getCurrentState() {
        // This will be overridden by the main app
        return {};
    }
}

/* ==========================================================================
   Geometry Utilities
   ========================================================================== */
class GeometryUtils {
    static ensureTransform(obj) {
        if (!obj.transform) {
            obj.transform = { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1 };
        }
    }

    static objectBounds(obj) {
        if (obj.type === 'timestamp') {
            // Approximate bounds for timestamp text
            const width = (obj.text ? obj.text.length : 10) * (obj.fontSize || 12) * 0.6;
            const height = obj.fontSize || 12;
            return { 
                minX: obj.x, 
                minY: obj.y, 
                maxX: obj.x + width, 
                maxY: obj.y + height 
            };
        } else if (obj.type === 'speech') {
            // Approximate bounds for speech text (word-wrapped)
            const fontSize = obj.fontSize || 14;
            const lineHeight = fontSize + 4;
            const maxWidth = 400;
            const charWidth = fontSize * 0.6;
            const approxCharsPerLine = Math.floor(maxWidth / charWidth);
            const textLength = obj.text ? obj.text.length : 50;
            const approxLines = Math.ceil(textLength / approxCharsPerLine);
            const width = Math.min(textLength * charWidth, maxWidth);
            const height = approxLines * lineHeight;
            return { 
                minX: obj.x, 
                minY: obj.y, 
                maxX: obj.x + width, 
                maxY: obj.y + height 
            };
        } else if (obj.type === 'path') {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            obj.points.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            });
            return { minX, minY, maxX, maxY };
        } else if (obj.type === 'line' || obj.type === 'rect') {
            const minX = Math.min(obj.startX, obj.endX);
            const maxX = Math.max(obj.startX, obj.endX);
            const minY = Math.min(obj.startY, obj.endY);
            const maxY = Math.max(obj.startY, obj.endY);
            return { minX, minY, maxX, maxY };
        } else if (obj.type === 'circle') {
            const r = Math.hypot(obj.endX - obj.startX, obj.endY - obj.startY);
            return {
                minX: obj.startX - r,
                minY: obj.startY - r,
                maxX: obj.startX + r,
                maxY: obj.startY + r
            };
        } else if (obj.dataUrl || obj.type === 'latex') {
            return {
                minX: obj.startX,
                minY: obj.startY,
                maxX: obj.endX,
                maxY: obj.endY
            };
        }
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    static objectCenter(obj) {
        const b = this.objectBounds(obj);
        return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }

    static getTransformedBounds(obj) {
        const b = this.objectBounds(obj);
        const c = this.objectCenter(obj);
        this.ensureTransform(obj);

        const corners = [
            { x: b.minX, y: b.minY },
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY },
            { x: b.minX, y: b.maxY }
        ];

        const transformed = corners.map(pt => {
            let x = pt.x - c.x;
            let y = pt.y - c.y;
            
            x *= obj.transform.scaleX;
            y *= obj.transform.scaleY;
            
            const cos = Math.cos(obj.transform.rotation);
            const sin = Math.sin(obj.transform.rotation);
            const xr = x * cos - y * sin;
            const yr = x * sin + y * cos;
            
            return {
                x: xr + c.x + obj.transform.tx,
                y: yr + c.y + obj.transform.ty
            };
        });

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        transformed.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });

        return { minX, minY, maxX, maxY, corners: transformed };
    }

    static pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const len = C * C + D * D;
        let t = -1;
        
        if (len) t = dot / len;
        
        let xx, yy;
        if (t < 0) {
            xx = x1;
            yy = y1;
        } else if (t > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + t * C;
            yy = y1 + t * D;
        }
        
        return Math.hypot(px - xx, py - yy);
    }

    static objectHitTest(obj, point, tolerance = 6) {
        this.ensureTransform(obj);
        const c = this.objectCenter(obj);
        
        let x = point.x - (c.x + obj.transform.tx);
        let y = point.y - (c.y + obj.transform.ty);
        
        const r = -obj.transform.rotation;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        const xr = x * cos - y * sin;
        const yr = x * sin + y * cos;
        
        const local = {
            x: xr / obj.transform.scaleX + c.x,
            y: yr / obj.transform.scaleY + c.y
        };

        if (obj.type === 'path') {
            for (let i = 1; i < obj.points.length; i++) {
                const p1 = obj.points[i - 1];
                const p2 = obj.points[i];
                if (this.pointToSegmentDistance(local.x, local.y, p1.x, p1.y, p2.x, p2.y) <= 
                    Math.max(tolerance, obj.size / 2)) {
                    return true;
                }
            }
            return false;
        } else if (obj.type === 'timestamp') {
            const bounds = this.objectBounds(obj);
            return local.x >= bounds.minX && local.x <= bounds.maxX && 
                   local.y >= bounds.minY && local.y <= bounds.maxY;
        } else if (obj.type === 'speech') {
            const bounds = this.objectBounds(obj);
            return local.x >= bounds.minX && local.x <= bounds.maxX && 
                   local.y >= bounds.minY && local.y <= bounds.maxY;
        } else if (obj.type === 'line') {
            return this.pointToSegmentDistance(local.x, local.y, obj.startX, obj.startY, obj.endX, obj.endY) <= 
                Math.max(tolerance, obj.size / 2);
        } else if (obj.type === 'rect' || obj.type === 'latex') {
            const minX = Math.min(obj.startX, obj.endX) - tolerance;
            const maxX = Math.max(obj.startX, obj.endX) + tolerance;
            const minY = Math.min(obj.startY, obj.endY) - tolerance;
            const maxY = Math.max(obj.startY, obj.endY) + tolerance;
            return local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY;
        } else if (obj.type === 'circle') {
            const r0 = Math.hypot(obj.endX - obj.startX, obj.endY - obj.startY);
            const d = Math.hypot(local.x - obj.startX, local.y - obj.startY);
            return Math.abs(d - r0) <= Math.max(tolerance, obj.size / 2);
        }
        
        return false;
    }
}

/* ==========================================================================
   File Operations
   ========================================================================== */
class FileManager {
    static exportToJson(data, filename = 'notes.json') {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    static async importFromJson(file) {
        if (!file) return null;
        try {
            const text = await file.text();
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to import file:', e);
            throw new Error('Invalid file format');
        }
    }
}

/* ==========================================================================
   ID Generator
   ========================================================================== */
class IdGenerator {
    constructor(startId = 1) {
        this.nextId = startId;
    }

    generate() {
        return this.nextId++;
    }

    setNext(id) {
        this.nextId = id;
    }
}

/* ==========================================================================
   API Manager
   ========================================================================== */
class ApiManager {
    static updateApiKey(newKey) {
        if (newKey !== null) {
            window.NotesApp.GEMINI_API_KEY = newKey.trim();
            localStorage.setItem('gemini_api_key', window.NotesApp.GEMINI_API_KEY);
            return true;
        }
        return false;
    }

    static async callGeminiApi(base64Image, prompt) {
        if (!window.NotesApp.GEMINI_API_KEY) {
            throw new Error('Gemini API Key is missing. Please set it in the settings menu.');
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${window.NotesApp.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: 'image/png',
                                    data: base64Image
                                }
                            }
                        ]
                    }]
                })
            }
        );

        if (!response.ok) {
            throw new Error('API Error: ' + response.statusText);
        }

        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
}

/* ==========================================================================
   Event Utilities
   ========================================================================== */
class EventUtils {
    static stopPropagation(callback) {
        return (e) => {
            e.stopPropagation();
            callback(e);
        };
    }

    static preventDefault(callback) {
        return (e) => {
            e.preventDefault();
            callback(e);
        };
    }

    static once(element, event, callback) {
        const handler = (e) => {
            element.removeEventListener(event, handler);
            callback(e);
        };
        element.addEventListener(event, handler);
    }
}

// Export utilities to global scope
window.HistoryManager = HistoryManager;
window.GeometryUtils = GeometryUtils;
window.FileManager = FileManager;
window.IdGenerator = IdGenerator;
window.ApiManager = ApiManager;
window.EventUtils = EventUtils;