/* ==========================================================================
   Notes App v2.1 - Drawing Engine Module
   ========================================================================== */

class DrawingEngine {
    constructor() {
        this.drawnObjects = [];
        this.selectedIds = new Set();
        this.currentPath = null;
        this.idGenerator = new IdGenerator();
        this.viewOffsetX = 0;
        this.viewOffsetY = 0;
        this.viewScale = 1;
        this.PAGE_HEIGHT = 0;
        
        // Timestamp tracking for drawing events
        this.lastTimestampTime = 0;
        this.timestampInterval = 5000; // 5 seconds
        
        // Auto formula recognition tracking
        this.autoFormulaEnabled = false;
        this.autoFormulaStartTime = null;
        this.lastStrokeTime = null; // Track time of last stroke for timeout calculation
        this.autoFormulaTimeout = null;
        this.autoFormulaIdleTime = 2000; // 8 seconds of idle time (increased)
        this.lastStrokeY = null;
        this.newLineThreshold = 80; // pixels for detecting new line (increased)
        this.lastScrollY = 0;
        this.scrollThreshold = 150; // pixels scrolled to trigger recognition (increased)
        this.autoFormulaStrokeIds = new Set(); // Track strokes separately from visible selection
        
        // Canvas references (will be set by main app)
        this.canvas = null;
        this.ctx = null;
        this.previewCanvas = null;
        this.previewCtx = null;
        this.canvasContainer = null;
        
        // Drawing state
        this.isDrawing = false;
        this.isPanning = false;
        this.isErasing = false;
        this.shapeStartX = 0;
        this.shapeStartY = 0;
        this.currentTool = 'pen';
        this.panStartX = 0;
        this.panStartY = 0;
        
        // Selection and transformation
        this.selectionDrag = null;
        this.marqueeRect = null;
        
        // Touch/pinch handling
        this.pointers = new Map();
        this.isPinching = false;
        this.pinchStartDist = 0;
        this.pinchStartScale = 1;
        this.pinchCenter = { x: 0, y: 0 };
        
        // Auto page add throttling
        this.lastAutoAddHeight = 0;
        this.lastAutoAddTime = 0;
    }

    /* ==========================================================================
       Canvas Setup and Management
       ========================================================================== */
    initializeCanvases(canvas, previewCanvas, canvasContainer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.previewCanvas = previewCanvas;
        this.previewCtx = previewCanvas.getContext('2d');
        this.canvasContainer = canvasContainer;
        
        this.resizeCanvases();
    }

    resizeCanvases() {
        const { width, height } = this.canvasContainer.getBoundingClientRect();
        
        if (!this.canvas.width) this.canvas.width = width;
        if (!this.canvas.height) this.canvas.height = height;
        
        this.previewCanvas.width = width;
        this.previewCanvas.height = height;
        
        if (!this.PAGE_HEIGHT) this.PAGE_HEIGHT = height;
        
        this.redrawAll();
    }

    /* ==========================================================================
       Coordinate System
       ========================================================================== */
    getCanvasCoords(e) {
        const rect = this.previewCanvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.viewScale + this.viewOffsetX;
        const y = (e.clientY - rect.top) / this.viewScale + this.viewOffsetY;
        return { x, y };
    }

    worldToScreen(pt) {
        return {
            x: (pt.x - this.viewOffsetX) * this.viewScale,
            y: (pt.y - this.viewOffsetY) * this.viewScale
        };
    }

    /* ==========================================================================
       Object Rendering
       ========================================================================== */
    applyCtxObjectTransform(ctx, obj) {
        GeometryUtils.ensureTransform(obj);
        const c = GeometryUtils.objectCenter(obj);
        
        ctx.save();
        ctx.translate(c.x + obj.transform.tx, c.y + obj.transform.ty);
        ctx.rotate(obj.transform.rotation);
        ctx.scale(obj.transform.scaleX, obj.transform.scaleY);
        ctx.translate(-c.x, -c.y);
    }

    drawObject(ctx, obj) {
        GeometryUtils.ensureTransform(obj);
        
        // Skip rendering timestamp and speech objects (but keep them in memory/JSON)
        if (obj.type === 'timestamp' || obj.type === 'speech') {
            return;
        }
        
        this.applyCtxObjectTransform(ctx, obj);

        // Handle timestamp objects
        if (obj.type === 'timestamp') {
            ctx.save();
            ctx.fillStyle = obj.color || '#666';
            ctx.font = `${obj.fontSize || 12}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(obj.text, obj.x, obj.y);
            ctx.restore();
            return;
        }

        // Handle speech objects
        if (obj.type === 'speech') {
            ctx.save();
            ctx.fillStyle = obj.color || '#0066cc';
            ctx.font = `${obj.fontSize || 14}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Word wrap for long speech text
            const maxWidth = 400;
            const words = obj.text.split(' ');
            let line = '';
            let y = obj.y;
            const lineHeight = (obj.fontSize || 14) + 4;
            
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                
                if (testWidth > maxWidth && n > 0) {
                    ctx.fillText(line, obj.x, y);
                    line = words[n] + ' ';
                    y += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, obj.x, y);
            ctx.restore();
            return;
        }

        // Handle LaTeX objects - render directly without storing image data
        if (obj.type === 'latex') {
            if (window.LatexRenderer) {
                window.LatexRenderer.drawLatexObject(ctx, obj);
            }
            ctx.restore();
            return;
        }

        // Handle legacy image objects (for backward compatibility)
        if (obj.dataUrl) {
            if (!obj.img) {
                obj.img = new Image();
                obj.img.src = obj.dataUrl;
                obj.img.onload = () => this.redrawAll();
            }
            if (obj.img.complete && obj.img.naturalWidth > 0) {
                const bounds = GeometryUtils.objectBounds(obj);
                ctx.drawImage(
                    obj.img,
                    bounds.minX,
                    bounds.minY,
                    bounds.maxX - bounds.minX,
                    bounds.maxY - bounds.minY
                );
            }
            ctx.restore();
            return;
        }

        // Draw regular objects
        ctx.strokeStyle = obj.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (obj.type === 'path') {
            if (obj.points.length > 1) {
                for (let i = 1; i < obj.points.length; i++) {
                    const p1 = obj.points[i - 1];
                    const p2 = obj.points[i];
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineWidth = obj.size * (p1.pressure > 0 ? p1.pressure : 0.5);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        } else {
            ctx.lineWidth = obj.size;
            if (obj.type === 'line') {
                ctx.beginPath();
                ctx.moveTo(obj.startX, obj.startY);
                ctx.lineTo(obj.endX, obj.endY);
                ctx.stroke();
            } else if (obj.type === 'circle') {
                ctx.beginPath();
                const r = Math.hypot(obj.endX - obj.startX, obj.endY - obj.startY);
                ctx.arc(obj.startX, obj.startY, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (obj.type === 'rect') {
                ctx.strokeRect(
                    obj.startX,
                    obj.startY,
                    obj.endX - obj.startX,
                    obj.endY - obj.startY
                );
            }
        }
        ctx.restore();
    }

    /* ==========================================================================
       Selection and Overlay Rendering
       ========================================================================== */
    drawOverlay() {
        this.previewCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

        // Draw marquee selection
        if (this.marqueeRect) {
            const x1 = (Math.min(this.marqueeRect.x1, this.marqueeRect.x2) - this.viewOffsetX) * this.viewScale;
            const y1 = (Math.min(this.marqueeRect.y1, this.marqueeRect.y2) - this.viewOffsetY) * this.viewScale;
            const x2 = (Math.max(this.marqueeRect.x1, this.marqueeRect.x2) - this.viewOffsetX) * this.viewScale;
            const y2 = (Math.max(this.marqueeRect.y1, this.marqueeRect.y2) - this.viewOffsetY) * this.viewScale;

            this.previewCtx.save();
            this.previewCtx.strokeStyle = '#3b82f6';
            this.previewCtx.fillStyle = 'rgba(59,130,246,0.1)';
            this.previewCtx.setLineDash([4, 2]);
            this.previewCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            this.previewCtx.fillRect(x1, y1, x2 - x1, y2 - y1);
            this.previewCtx.restore();
        }

        // Draw selection handles
        if (this.selectedIds.size === 0) return;

        const selected = this.drawnObjects.filter(o => this.selectedIds.has(o.id));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        selected.forEach(o => {
            const b = GeometryUtils.getTransformedBounds(o);
            if (b.minX < minX) minX = b.minX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.maxY > maxY) maxY = b.maxY;
        });

        const tl = this.worldToScreen({ x: minX, y: minY });
        const br = this.worldToScreen({ x: maxX, y: maxY });
        const w = br.x - tl.x;
        const h = br.y - tl.y;

        this.previewCtx.save();
        this.previewCtx.strokeStyle = '#3b82f6';
        this.previewCtx.setLineDash([6, 4]);
        this.previewCtx.strokeRect(tl.x, tl.y, w, h);
        this.previewCtx.setLineDash([]);

        // Draw resize handles
        const handleSize = 10;
        const handles = [
            { name: 'nw', x: tl.x, y: tl.y },
            { name: 'n', x: tl.x + w / 2, y: tl.y },
            { name: 'ne', x: tl.x + w, y: tl.y },
            { name: 'e', x: tl.x + w, y: tl.y + h / 2 },
            { name: 'se', x: tl.x + w, y: tl.y + h },
            { name: 's', x: tl.x + w / 2, y: tl.y + h },
            { name: 'sw', x: tl.x, y: tl.y + h },
            { name: 'w', x: tl.x, y: tl.y + h / 2 }
        ];

        this.previewCtx.fillStyle = '#fff';
        this.previewCtx.strokeStyle = '#2563eb';
        handles.forEach(hd => {
            this.previewCtx.beginPath();
            this.previewCtx.rect(
                hd.x - handleSize / 2,
                hd.y - handleSize / 2,
                handleSize,
                handleSize
            );
            this.previewCtx.fill();
            this.previewCtx.stroke();
        });

        // Draw rotation handle
        const rotX = tl.x + w / 2;
        const rotY = tl.y - 24;
        this.previewCtx.beginPath();
        this.previewCtx.moveTo(tl.x + w / 2, tl.y);
        this.previewCtx.lineTo(rotX, rotY);
        this.previewCtx.stroke();
        this.previewCtx.beginPath();
        this.previewCtx.arc(rotX, rotY, 6, 0, Math.PI * 2);
        this.previewCtx.fill();
        this.previewCtx.stroke();

        this.previewCtx.restore();
    }

    /* ==========================================================================
       Main Rendering
       ========================================================================== */
    redrawAll() {
        // Clear and setup main canvas
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply view transform
        this.ctx.setTransform(
            this.viewScale, 0, 0, this.viewScale,
            -this.viewOffsetX * this.viewScale,
            -this.viewOffsetY * this.viewScale
        );

        // Draw page separators
        const numPages = Math.ceil(this.canvas.height / this.PAGE_HEIGHT);
        for (let i = 1; i < numPages; i++) {
            const y = i * this.PAGE_HEIGHT;
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#e0e0e0';
            this.ctx.lineWidth = 1 / this.viewScale;
            this.ctx.setLineDash([6 / this.viewScale, 6 / this.viewScale]);
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // Draw all objects
        this.drawnObjects.forEach(obj => this.drawObject(this.ctx, obj));

        // Draw overlay (selection, marquee, etc.)
        this.drawOverlay();
    }

    /* ==========================================================================
       Zoom and Pan
       ========================================================================== */
    setZoom(newScale, anchorScreenX = this.previewCanvas.width / 2, anchorScreenY = this.previewCanvas.height / 2) {
        const before = {
            x: anchorScreenX / this.viewScale + this.viewOffsetX,
            y: anchorScreenY / this.viewScale + this.viewOffsetY
        };

        this.viewScale = Math.max(
            window.NotesApp.MIN_ZOOM,
            Math.min(window.NotesApp.MAX_ZOOM, newScale)
        );

        const after = {
            x: anchorScreenX / this.viewScale + this.viewOffsetX,
            y: anchorScreenY / this.viewScale + this.viewOffsetY
        };

        this.viewOffsetX += before.x - after.x;
        this.viewOffsetY += before.y - after.y;

        this.updateZoomLabel();
        this.redrawAll();
    }

    updateZoomLabel() {
        const zoomEl = document.getElementById('zoomLabel');
        if (zoomEl) {
            zoomEl.textContent = Math.round(this.viewScale * 100) + '%';
        }
    }

    /* ==========================================================================
       Page Management
       ========================================================================== */
    addPage() {
        this.canvas.height += this.PAGE_HEIGHT;
    }

    /* ==========================================================================
       Selection Utilities
       ========================================================================== */
    hitTestSelectionHandles(screenX, screenY) {
        if (this.selectedIds.size === 0) return null;

        const selected = this.drawnObjects.filter(o => this.selectedIds.has(o.id));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        selected.forEach(o => {
            const b = GeometryUtils.getTransformedBounds(o);
            if (b.minX < minX) minX = b.minX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.maxY > maxY) maxY = b.maxY;
        });

        const tl = this.worldToScreen({ x: minX, y: minY });
        const br = this.worldToScreen({ x: maxX, y: maxY });
        const w = br.x - tl.x;
        const h = br.y - tl.y;
        const hs = 12;

        const handles = [
            { name: 'nw', x: tl.x, y: tl.y, axis: 'both' },
            { name: 'n', x: tl.x + w / 2, y: tl.y, axis: 'y' },
            { name: 'ne', x: tl.x + w, y: tl.y, axis: 'both' },
            { name: 'e', x: tl.x + w, y: tl.y + h / 2, axis: 'x' },
            { name: 'se', x: tl.x + w, y: tl.y + h, axis: 'both' },
            { name: 's', x: tl.x + w / 2, y: tl.y + h, axis: 'y' },
            { name: 'sw', x: tl.x, y: tl.y + h, axis: 'both' },
            { name: 'w', x: tl.x, y: tl.y + h / 2, axis: 'x' }
        ];

        for (const hd of handles) {
            if (screenX >= hd.x - hs / 2 && screenX <= hd.x + hs / 2 &&
                screenY >= hd.y - hs / 2 && screenY <= hd.y + hs / 2) {
                return { type: 'resize', handle: hd.name, axis: hd.axis };
            }
        }

        // Rotation handle
        const rx = tl.x + w / 2;
        const ry = tl.y - 24;
        if (Math.hypot(screenX - rx, screenY - ry) <= 10) {
            return { type: 'rotate' };
        }

        return null;
    }

    /* ==========================================================================
       Object Management
       ========================================================================== */
    addObject(obj) {
        obj.id = this.idGenerator.generate();
        obj.timestamp = Date.now(); // Add timestamp to all objects
        GeometryUtils.ensureTransform(obj);
        this.drawnObjects.push(obj);
        
        // Check if we need to add a timestamp
        this.checkAndAddTimestamp();
        
        // Trigger auto-formula tracking for drawing objects
        if (obj.type === 'path' || obj.type === 'line' || obj.type === 'circle' || obj.type === 'rect') {
            let strokeY = obj.startY || 0;
            if (obj.type === 'path' && obj.points && obj.points.length > 0) {
                strokeY = obj.points[0].y;
            }
            
            // Add to auto-formula tracking (separate from visible selection)
            if (this.autoFormulaEnabled) {
                this.autoFormulaStrokeIds.add(obj.id);
                console.log(`➕ Added stroke ${obj.id} (${obj.type}) to auto-formula tracking`);
            }
            
            this.onStrokeAdded(strokeY);
        }
        
        return obj;
    }

    checkAndAddTimestamp() {
        const now = Date.now();
        if (now - this.lastTimestampTime > this.timestampInterval) {
            this.addTimestampObject();
            this.lastTimestampTime = now;
        }
    }

    addTimestampObject() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Find a good position for the timestamp (top-right of current view)
        const x = this.viewOffsetX + (this.previewCanvas.width / this.viewScale) - 150;
        const y = this.viewOffsetY + 30;
        
        const timestampObj = {
            id: this.idGenerator.generate(),
            type: 'timestamp',
            text: `⏰ ${timeString}`,
            x: x,
            y: y,
            color: '#666',
            fontSize: 12,
            timestamp: now.getTime(),
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1 }
        };
        
        this.drawnObjects.push(timestampObj);
        console.log(`Added drawing timestamp: ${timeString}`);
    }

    removeSelectedObjects() {
        if (this.selectedIds.size === 0) return false;
        
        this.drawnObjects = this.drawnObjects.filter(o => !this.selectedIds.has(o.id));
        this.selectedIds.clear();
        return true;
    }

    selectAll() {
        this.selectedIds = new Set(this.drawnObjects.map(o => o.id));
    }

    clearSelection() {
        this.selectedIds.clear();
    }

    /* ==========================================================================
       State Management
       ========================================================================== */
    getState() {
        return {
            drawnObjects: this.drawnObjects,
            viewOffsetX: this.viewOffsetX,
            viewOffsetY: this.viewOffsetY,
            viewScale: this.viewScale,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            pageHeight: this.PAGE_HEIGHT,
            nextId: this.idGenerator.nextId,
            lastTimestampTime: this.lastTimestampTime
        };
    }

    setState(state) {
        this.drawnObjects = state.drawnObjects || [];
        this.viewOffsetX = state.viewOffsetX || 0;
        this.viewOffsetY = state.viewOffsetY || 0;
        this.viewScale = state.viewScale || 1;
        this.canvas.width = state.canvasWidth || this.canvas.width;
        this.canvas.height = state.canvasHeight || this.canvas.height;
        this.PAGE_HEIGHT = state.pageHeight || this.PAGE_HEIGHT || this.previewCanvas.height;
        this.idGenerator.setNext(state.nextId || this.idGenerator.nextId);
        this.lastTimestampTime = state.lastTimestampTime || 0;
        this.selectedIds.clear();
        this.updateZoomLabel();
    }

    clear() {
        this.drawnObjects = [];
        this.selectedIds.clear();
        this.viewOffsetX = 0;
        this.viewOffsetY = 0;
        this.viewScale = 1;
        this.lastTimestampTime = 0;
        
        const { width, height } = this.canvasContainer.getBoundingClientRect();
        this.canvas.width = width;
        this.canvas.height = height;
        this.PAGE_HEIGHT = height;
        
        this.updateZoomLabel();
    }

    /* ==========================================================================
       Timestamp Configuration
       ========================================================================== */
    setTimestampInterval(milliseconds) {
        this.timestampInterval = milliseconds;
        console.log(`Drawing timestamp interval set to ${milliseconds}ms`);
    }

    getTimestampInterval() {
        return this.timestampInterval;
    }

    /* ==========================================================================
       Auto Formula Recognition
       ========================================================================== */
    setAutoFormulaEnabled(enabled) {
        this.autoFormulaEnabled = enabled;
        console.log(`🤖 Auto-formula recognition ${enabled ? 'ENABLED' : 'DISABLED'}`);
        if (enabled) {
            this.resetAutoFormulaTracking();
        } else {
            this.clearAutoFormulaTimeout();
        }
    }

    resetAutoFormulaTracking() {
        this.autoFormulaStartTime = Date.now();
        this.lastStrokeTime = null;
        this.lastStrokeY = null;
        this.lastScrollY = window.scrollY || 0;
        this.autoFormulaStrokeIds.clear(); // Clear tracked strokes
        this.clearAutoFormulaTimeout();
        console.log('🎯 Auto-formula tracking reset, waiting for strokes...');
    }

    clearAutoFormulaTimeout() {
        if (this.autoFormulaTimeout) {
            clearTimeout(this.autoFormulaTimeout);
            this.autoFormulaTimeout = null;
        }
    }

    onStrokeAdded(strokeY) {
        if (!this.autoFormulaEnabled) return;

        const now = Date.now();
        
        // Start tracking if this is the first stroke
        if (this.autoFormulaStartTime === null) {
            this.resetAutoFormulaTracking();
        }

        this.lastStrokeTime = now;
        const strokeCount = this.autoFormulaStrokeIds.size;
        const timeSinceStart = now - this.autoFormulaStartTime;
        
        console.log(`✏️ Stroke added at Y=${strokeY}, count=${strokeCount}, time since start=${timeSinceStart}ms`);

        // Check for new line (significant Y position change) - be more conservative
        if (this.lastStrokeY !== null && strokeY > this.lastStrokeY + this.newLineThreshold) {
            // Only trigger if we have multiple strokes and enough time has passed
            if (strokeCount >= 3 && timeSinceStart > 3000) {
                console.log(`📏 New line detected! Y change: ${this.lastStrokeY} → ${strokeY} (${strokeY - this.lastStrokeY}px)`);
                this.triggerAutoFormula('new_line');
                return;
            } else {
                console.log(`📏 New line detected but not triggering: strokeCount=${strokeCount} (need ≥3), timeSinceStart=${timeSinceStart}ms (need >3000ms)`);
            }
        }

        this.lastStrokeY = strokeY;

        // Clear previous timeout and set new one FROM LAST STROKE TIME
        this.clearAutoFormulaTimeout();
        console.log(`⏰ Setting ${this.autoFormulaIdleTime}ms timeout from LAST stroke (now)`);
        
        this.autoFormulaTimeout = setTimeout(() => {
            const timeFromLastStroke = Date.now() - this.lastStrokeTime;
            console.log(`⏰ Timeout fired! Time from last stroke: ${timeFromLastStroke}ms, stroke count: ${this.autoFormulaStrokeIds.size}`);
            
            // Only trigger if we have enough strokes
            if (this.autoFormulaStrokeIds.size >= 2) {
                console.log(`✅ Triggering auto-formula due to idle timeout`);
                this.triggerAutoFormula('idle_timeout');
            } else {
                console.log(`❌ Not triggering: only ${this.autoFormulaStrokeIds.size} strokes (need ≥2)`);
            }
        }, this.autoFormulaIdleTime);
    }

    onScrollChanged() {
        if (!this.autoFormulaEnabled) return;
        
        const currentScrollY = window.scrollY || 0;
        const scrollDiff = Math.abs(currentScrollY - this.lastScrollY);
        
        if (scrollDiff > this.scrollThreshold) {
            const strokeCount = this.autoFormulaStrokeIds.size;
            const timeSinceStart = this.autoFormulaStartTime ? (Date.now() - this.autoFormulaStartTime) : 0;
            
            console.log(`📜 Scroll detected! Diff: ${scrollDiff}px (threshold: ${this.scrollThreshold}px)`);
            
            // Only trigger if we have enough strokes and enough time has passed
            if (strokeCount >= 2 && 
                this.autoFormulaStartTime !== null &&
                timeSinceStart > 2000) {
                console.log(`✅ Triggering auto-formula due to scroll`);
                this.triggerAutoFormula('scroll');
            } else {
                console.log(`❌ Not triggering scroll: strokeCount=${strokeCount} (need ≥2), timeSinceStart=${timeSinceStart}ms (need >2000ms)`);
            }
        }
    }

    async triggerAutoFormula(reason) {
        if (!this.autoFormulaEnabled || this.autoFormulaStartTime === null) return;

        const strokeCount = this.autoFormulaStrokeIds.size;
        const timeSinceStart = Date.now() - this.autoFormulaStartTime;
        const timeSinceLastStroke = this.lastStrokeTime ? (Date.now() - this.lastStrokeTime) : 'N/A';
        
        console.log(`🚀 Auto formula triggered by: ${reason}`);
        console.log(`📊 Stats: ${strokeCount} strokes, ${timeSinceStart}ms since start, ${timeSinceLastStroke}ms since last stroke`);
        
        // Find strokes created since the start time using our separate tracking
        const strokesToConvert = this.drawnObjects.filter(obj => 
            this.autoFormulaStrokeIds.has(obj.id)
        );

        console.log(`🎯 Found ${strokesToConvert.length} strokes to convert`);

        if (strokesToConvert.length === 0) {
            console.log(`❌ No strokes to convert, resetting tracking`);
            this.resetAutoFormulaTracking();
            return;
        }

        // Clear the timeout to prevent duplicate triggers
        this.clearAutoFormulaTimeout();

        // Store current user selection to restore it later
        const userSelection = new Set(this.selectedIds);

        // Temporarily select the strokes for conversion (quietly in background)
        this.selectedIds.clear();
        strokesToConvert.forEach(obj => this.selectedIds.add(obj.id));

        // Trigger LaTeX conversion
        if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
            try {
                await window.LatexRenderer.convertToLatex();
                
                // Auto-add to canvas if conversion was successful
                setTimeout(() => {
                    if (window.LatexRenderer.lastLatexResult && 
                        window.LatexRenderer.lastLatexResult.trim() &&
                        window.LatexRenderer.elements.addLatexBtn.style.display !== 'none') {
                        window.LatexRenderer.addLatexToCanvas();
                    }
                    
                    // Restore user's original selection
                    this.selectedIds.clear();
                    userSelection.forEach(id => this.selectedIds.add(id));
                    this.redrawAll(); // Refresh display with restored selection
                }, 100);
            } catch (error) {
                console.error('Auto formula conversion failed:', error);
                // Restore user selection even on error
                this.selectedIds.clear();
                userSelection.forEach(id => this.selectedIds.add(id));
                this.redrawAll();
            }
        }

        // Reset tracking for next formula
        this.resetAutoFormulaTracking();
    }
}

// Export to global scope
window.DrawingEngine = DrawingEngine;