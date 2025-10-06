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
        
        // A4 portrait dimensions at DPI that assumes screen width=A4 width
        //get the A4 width from browser width
        this.A4_WIDTH = window.innerWidth ;
        this.A4_HEIGHT = this.A4_WIDTH * 1.4142; // A4 height is sqrt(2) times width
        this.PAGE_HEIGHT = this.A4_HEIGHT;
        
        // Page margins and spacing
        this.PAGE_MARGIN = 5; // Margin around each page
        this.PAGE_SPACING = 5; // Space between pages
        this.CANVAS_WIDTH = this.A4_WIDTH + (2 * this.PAGE_MARGIN);
        
        // Background settings
        this.backgroundType = 'white'; // white, lines, squares, dots, image
        this.backgroundColor = '#f5f5f5'; // Grey background for margins
        this.patternColor = '#e8e8e8'; // Light grey for patterns
        
        // Timestamp tracking for drawing events
        this.lastTimestampTime = 0;
        this.timestampInterval = 5000; // 5 seconds
        
        // Auto formula recognition tracking
        this.autoFormulaEnabled = false;
        this.autoFormulaStartTime = null;
        this.lastStrokeTime = null; // Track time of last stroke for timeout calculation
        this.autoFormulaTimeout = null;
        this.autoFormulaIdleTime = 5000; // milli  seconds of idle time (increased)
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
    // Palm / pan detection
    this.panCandidate = null; // { pointerId, startX, startY }
    this.palmContactThreshold = 10; // px contact size considered a palm
    this.panStartMovementThreshold = 16; // px movement before starting pan for touch
    this.palmBlockedPointers = new Set(); // pointerIds considered palm contacts
        
        // Auto page add throttling
        this.lastAutoAddHeight = 0;
        this.lastAutoAddTime = 0;

    // Scribble-as-deleter thresholds (configurable)
    // Minimum/maximum pixel extents (width/height) of a stroke to be considered a scribble deleter
    this.scribbleMinExtent = 10;
    this.scribbleMaxExtent = 70;
    // Coverage thresholds: if stroke bounding box is covered by stroke points between these values (0-1)
    this.scribbleMinCoverage = 0.60;
    this.scribbleMaxCoverage = 1;

    // Flood-fill confirmation threshold (fraction of total canvas pixels).
    // If a fill would change more than this fraction, ask the user to confirm.
    this.floodFillConfirmFraction = 0.25; // 25% by default
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
        
        // Set up A4 portrait canvas with 2 initial pages and margins
        this.canvas.width = this.CANVAS_WIDTH;
        this.canvas.height = (this.A4_HEIGHT + this.PAGE_SPACING) * 2 + this.PAGE_MARGIN;
        
        this.resizeCanvases();
    }

    resizeCanvases() {
        // Force a reflow to ensure accurate measurements on mobile
        this.canvasContainer.style.display = 'none';
        this.canvasContainer.offsetHeight; // Trigger reflow
        this.canvasContainer.style.display = '';
        
        const { width, height } = this.canvasContainer.getBoundingClientRect();
        
        // On mobile, ensure we're using the full available space
        const actualWidth = Math.max(width, this.canvasContainer.clientWidth);
        const actualHeight = Math.max(height, this.canvasContainer.clientHeight);
        
        // Set canvas width to container width, but use A4 height for pages
        this.previewCanvas.width = actualWidth;
        this.previewCanvas.height = actualHeight;
        
        // Set canvas display size to match
        this.previewCanvas.style.width = actualWidth + 'px';
        this.previewCanvas.style.height = actualHeight + 'px';
        
        // Initialize main canvas with A4 dimensions including margins and start with 2 pages
        if (!this.canvas.width) {
            this.canvas.width = this.CANVAS_WIDTH;
            this.canvas.height = (this.A4_HEIGHT + this.PAGE_SPACING) * 2 + this.PAGE_MARGIN;
        }
        
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
        // Clear and setup main canvas with grey background
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply view transform
        this.ctx.setTransform(
            this.viewScale, 0, 0, this.viewScale,
            -this.viewOffsetX * this.viewScale,
            -this.viewOffsetY * this.viewScale
        );

        // Draw A4 pages with proper spacing and backgrounds
        this.drawPages();

        // Draw all objects
        this.drawnObjects.forEach(obj => this.drawObject(this.ctx, obj));

        // Draw overlay (selection, marquee, etc.)
        this.drawOverlay();
    }

    drawPages() {
        const totalCanvasHeight = this.canvas.height / this.viewScale + this.viewOffsetY;
        const numPages = Math.ceil((totalCanvasHeight - this.PAGE_MARGIN) / (this.A4_HEIGHT + this.PAGE_SPACING));
        
        for (let i = 0; i < numPages; i++) {
            const pageY = this.PAGE_MARGIN + i * (this.A4_HEIGHT + this.PAGE_SPACING);
            const pageX = this.PAGE_MARGIN;
            
            // Draw page shadow
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            this.ctx.fillRect(pageX + 3, pageY + 3, this.A4_WIDTH, this.A4_HEIGHT);
            
            // Draw page background
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(pageX, pageY, this.A4_WIDTH, this.A4_HEIGHT);
            
            // Draw page border
            this.ctx.strokeStyle = '#d0d0d0';
            this.ctx.lineWidth = 1 / this.viewScale;
            this.ctx.strokeRect(pageX, pageY, this.A4_WIDTH, this.A4_HEIGHT);
            
            // Draw background pattern if selected
            this.drawPageBackground(pageX, pageY, this.A4_WIDTH, this.A4_HEIGHT);
            
            this.ctx.restore();
        }
    }

    // Render all page backgrounds and objects into the provided 2D context
    renderAllToContext(ctx) {
        // Draw page background similar to redrawAll but without transforms
        ctx.save();
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const totalCanvasHeight = this.canvas.height;
        const numPages = Math.ceil((totalCanvasHeight - this.PAGE_MARGIN) / (this.A4_HEIGHT + this.PAGE_SPACING));
        for (let i = 0; i < numPages; i++) {
            const pageY = this.PAGE_MARGIN + i * (this.A4_HEIGHT + this.PAGE_SPACING);
            const pageX = this.PAGE_MARGIN;

            // Draw page shadow + background + border
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(pageX, pageY, this.A4_WIDTH, this.A4_HEIGHT);
            ctx.strokeStyle = '#d0d0d0';
            ctx.lineWidth = 1;
            ctx.strokeRect(pageX, pageY, this.A4_WIDTH, this.A4_HEIGHT);
            ctx.restore();
        }

        // Draw objects in world coordinates (no view transform)
        this.drawnObjects.forEach(obj => {
            this.drawObject(ctx, obj);
        });

        ctx.restore();
    }

    // Perform a flood fill at world coordinates x,y with fillColor (hex like '#rrggbb').
    // Adds an image object containing the filled area and returns the new object or null if nothing changed.
    floodFillAt(x, y, fillColor) {
        // Create offscreen canvas matching internal canvas size
        const w = this.canvas.width;
        const h = this.canvas.height;
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d');

        // Render current scene into offscreen
        this.renderAllToContext(ctx);

        // Convert world coords to pixel coords (they are the same since we rendered world)
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return null;

    // Determine which page the click is on and compute page bounds (world pixels)
    const relativeY = py - this.PAGE_MARGIN;
    if (relativeY < 0) return null;
    const pageSlot = this.A4_HEIGHT + this.PAGE_SPACING;
    const pageIndex = Math.floor(relativeY / pageSlot);
    const yInPage = relativeY % pageSlot;
    // Click in page spacing area => ignore
    if (yInPage > this.A4_HEIGHT) return null;

    const pageTop = this.PAGE_MARGIN + pageIndex * pageSlot;
    const pageLeft = this.PAGE_MARGIN;
    const pageRight = pageLeft + this.A4_WIDTH;
    const pageBottom = pageTop + this.A4_HEIGHT;

        const img = ctx.getImageData(0, 0, w, h);
        const data = img.data;

        // Helper to convert color
        function hexToRgba(hex) {
            let v = hex.replace('#','');
            if (v.length === 3) v = v.split('').map(c => c + c).join('');
            const r = parseInt(v.substring(0,2),16);
            const g = parseInt(v.substring(2,4),16);
            const b = parseInt(v.substring(4,6),16);
            return [r,g,b,255];
        }

        const fillRgba = hexToRgba(fillColor || '#000000');

        const idx = (py * w + px) * 4;
        const targetR = data[idx];
        const targetG = data[idx+1];
        const targetB = data[idx+2];
        const targetA = data[idx+3];

        // If target color equals fill color, nothing to do
        if (targetR === fillRgba[0] && targetG === fillRgba[1] && targetB === fillRgba[2] && targetA === fillRgba[3]) {
            return null;
        }

    // Scanline flood fill (confined to the page bounds)
        const w4 = w * 4;
        const visited = new Uint8Array(w * h);
        const stack = [];
        stack.push({x: px, y: py});

        let minX = w, minY = h, maxX = 0, maxY = 0;
        const colorMatch = (i) => data[i] === targetR && data[i+1] === targetG && data[i+2] === targetB && data[i+3] === targetA;

    let changedPixels = 0;
    let asked = false;
    const pagePixels = (pageRight - pageLeft + 1) * (pageBottom - pageTop + 1);
    const thresholdPixels = (this.floodFillConfirmFraction > 0) ? Math.floor(this.floodFillConfirmFraction * pagePixels) : Infinity;

    while (stack.length) {
            const p = stack.pop();
            let x0 = p.x;
            let y0 = p.y;
            let i0 = (y0 * w + x0);
            if (visited[i0]) continue;

            // move left (but don't cross pageLeft)
            let xL = x0;
            let idxL = (y0 * w + xL) * 4;
            while (xL >= pageLeft && !visited[y0 * w + xL] && colorMatch(idxL)) {
                xL--; idxL -= 4;
            }
            xL++;

            // move right and fill
            let xR = x0;
            let idxR = (y0 * w + xR) * 4;
            while (xR <= pageRight && !visited[y0 * w + xR] && colorMatch(idxR)) {
                // set pixel to fill color
                data[idxR] = fillRgba[0];
                data[idxR+1] = fillRgba[1];
                data[idxR+2] = fillRgba[2];
                data[idxR+3] = fillRgba[3];

                visited[y0 * w + xR] = 1;
                changedPixels++;

                // expand bounds
                if (xR < minX) minX = xR;
                if (xR > maxX) maxX = xR;
                if (y0 < minY) minY = y0;
                if (y0 > maxY) maxY = y0;

                xR++; idxR += 4;

                // If we've reached the confirmation threshold and haven't asked yet,
                // prompt the user to continue. If they cancel, abort (no reversion here)
                if (!asked && changedPixels >= thresholdPixels) {
                    const pct = Math.round(this.floodFillConfirmFraction * 100);
                    const proceed = confirm(`This operation has painted more than ${pct}% of the page so far. Continue?`);
                    if (!proceed) {
                        return null;
                    }
                    // user confirmed; stop asking further
                    asked = true;
                }
            }

            // check spans above and below (but don't cross pageTop/pageBottom)
            for (let xi = xL; xi < xR; xi++) {
                const above = y0 - 1;
                const below = y0 + 1;
                if (above >= pageTop) {
                    const ia = (above * w + xi) * 4;
                    if (!visited[above * w + xi] && colorMatch(ia)) stack.push({x: xi, y: above});
                }
                if (below <= pageBottom) {
                    const ib = (below * w + xi) * 4;
                    if (!visited[below * w + xi] && colorMatch(ib)) stack.push({x: xi, y: below});
                }
            }
        }

        if (minX > maxX || minY > maxY) return null;



        // Crop to bounding box and create dataURL
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');

        // Put the modified image data into a new ImageData for cropping
        const cropImg = cropCtx.createImageData(cropW, cropH);
        for (let row = 0; row < cropH; row++) {
            const srcStart = ((minY + row) * w + minX) * 4;
            const dstStart = row * cropW * 4;
            for (let k = 0; k < cropW * 4; k++) {
                cropImg.data[dstStart + k] = data[srcStart + k];
            }
        }
        cropCtx.putImageData(cropImg, 0, 0);

        const dataUrl = cropCanvas.toDataURL('image/png');

        // Add image object to drawnObjects
        const imgObj = {
            type: 'image',
            dataUrl: dataUrl,
            startX: minX,
            startY: minY,
            endX: maxX,
            endY: maxY,
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1 }
        };

        this.addObject(imgObj);
        return imgObj;
    }

    drawPageBackground(x, y, width, height) {
        if (this.backgroundType === 'white') {
            return; // Already drawn white background
        }
        
        this.ctx.save();
        this.ctx.strokeStyle = this.patternColor;
        this.ctx.lineWidth = 0.5 / this.viewScale;
        
        if (this.backgroundType === 'lines') {
            // Draw horizontal lines every 25px
            for (let lineY = y + 25; lineY < y + height; lineY += 25) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, lineY);
                this.ctx.lineTo(x + width, lineY);
                this.ctx.stroke();
            }
        } else if (this.backgroundType === 'squares') {
            // Draw grid squares every 25px
            for (let lineY = y; lineY <= y + height; lineY += 25) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, lineY);
                this.ctx.lineTo(x + width, lineY);
                this.ctx.stroke();
            }
            for (let lineX = x; lineX <= x + width; lineX += 25) {
                this.ctx.beginPath();
                this.ctx.moveTo(lineX, y);
                this.ctx.lineTo(lineX, y + height);
                this.ctx.stroke();
            }
        } else if (this.backgroundType === 'dots') {
            // Draw dots every 25px
            this.ctx.fillStyle = this.patternColor;
            for (let dotY = y + 25; dotY < y + height; dotY += 25) {
                for (let dotX = x + 25; dotX < x + width; dotX += 25) {
                    this.ctx.beginPath();
                    this.ctx.arc(dotX, dotY, 1 / this.viewScale, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            }
        }
        
        this.ctx.restore();
    }

    /* ==========================================================================
       Zoom and Pan
       ========================================================================== */
    setZoom(newScale, anchorScreenX = this.previewCanvas.width / 2, anchorScreenY = this.previewCanvas.height / 2) {
        // Respect global zoom lock if set
        if (window.NotesApp && window.NotesApp.zoomLocked) {
            // Ignore zoom requests when locked
            console.debug('Zoom change blocked: zoomLocked is true');
            return;
        }
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

    // Fit the A4 page width to the preview canvas width and center the view
    fitWidthCenter(padding = 24) {
        // If zoom is locked, skip fit operation
        if (window.NotesApp && window.NotesApp.zoomLocked) {
            console.debug('fitWidthCenter blocked: zoomLocked is true');
            return;
        }
        if (!this.previewCanvas) return;

        // Use the preview canvas displayed size (CSS pixels) for layout
        const rect = this.previewCanvas.getBoundingClientRect();
        const previewWidth = rect.width;
        const previewHeight = rect.height;
        const availablePx = Math.max(100, previewWidth - padding * 2);

        // target world width is the A4 page width
        const targetWorldWidth = this.A4_WIDTH;

        let desiredScale = availablePx / targetWorldWidth;
        desiredScale = Math.max(window.NotesApp.MIN_ZOOM, Math.min(window.NotesApp.MAX_ZOOM, desiredScale));

        // Compute world center of the first page (page 0)
        const worldCenterX = this.PAGE_MARGIN + this.A4_WIDTH / 2;
        const worldCenterY = this.PAGE_MARGIN + this.A4_HEIGHT / 2;

        // Compute screen center in canvas internal pixels
        const cssRect = this.previewCanvas.getBoundingClientRect();
        const scaleX = this.previewCanvas.width / cssRect.width;
        const scaleY = this.previewCanvas.height / cssRect.height;
        const screenCenterX_px = (previewWidth / 2) * scaleX;
        const screenCenterY_px = (previewHeight / 2) * scaleY;

        // Set the scale and compute offsets so the world center of the first page
        // is positioned at the screen center (in canvas internal pixels)
        this.viewScale = desiredScale;

        // worldCenter should map to screenCenter: screenCenter_px / viewScale + viewOffset = worldCenter
        this.viewOffsetX = worldCenterX - (screenCenterX_px / this.viewScale);
        this.viewOffsetY = worldCenterY - (screenCenterY_px / this.viewScale);

        // Constrain panning to valid ranges (same logic as in updatePanning)
        this.viewOffsetX = Math.max(0, Math.min(this.viewOffsetX,
            Math.max(0, this.canvas.width - this.previewCanvas.width / this.viewScale)));
        this.viewOffsetY = Math.max(0, Math.min(this.viewOffsetY,
            Math.max(0, this.canvas.height - this.previewCanvas.height / this.viewScale)));

        this.updateZoomLabel();
        this.redrawAll();
    }

    // Fit the A4 page width to the preview canvas width and center ONLY horizontally.
    // This preserves the current vertical offset (does not scroll to vertical center).
    fitWidthCenterHorizontal(padding = 24) {
        // If zoom is locked, skip fit operation
        if (window.NotesApp && window.NotesApp.zoomLocked) {
            console.debug('fitWidthCenterHorizontal blocked: zoomLocked is true');
            return;
        }
        if (!this.previewCanvas) return;

        // Use the preview canvas displayed size (CSS pixels) for layout
        const rect = this.previewCanvas.getBoundingClientRect();
        const previewWidth = rect.width;
        const previewHeight = rect.height;
        const availablePx = Math.max(100, previewWidth - padding * 2);

        // target world width is the A4 page width
        const targetWorldWidth = this.A4_WIDTH;

        let desiredScale = availablePx / targetWorldWidth;
        desiredScale = Math.max(window.NotesApp.MIN_ZOOM, Math.min(window.NotesApp.MAX_ZOOM, desiredScale));

        // Compute world center X of the first page (page 0)
        const worldCenterX = this.PAGE_MARGIN + this.A4_WIDTH / 2;

        // Compute screen center in canvas internal pixels
        const cssRect = this.previewCanvas.getBoundingClientRect();
        const scaleX = this.previewCanvas.width / cssRect.width;
        const screenCenterX_px = (previewWidth / 2) * scaleX;

        // Preserve current vertical offset; only change horizontal offset and scale
        const previousViewScale = this.viewScale;
        const previousViewOffsetY = this.viewOffsetY;

        this.viewScale = desiredScale;

        // worldCenterX should map to screenCenter: screenCenter_px / viewScale + viewOffsetX = worldCenterX
        this.viewOffsetX = worldCenterX - (screenCenterX_px / this.viewScale);

        // Keep the previous vertical offset but clamp to valid ranges
        this.viewOffsetY = previousViewOffsetY;

        // Constrain panning to valid ranges (same logic as in updatePanning)
        this.viewOffsetX = Math.max(0, Math.min(this.viewOffsetX,
            Math.max(0, this.canvas.width - this.previewCanvas.width / this.viewScale)));
        this.viewOffsetY = Math.max(0, Math.min(this.viewOffsetY,
            Math.max(0, this.canvas.height - this.previewCanvas.height / this.viewScale)));

        this.updateZoomLabel();
        this.redrawAll();
    }

    /* ==========================================================================
       Page Management
       ========================================================================== */
    addPage() {
        this.canvas.height += this.A4_HEIGHT + this.PAGE_SPACING;
        this.redrawAll();
    }

    /* ==========================================================================
       Page Boundary Utilities
       ========================================================================== */
    isWithinPageBounds(x, y) {
        // Check if coordinates are within any page bounds
        const pageX = this.PAGE_MARGIN;
        const pageRight = this.PAGE_MARGIN + this.A4_WIDTH;
        
        if (x < pageX || x > pageRight) {
            return false;
        }
        
        // Check which page this Y coordinate belongs to
        const relativeY = y - this.PAGE_MARGIN;
        if (relativeY < 0) return false;
        
        const pageIndex = Math.floor(relativeY / (this.A4_HEIGHT + this.PAGE_SPACING));
        const yInPage = relativeY % (this.A4_HEIGHT + this.PAGE_SPACING);
        
        // Return true if Y is within page bounds (not in spacing area)
        return yInPage <= this.A4_HEIGHT;
    }

    constrainToPageBounds(x, y) {
        // Constrain coordinates to nearest page bounds
        const pageX = this.PAGE_MARGIN;
        const pageRight = this.PAGE_MARGIN + this.A4_WIDTH;
        
        // Constrain X to page width
        x = Math.max(pageX, Math.min(pageRight, x));
        
        // Constrain Y to page bounds
        const relativeY = y - this.PAGE_MARGIN;
        if (relativeY < 0) {
            return { x, y: this.PAGE_MARGIN };
        }
        
        const pageIndex = Math.floor(relativeY / (this.A4_HEIGHT + this.PAGE_SPACING));
        const yInPage = relativeY % (this.A4_HEIGHT + this.PAGE_SPACING);
        
        if (yInPage > this.A4_HEIGHT) {
            // In spacing area, snap to bottom of current page or top of next page
            const currentPageBottom = this.PAGE_MARGIN + pageIndex * (this.A4_HEIGHT + this.PAGE_SPACING) + this.A4_HEIGHT;
            const nextPageTop = this.PAGE_MARGIN + (pageIndex + 1) * (this.A4_HEIGHT + this.PAGE_SPACING);
            
            // Choose closer boundary
            if (y - currentPageBottom < nextPageTop - y) {
                y = currentPageBottom;
            } else {
                y = nextPageTop;
            }
        }
        
        return { x, y };
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
            
            // Check for new line BEFORE adding current stroke to tracking
            const shouldTriggerNewLine = this.shouldTriggerNewLine(strokeY);
            
            if (shouldTriggerNewLine) {
                // Trigger with current strokes (excluding this new line stroke)
                console.log(`📏 New line detected! Triggering before adding current stroke`);
                this.triggerAutoFormula('new_line');
                // After trigger, tracking is reset and we'll add the current stroke to fresh tracking
            }
            
            // Add to auto-formula tracking (separate from visible selection)
            if (this.autoFormulaEnabled) {
                this.autoFormulaStrokeIds.add(obj.id);
                console.log(`➕ Added stroke ${obj.id} (${obj.type}) to auto-formula tracking`);
            }
            
            this.onStrokeAdded(strokeY, shouldTriggerNewLine);
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

    // Delete one or more stroke objects by id
    removeObjectsById(ids) {
        const idSet = new Set(ids);
        const beforeLen = this.drawnObjects.length;
        this.drawnObjects = this.drawnObjects.filter(o => !idSet.has(o.id));
        const removed = beforeLen !== this.drawnObjects.length;
        // Also clear from selection and auto-formula tracking
        ids.forEach(id => {
            this.selectedIds.delete(id);
            this.autoFormulaStrokeIds.delete(id);
        });
        return removed;
    }

    // Return list of stroke object ids that intersect a given world-space point
    strokeIdsTouchingPoint(x, y, tolerance = 6) {
        const hits = [];
        this.drawnObjects.forEach(o => {
            if (!['path', 'line', 'rect', 'circle'].includes(o.type)) return;
            if (GeometryUtils.objectHitTest(o, { x, y }, tolerance)) {
                hits.push(o.id);
            }
        });
        return hits;
    }

    // Given a path (array of points), return stroke ids that intersect any segment of the path
    strokeIdsTouchingPath(pathPoints, tolerance = 6) {
        const hits = new Set();
        if (!Array.isArray(pathPoints) || pathPoints.length < 2) return [];

        // For performance, compute bounding box of path and only test objects overlapping it
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pathPoints.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });

        this.drawnObjects.forEach(o => {
            if (!['path', 'line', 'rect', 'circle'].includes(o.type)) return;
            const b = GeometryUtils.getTransformedBounds(o);
            if (b.maxX < minX - tolerance || b.minX > maxX + tolerance || b.maxY < minY - tolerance || b.minY > maxY + tolerance) {
                return;
            }

            // Test each point on the path by hit-testing against object
            for (let i = 0; i < pathPoints.length; i++) {
                const p = pathPoints[i];
                if (GeometryUtils.objectHitTest(o, { x: p.x, y: p.y }, tolerance)) {
                    hits.add(o.id);
                    break;
                }
            }
        });

        return Array.from(hits);
    }

    // Estimate how much of the bounding box of a path object is covered by the path itself.
    // We sample a grid of points inside the bounds and count how many are within the path stroke.
    // Returns a fraction between 0 and 1.
    estimatePathCoverage(pathObj, sampleResolution = 18) {
        if (!pathObj || pathObj.type !== 'path' || !Array.isArray(pathObj.points) || pathObj.points.length < 2) return 0;

    const b = GeometryUtils.objectBounds(pathObj);
        const width = b.maxX - b.minX;
        const height = b.maxY - b.minY;
        if (width <= 0 || height <= 0) return 0;

        // Adjust resolution based on bbox size to keep samples reasonable
        const cols = Math.max(6, Math.min(sampleResolution, Math.round(width / 4)));
        const rows = Math.max(6, Math.min(sampleResolution, Math.round(height / 4)));

        let hits = 0;
        let total = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const sx = b.minX + (c + 0.5) * (width / cols);
                const sy = b.minY + (r + 0.5) * (height / rows);
                total++;
                if (GeometryUtils.objectHitTest(pathObj, { x: sx, y: sy }, Math.max(2, pathObj.size / 2))) {
                    hits++;
                }
            }
        }

        return total > 0 ? hits / total : 0;
    }

    // Heuristic to decide whether a path stroke should act as a scribble-deleter
    isScribbleDeleterCandidate(pathObj) {
        if (!pathObj || pathObj.type !== 'path' || !Array.isArray(pathObj.points) || pathObj.points.length < 2) return false;

    const b = GeometryUtils.objectBounds(pathObj);
        const width = b.maxX - b.minX;
        const height = b.maxY - b.minY;

        // Check extents
        if (width < this.scribbleMinExtent || height < this.scribbleMinExtent) return false;
        if (width > this.scribbleMaxExtent || height > this.scribbleMaxExtent) return false;

        // Estimate coverage
        const coverage = this.estimatePathCoverage(pathObj);
        if (!(coverage >= this.scribbleMinCoverage && coverage <= this.scribbleMaxCoverage)) {
            return false;
        }
        // up down pattern
        // loop on the points and count direction changes as inversions of at least 150 degrees
        let inversions = 0;
        for (let i = 2; i < pathObj.points.length; i++) {
            const p0 = pathObj.points[i - 2];
            const p1 = pathObj.points[i - 1];
            const p2 = pathObj.points[i];
            const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
            const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.hypot(v1.x, v1.y);
            const mag2 = Math.hypot(v2.x, v2.y);
            if (mag1 > 0 && mag2 > 0) {
                const cosTheta = dot / (mag1 * mag2);
                if (cosTheta < -0.866) { // cos(150°) = -0.866
                    inversions++;
                }
            }
        }
        console.log(`Scribble deleter check: width=${width.toFixed(1)}, height=${height.toFixed(1)}, coverage=${(coverage*100).toFixed(1)}%, inversions=${inversions}`);
        if (inversions < 6) return false;
        return true;
    }

    selectAll() {
        this.selectedIds = new Set(this.drawnObjects.map(o => o.id));
    }

    clearSelection() {
        this.selectedIds.clear();
        
        // Update toolbar selection state
        if (window.app && window.app.toolbarManager) {
            window.app.toolbarManager.updateSelectionState();
        }
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
        this.canvas.width = state.canvasWidth || this.A4_WIDTH;
        this.canvas.height = state.canvasHeight || (this.A4_HEIGHT * 2);
        this.PAGE_HEIGHT = state.pageHeight || this.A4_HEIGHT;
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
        
        // Reset to A4 dimensions with 2 pages
        this.canvas.width = this.A4_WIDTH;
        this.canvas.height = this.A4_HEIGHT * 2;
        
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

    shouldTriggerNewLine(strokeY) {
        if (!this.autoFormulaEnabled || this.autoFormulaStartTime === null) return false;
        
        const strokeCount = this.autoFormulaStrokeIds.size;
        const timeSinceStart = Date.now() - this.autoFormulaStartTime;
        
        // Check for new line (significant Y position change) - be more conservative
        if (this.lastStrokeY !== null && strokeY > this.lastStrokeY + this.newLineThreshold) {
            // Only trigger if we have multiple strokes and enough time has passed
            if (strokeCount >= 3 && timeSinceStart > 3000) {
                console.log(`📏 New line check: Y change: ${this.lastStrokeY} → ${strokeY} (${strokeY - this.lastStrokeY}px) - TRIGGERING`);
                return true;
            } else {
                console.log(`📏 New line detected but not triggering: strokeCount=${strokeCount} (need ≥3), timeSinceStart=${timeSinceStart}ms (need >3000ms)`);
            }
        }
        return false;
    }

    onStrokeAdded(strokeY, alreadyTriggeredNewLine = false) {
        if (!this.autoFormulaEnabled) return;

        const now = Date.now();
        
        // Start tracking if this is the first stroke
        if (this.autoFormulaStartTime === null) {
            this.resetAutoFormulaTracking();
        }

        this.lastStrokeTime = now;
        const strokeCount = this.autoFormulaStrokeIds.size;
        const timeSinceStart = now - this.autoFormulaStartTime;
        
        console.log(`✏️ Stroke added at Y=${strokeY}, count=${strokeCount}, time since start=${timeSinceStart}ms${alreadyTriggeredNewLine ? ' (after new line trigger)' : ''}`);

        // Skip new line detection if we already triggered due to new line
        if (!alreadyTriggeredNewLine) {
            // Note: New line detection is now handled in addObject before stroke is added
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
        
        // Clear the timeout to prevent duplicate triggers
        this.clearAutoFormulaTimeout();
        
        // Capture strokes to convert BEFORE resetting (prevent new strokes from being included)
        const strokeIdsToConvert = new Set(this.autoFormulaStrokeIds);
        
        // Reset tracking IMMEDIATELY to prevent new strokes from being included
        this.resetAutoFormulaTracking();
        
        // Find strokes to convert using the captured IDs
        const strokesToConvert = this.drawnObjects.filter(obj => 
            strokeIdsToConvert.has(obj.id)
        );

        console.log(`🎯 Found ${strokesToConvert.length} strokes to convert`);

        if (strokesToConvert.length === 0) {
            console.log(`❌ No strokes to convert`);
            return;
        }

        // Trigger LaTeX conversion WITHOUT modifying selectedIds (avoid selection conflicts)
        if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
            try {
                // Temporarily store the stroke IDs for LaTeX renderer to use
                window.LatexRenderer.tempStrokeSelection = strokeIdsToConvert;
                
                await window.LatexRenderer.convertToLatex();
                
                // Auto-add to canvas if conversion was successful
                setTimeout(() => {
                    if (window.LatexRenderer.lastLatexResult && 
                        window.LatexRenderer.lastLatexResult.trim() &&
                        window.LatexRenderer.elements.addLatexBtn.style.display !== 'none') {
                        window.LatexRenderer.addLatexToCanvas();
                    }
                    
                    // Clean up temporary selection
                    delete window.LatexRenderer.tempStrokeSelection;
                }, 100);
            } catch (error) {
                console.error('Auto formula conversion failed:', error);
                // Clean up temporary selection even on error
                delete window.LatexRenderer.tempStrokeSelection;
            }
        }
    }
}

// Export to global scope
window.DrawingEngine = DrawingEngine;