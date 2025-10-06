/* ==========================================================================
   Notes App v2.1 - Main Application
   ========================================================================== */

class NotesApp {
    constructor() {
        this.drawingEngine = null;
        this.toolbarManager = null;
        this.historyManager = null;
        this.sidebarManager = null;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    /* ==========================================================================
       Application Initialization
       ========================================================================== */
    initialize() {
        console.log('Initializing Notes App v' + window.NotesApp.VERSION);
        
        // Initialize core components
        this.initializeComponents();
        this.setupCanvases();
        this.setupEventHandlers();
        this.setupSidebar();
        this.loadAutosave();
        
        console.log('Notes App initialized successfully');
    }

    initializeComponents() {
        // Initialize drawing engine
        this.drawingEngine = new DrawingEngine();
        
        // Initialize toolbar manager
        this.toolbarManager = new ToolbarManager();
        
        // Initialize history manager
        this.historyManager = new HistoryManager();
        this.historyManager.getCurrentState = () => this.drawingEngine.getState();
        
        // Store references globally for module communication
        window.app = this;
        window.toolbarManager = this.toolbarManager;
    }

    setupCanvases() {
        const canvas = document.getElementById('drawing-canvas');
        const previewCanvas = document.getElementById('preview-canvas');
        const canvasContainer = document.querySelector('.canvas-container');
        
        this.drawingEngine.initializeCanvases(canvas, previewCanvas, canvasContainer);
        
        // Setup resize observer
        window.addEventListener('resize', () => {
            this.drawingEngine.resizeCanvases();
        });
    }

    setupEventHandlers() {
        this.setupPointerEvents();
        this.setupGestureEvents();
        this.setupScrollMonitoring();
    }

    setupPointerEvents() {
        const previewCanvas = this.drawingEngine.previewCanvas;
        
        previewCanvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        previewCanvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        previewCanvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        previewCanvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        previewCanvas.addEventListener('pointerleave', (e) => this.handlePointerUp(e));
    }

    setupGestureEvents() {
        // Touch pinch zoom could be implemented here if needed
        // For now, relying on basic pointer events and keyboard shortcuts
    }

    setupScrollMonitoring() {
        // Monitor scroll changes for auto-formula detection
        window.addEventListener('scroll', () => {
            this.drawingEngine.onScrollChanged();
        });
    }

    /* ==========================================================================
       Pointer Event Handling
       ========================================================================== */
    handlePointerDown(e) {
        if (e.target.closest('.toolbar')) return;
        
        const de = this.drawingEngine;
        const coords = de.getCanvasCoords(e);
        
        de.previewCanvas.setPointerCapture(e.pointerId);
        de.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Handle multi-touch pinch
        if (de.pointers.size === 2) {
            this.startPinchGesture();
            return;
        }

        // Handle stylus eraser
        if (e.pointerType === 'pen' && e.buttons === 2) {
            this.startErasing(coords, e);
            return;
        }

        // Handle touch panning
        if (e.pointerType === 'touch') {
            this.startPanning(e);
            return;
        }

        // Handle tool-specific actions
        const tool = this.toolbarManager.getCurrentTool();
        
        if (tool === 'hand') {
            this.startPanning(e);
        } else if (tool === 'select') {
            this.handleSelectTool(coords, e);
        } else {
            this.startDrawing(coords, e, tool);
        }
    }

    handlePointerMove(e) {
        const de = this.drawingEngine;
        
        // Handle pinch zoom
        if (de.isPinching && de.pointers.has(e.pointerId)) {
            de.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (de.pointers.size === 2) {
                this.updatePinchZoom();
            }
            return;
        }

        // Handle panning
        if (de.isPanning) {
            this.updatePanning(e);
            return;
        }

        // Handle selection operations
        if (de.selectionDrag) {
            this.updateSelection(e);
            return;
        }

        // Handle drawing
        if (de.isDrawing) {
            this.updateDrawing(e);
        }
    }

    handlePointerUp(e) {
        const de = this.drawingEngine;
        
        de.previewCanvas.releasePointerCapture(e.pointerId);
        de.pointers.delete(e.pointerId);

        if (de.isPinching && de.pointers.size < 2) {
            de.isPinching = false;
        }

        if (de.isDrawing) {
            this.finishDrawing(e);
        }

        if (de.selectionDrag) {
            this.finishSelection();
        }

        // Reset states
        de.isPanning = false;
        de.isDrawing = false;
        de.isErasing = false;
        de.currentPath = null;
        de.selectionDrag = null;
        
        de.redrawAll();
    }

    /* ==========================================================================
       Drawing Operations
       ========================================================================== */
    startDrawing(coords, e, tool) {
        const de = this.drawingEngine;
        de.isDrawing = true;
        de.shapeStartX = coords.x;
        de.shapeStartY = coords.y;

        if (tool === 'pen' || tool === 'eraser') {
            const color = tool === 'eraser' ? '#FFFFFF' : this.toolbarManager.getColorValue();
            const size = tool === 'eraser' ? 30 : this.toolbarManager.getBrushSize();
            const pressure = tool === 'eraser' ? 1 : (e.pressure > 0 ? e.pressure : 0.5);

            de.currentPath = de.addObject({
                type: 'path',
                points: [{ ...coords, pressure }],
                color,
                size
            });
        }
    }

    startErasing(coords, e) {
        const de = this.drawingEngine;
        de.isDrawing = true;
        de.isErasing = true;

        de.currentPath = de.addObject({
            type: 'path',
            points: [{ ...coords, pressure: 1 }],
            color: '#FFFFFF',
            size: 30
        });
    }

    updateDrawing(e) {
        const de = this.drawingEngine;
        const coords = de.getCanvasCoords(e);
        const tool = this.toolbarManager.getCurrentTool();

        if ((tool === 'pen' || tool === 'eraser' || de.isErasing) && de.currentPath) {
            const pressure = (de.isErasing || tool === 'eraser') ? 1 : (e.pressure > 0 ? e.pressure : 0.5);
            de.currentPath.points.push({ ...coords, pressure });
            de.redrawAll();
        } else if (['line', 'circle', 'rect'].includes(tool)) {
            this.drawShapePreview(coords, tool);
        }
    }

    drawShapePreview(coords, tool) {
        const de = this.drawingEngine;
        const ctx = de.previewCtx;
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, de.previewCanvas.width, de.previewCanvas.height);
        ctx.save();
        
        ctx.strokeStyle = this.toolbarManager.getColorValue();
        ctx.lineWidth = Math.max(1, this.toolbarManager.getBrushSize() * de.viewScale);
        
        const x1 = (de.shapeStartX - de.viewOffsetX) * de.viewScale;
        const y1 = (de.shapeStartY - de.viewOffsetY) * de.viewScale;
        const x2 = (coords.x - de.viewOffsetX) * de.viewScale;
        const y2 = (coords.y - de.viewOffsetY) * de.viewScale;

        ctx.beginPath();
        if (tool === 'line') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        } else if (tool === 'circle') {
            const r = Math.hypot(x2 - x1, y2 - y1);
            ctx.arc(x1, y1, r, 0, Math.PI * 2);
        } else if (tool === 'rect') {
            ctx.rect(x1, y1, x2 - x1, y2 - y1);
        }
        ctx.stroke();
        ctx.restore();
    }

    finishDrawing(e) {
        const de = this.drawingEngine;
        const tool = this.toolbarManager.getCurrentTool();

        if (!de.isErasing && tool !== 'pen' && tool !== 'eraser') {
            const coords = de.getCanvasCoords(e);
            de.addObject({
                type: tool,
                startX: de.shapeStartX,
                startY: de.shapeStartY,
                endX: coords.x,
                endY: coords.y,
                color: this.toolbarManager.getColorValue(),
                size: this.toolbarManager.getBrushSize()
            });

            // Clear preview
            de.previewCtx.setTransform(1, 0, 0, 1, 0, 0);
            de.previewCtx.clearRect(0, 0, de.previewCanvas.width, de.previewCanvas.height);
        }

        if (de.currentPath || (['line', 'circle', 'rect'].includes(tool))) {
            this.historyManager.pushHistory(de.getState());
        }
    }

    /* ==========================================================================
       Pan and Zoom Operations
       ========================================================================== */
    startPanning(e) {
        const de = this.drawingEngine;
        de.isPanning = true;
        de.panStartX = e.clientX;
        de.panStartY = e.clientY;
    }

    updatePanning(e) {
        const de = this.drawingEngine;
        const dx = (e.clientX - de.panStartX) / de.viewScale;
        const dy = (e.clientY - de.panStartY) / de.viewScale;
        
        de.viewOffsetX -= dx;
        de.viewOffsetY -= dy;
        
        // Constrain panning
        de.viewOffsetX = Math.max(0, Math.min(de.viewOffsetX, 
            Math.max(0, de.canvas.width - de.previewCanvas.width / de.viewScale)));
        de.viewOffsetY = Math.max(0, Math.min(de.viewOffsetY, 
            Math.max(0, de.canvas.height - de.previewCanvas.height / de.viewScale)));

        // Auto-add page when near bottom
        const nearBottom = de.viewOffsetY + (de.previewCanvas.height / de.viewScale) > de.canvas.height - 50;
        if (nearBottom) {
            const now = performance.now();
            if ((now - de.lastAutoAddTime) > window.NotesApp.AUTO_ADD_COOLDOWN && 
                (de.canvas.height - de.lastAutoAddHeight) >= de.PAGE_HEIGHT) {
                this.addPage();
                de.lastAutoAddHeight = de.canvas.height;
                de.lastAutoAddTime = now;
            }
        }

        de.panStartX = e.clientX;
        de.panStartY = e.clientY;
        de.redrawAll();
    }

    startPinchGesture() {
        const de = this.drawingEngine;
        const pts = Array.from(de.pointers.values());
        de.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        de.pinchStartScale = de.viewScale;
        de.pinchCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        de.isPinching = true;
        de.isPanning = false;
        de.isDrawing = false;
        de.selectionDrag = null;
        de.marqueeRect = null;
    }

    updatePinchZoom() {
        const de = this.drawingEngine;
        const pts = Array.from(de.pointers.values());
        const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const s = de.pinchStartScale * (d / (de.pinchStartDist || 1));
        de.setZoom(s, de.pinchCenter.x, de.pinchCenter.y);
    }

    /* ==========================================================================
       Selection Operations
       ========================================================================== */
    handleSelectTool(coords, e) {
        const de = this.drawingEngine;
        const screen = de.worldToScreen(coords);
        const handle = de.hitTestSelectionHandles(screen.x, screen.y);

        if (handle) {
            this.startTransformation(handle, coords);
        } else {
            const hit = [...de.drawnObjects].reverse().find(o => 
                GeometryUtils.objectHitTest(o, coords));
            
            if (hit) {
                this.selectObject(hit, e.shiftKey);
                de.selectionDrag = { mode: 'move', start: coords, last: coords };
            } else {
                de.clearSelection();
                this.startMarqueeSelection(coords);
            }
        }
        de.redrawAll();
    }

    selectObject(obj, addToSelection = false) {
        const de = this.drawingEngine;
        if (addToSelection) {
            if (de.selectedIds.has(obj.id)) {
                de.selectedIds.delete(obj.id);
            } else {
                de.selectedIds.add(obj.id);
            }
        } else {
            de.selectedIds.clear();
            de.selectedIds.add(obj.id);
        }
        
        // Update toolbar selection state
        if (this.toolbarManager) {
            this.toolbarManager.updateSelectionState();
        }
    }

    startMarqueeSelection(coords) {
        const de = this.drawingEngine;
        de.marqueeRect = { x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y };
        de.selectionDrag = { mode: 'marquee', start: coords, last: coords };
    }

    startTransformation(handle, coords) {
        const de = this.drawingEngine;
        const selected = de.drawnObjects.filter(o => de.selectedIds.has(o.id));
        const transforms = new Map();
        
        selected.forEach(o => {
            GeometryUtils.ensureTransform(o);
            transforms.set(o.id, { ...o.transform });
        });

        let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        selected.forEach(o => {
            const b = GeometryUtils.getTransformedBounds(o);
            if (b.minX < bounds.minX) bounds.minX = b.minX;
            if (b.minY < bounds.minY) bounds.minY = b.minY;
            if (b.maxX > bounds.maxX) bounds.maxX = b.maxX;
            if (b.maxY > bounds.maxY) bounds.maxY = b.maxY;
        });

        de.selectionDrag = {
            mode: handle.type,
            start: coords,
            last: coords,
            initial: { transforms, bounds },
            axis: handle.axis || 'both'
        };
    }

    updateSelection(e) {
        const de = this.drawingEngine;
        const coords = de.getCanvasCoords(e);

        if (de.selectionDrag.mode === 'marquee') {
            this.updateMarqueeSelection(coords);
        } else if (de.selectionDrag.mode === 'move') {
            this.updateObjectMove(coords);
        } else if (de.selectionDrag.mode === 'rotate' || de.selectionDrag.mode === 'resize') {
            this.updateTransformation(coords);
        }

        de.redrawAll();
    }

    updateMarqueeSelection(coords) {
        const de = this.drawingEngine;
        de.marqueeRect.x2 = coords.x;
        de.marqueeRect.y2 = coords.y;
        
        de.selectedIds.clear();
        de.drawnObjects.forEach(o => {
            const b = GeometryUtils.getTransformedBounds(o);
            const x1 = Math.min(de.marqueeRect.x1, de.marqueeRect.x2);
            const x2 = Math.max(de.marqueeRect.x1, de.marqueeRect.x2);
            const y1 = Math.min(de.marqueeRect.y1, de.marqueeRect.y2);
            const y2 = Math.max(de.marqueeRect.y1, de.marqueeRect.y2);
            
            if (b.minX >= x1 && b.maxX <= x2 && b.minY >= y1 && b.maxY <= y2) {
                de.selectedIds.add(o.id);
            }
        });
        
        // Update toolbar selection state
        if (this.toolbarManager) {
            this.toolbarManager.updateSelectionState();
        }
    }

    updateObjectMove(coords) {
        const de = this.drawingEngine;
        const dx = coords.x - de.selectionDrag.last.x;
        const dy = coords.y - de.selectionDrag.last.y;
        
        de.drawnObjects.forEach(o => {
            if (de.selectedIds.has(o.id)) {
                GeometryUtils.ensureTransform(o);
                o.transform.tx += dx;
                o.transform.ty += dy;
            }
        });
        
        de.selectionDrag.last = coords;
    }

    updateTransformation(coords) {
        const de = this.drawingEngine;
        const sel = de.drawnObjects.filter(o => de.selectedIds.has(o.id));
        if (sel.length === 0) return;

        const gb = de.selectionDrag.initial.bounds;
        const cx = (gb.minX + gb.maxX) / 2;
        const cy = (gb.minY + gb.maxY) / 2;

        if (de.selectionDrag.mode === 'rotate') {
            const a0 = Math.atan2(de.selectionDrag.start.y - cy, de.selectionDrag.start.x - cx);
            const a1 = Math.atan2(coords.y - cy, coords.x - cx);
            const da = a1 - a0;
            
            sel.forEach(o => {
                GeometryUtils.ensureTransform(o);
                o.transform.rotation = de.selectionDrag.initial.transforms.get(o.id).rotation + da;
            });
        } else if (de.selectionDrag.mode === 'resize') {
            const sx = (coords.x - cx) / (de.selectionDrag.start.x - cx || 1);
            const sy = (coords.y - cy) / (de.selectionDrag.start.y - cy || 1);
            
            let scaleX = isFinite(sx) && Math.abs(sx) > 0.01 ? sx : 1;
            let scaleY = isFinite(sy) && Math.abs(sy) > 0.01 ? sy : 1;
            
            if (de.selectionDrag.axis === 'x') scaleY = 1;
            if (de.selectionDrag.axis === 'y') scaleX = 1;
            
            sel.forEach(o => {
                GeometryUtils.ensureTransform(o);
                const initial = de.selectionDrag.initial.transforms.get(o.id);
                o.transform.scaleX = initial.scaleX * scaleX;
                o.transform.scaleY = initial.scaleY * scaleY;
            });
        }
    }

    finishSelection() {
        const de = this.drawingEngine;
        if (de.selectionDrag.mode === 'marquee') {
            de.marqueeRect = null;
        }
        this.historyManager.pushHistory(de.getState());
    }

    /* ==========================================================================
       Public API Methods
       ========================================================================== */
    setCurrentTool(tool) {
        this.drawingEngine.currentTool = tool;
    }

    undo() {
        const state = this.historyManager.undo();
        if (state) {
            this.drawingEngine.setState(state);
            this.drawingEngine.redrawAll();
        }
    }

    redo() {
        const state = this.historyManager.redo();
        if (state) {
            this.drawingEngine.setState(state);
            this.drawingEngine.redrawAll();
        }
    }

    deleteSelected() {
        if (this.drawingEngine.removeSelectedObjects()) {
            this.historyManager.pushHistory(this.drawingEngine.getState());
            this.drawingEngine.redrawAll();
        }
    }

    addPage() {
        this.drawingEngine.addPage();
        this.drawingEngine.redrawAll();
        this.historyManager.pushHistory(this.drawingEngine.getState());
    }

    clearAll() {
        this.drawingEngine.clear();
        this.historyManager.pushHistory(this.drawingEngine.getState());
        this.drawingEngine.redrawAll();
    }

    async exportToJson() {
        const data = {
            version: 1,
            drawnObjects: this.drawingEngine.drawnObjects,
            canvas: {
                width: this.drawingEngine.canvas.width,
                height: this.drawingEngine.canvas.height,
                pageHeight: this.drawingEngine.PAGE_HEIGHT
            },
            nextId: this.drawingEngine.idGenerator.nextId
        };
        FileManager.exportToJson(data);
    }

    async importFromJson(file) {
        const data = await FileManager.importFromJson(file);
        
        this.drawingEngine.drawnObjects = data.drawnObjects || [];
        this.drawingEngine.canvas.width = (data.canvas && data.canvas.width) || this.drawingEngine.canvas.width;
        this.drawingEngine.canvas.height = (data.canvas && data.canvas.height) || this.drawingEngine.canvas.height;
        this.drawingEngine.PAGE_HEIGHT = (data.canvas && data.canvas.pageHeight) || this.drawingEngine.PAGE_HEIGHT || this.drawingEngine.previewCanvas.height;
        this.drawingEngine.idGenerator.setNext(data.nextId || (Math.max(0, ...this.drawingEngine.drawnObjects.map(o => o.id || 0)) + 1));
        
        this.drawingEngine.viewOffsetX = 0;
        this.drawingEngine.viewOffsetY = 0;
        this.drawingEngine.viewScale = 1;
        this.drawingEngine.updateZoomLabel();
        this.drawingEngine.selectedIds.clear();
        
        this.historyManager.pushHistory(this.drawingEngine.getState());
        this.drawingEngine.redrawAll();
    }

    /* ==========================================================================
       Sidebar Management
       ========================================================================== */
    setupSidebar() {
        const sidebar = document.getElementById('sidebar');
        const resizeHandle = document.getElementById('resizeHandle');
        const hideToggle = document.getElementById('hideToggle');
        const contentArea = document.querySelector('.content-area');
        
        let isResizing = false;
        let sidebarWidth = 30; // percentage

        const handleResize = (e) => {
            if (!isResizing) return;
            const containerWidth = contentArea.offsetWidth;
            const newWidth = containerWidth - e.clientX;
            const percentage = Math.max(15, Math.min(60, (newWidth / containerWidth) * 100));
            sidebarWidth = percentage;
            sidebar.style.width = percentage + '%';
        };

        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        };

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });

        hideToggle.addEventListener('click', () => {
            if (sidebar.classList.contains('hidden')) {
                sidebar.classList.remove('hidden');
                sidebar.style.width = sidebarWidth + '%';
                hideToggle.textContent = '◀';
                hideToggle.title = 'Hide sidebar';
            } else {
                sidebar.classList.add('hidden');
                hideToggle.textContent = '▶';
                hideToggle.title = 'Show sidebar';
            }
            this.drawingEngine.resizeCanvases();
        });
    }

    /* ==========================================================================
       Auto-save and State Persistence
       ========================================================================== */
    loadAutosave() {
        const state = this.historyManager.loadAutosave();
        if (state) {
            this.drawingEngine.setState(state);
            this.drawingEngine.redrawAll();
        }
        
        // Initial history snapshot
        setTimeout(() => {
            this.historyManager.pushHistory(this.drawingEngine.getState());
        }, 0);
    }
}

// Initialize the application
window.addEventListener('load', () => {
    window.app = new NotesApp();
});