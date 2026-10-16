/* ==========================================================================
   Notes App v2.1 - SVG Converter Module
   ========================================================================== */

class SvgConverter {
    constructor() {
        this.lastConversionMeta = {};
        this.lastSvgResult = '';
        this.lastConversionTime = 0;
        this.requestedTime = 0;

        this.elements = {
            aiStatus: document.getElementById('ai-svg-status'),
            svgOutput: document.getElementById('svg-output'),
            addSvgBtn: document.getElementById('addSvgToCanvasBtn')
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.elements.addSvgBtn) {
            this.elements.addSvgBtn.addEventListener('click', () => this.addSvgToCanvas());
        }
    }

    async convertToSvg() {
        if (!this.elements.aiStatus) return;

        console.log('SvgConverter.convertToSvg() called');

        this.elements.aiStatus.textContent = 'Preparing image...';
        if (this.elements.svgOutput) this.elements.svgOutput.textContent = '';
        if (this.elements.addSvgBtn) this.elements.addSvgBtn.style.display = 'none';
        this.lastConversionMeta = {};
        this.lastSvgResult = '';

        if (!window.NotesApp.GEMINI_API_KEY) {
            this.elements.aiStatus.textContent = 'Error: Gemini API Key is missing. Please set it in the settings menu.';
            return;
        }

        try {
            this.requestedTime = Date.now();
            const base64Image = this.captureCanvasImage();
            console.log('Captured image size (base64 length):', base64Image ? base64Image.length : 0);
            this.elements.aiStatus.textContent = 'Converting to SVG...';

            const prompt = `Convert the drawing in a clean image for lecture notes, a minimal SVG representation of the shapes only, recognizable text should be text not strokes. Return only the raw SVG markup (an <svg>...</svg> block). Do not include any explanations or additional text. Use stroke="black" and stroke-width values that approximate the original thickness. Preserve relative layout and scale so the SVG can be placed over the original bounding box.`;

            const svgText = await ApiManager.callGeminiApi(base64Image, prompt);
            console.log('Received response from ApiManager (length):', svgText ? svgText.length : 0);

            // Some APIs may wrap response; try to extract the first <svg ...>...</svg> block
            const svgMatch = svgText.match(/<svg[\s\S]*?<\/svg>/i);
            const svgResult = svgMatch ? svgMatch[0] : svgText;

            this.lastSvgResult = svgResult;
            console.log('Extracted SVG length:', this.lastSvgResult.length);
            if (this.elements.svgOutput) this.elements.svgOutput.textContent = svgResult;
            this.elements.aiStatus.textContent = 'Conversion complete.';

            if (svgResult.trim()) {
                if (this.elements.addSvgBtn) this.elements.addSvgBtn.style.display = 'block';
            }
        } catch (err) {
            console.error(err);
            this.elements.aiStatus.textContent = 'Error: ' + err.message;
        }
    }

    captureCanvasImage() {
        console.log('SvgConverter.captureCanvasImage()');
        // Reuse same capture behavior as LatexRenderer but simplified here
        const drawingEngine = window.app.drawingEngine;
        const temp = document.createElement('canvas');
        const tctx = temp.getContext('2d');

        const strokeSelection = this.tempStrokeSelection || null;
        let hasSelection = strokeSelection || drawingEngine.selectedIds.size > 0;

        // Fallback: If no manual selection, take all strokes since last conversion (max 1 min back)
        if (!hasSelection) {
            const now = Date.now();
            const oneMinuteAgo = now - 60000;
            const startTime = Math.max(this.lastConversionTime, oneMinuteAgo);

            const recentStrokes = drawingEngine.drawnObjects.filter(o =>
                o.timestamp && o.timestamp > startTime &&
                ['path', 'line', 'circle', 'rect'].includes(o.type)
            );

            if (recentStrokes.length > 0) {
                const recentIds = new Set(recentStrokes.map(o => o.id));
                hasSelection = true;
                this.tempSelectionIds = recentIds;
                console.log(`🕒 Using fallback selection for SVG: ${recentStrokes.length} recent strokes since ${new Date(startTime).toLocaleTimeString()}`);
            }
        }

        if (hasSelection) {
            let selected;
            let currentSelectionIds;

            if (strokeSelection) {
                selected = drawingEngine.drawnObjects.filter(o => strokeSelection.has(o.id));
                currentSelectionIds = strokeSelection;
            } else if (this.tempSelectionIds) {
                selected = drawingEngine.drawnObjects.filter(o => this.tempSelectionIds.has(o.id));
                currentSelectionIds = this.tempSelectionIds;
                delete this.tempSelectionIds;
            } else {
                selected = drawingEngine.drawnObjects.filter(o => drawingEngine.selectedIds.has(o.id));
                currentSelectionIds = new Set(drawingEngine.selectedIds);
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            selected.forEach(o => {
                const b = GeometryUtils.getTransformedBounds(o);
                if (b.minX < minX) minX = b.minX;
                if (b.minY < minY) minY = b.minY;
                if (b.maxX > maxX) maxX = b.maxX;
                if (b.maxY > maxY) maxY = b.maxY;
            });

            const padding = 20;
            const w = Math.max(1, Math.ceil(maxX - minX + padding * 2));
            const h = Math.max(1, Math.ceil(maxY - minY + padding * 2));
            temp.width = w;
            temp.height = h;
            tctx.fillStyle = '#fff';
            tctx.fillRect(0, 0, w, h);
            tctx.translate(-minX + padding, -minY + padding);
            selected.forEach(o => drawingEngine.drawObject(tctx, o));

            this.lastConversionMeta = {
                selection: currentSelectionIds,
                bounds: { minX, minY, maxX, maxY }
            };
        } else {
            temp.width = drawingEngine.previewCanvas.width;
            temp.height = drawingEngine.previewCanvas.height;
            const srcW = drawingEngine.previewCanvas.width / drawingEngine.viewScale;
            const srcH = drawingEngine.previewCanvas.height / drawingEngine.viewScale;
            tctx.drawImage(
                drawingEngine.canvas,
                drawingEngine.viewOffsetX,
                drawingEngine.viewOffsetY,
                srcW,
                srcH,
                0,
                0,
                temp.width,
                temp.height
            );
        }

        return temp.toDataURL('image/png').split(',')[1];
    }

    async addSvgToCanvas() {
        console.log('SvgConverter.addSvgToCanvas() called');
        const svgText = this.lastSvgResult;
        if (!svgText.trim() || !this.lastConversionMeta.bounds) return;

        const drawingEngine = window.app.drawingEngine;
        const bounds = this.lastConversionMeta.bounds;

        // Store SVG as dataUrl image for rendering on canvas
        const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);

        const raster = new Image(); raster.src = svgDataUrl;
        await raster.decode();
        const canvas = document.createElement('canvas'); canvas.width = Math.min(4096, raster.naturalWidth || 1024);
        canvas.height = Math.min(4096, raster.naturalHeight || 1024);
        canvas.getContext('2d').drawImage(raster, 0, 0, canvas.width, canvas.height);
        const newImageObj = {
            type: 'image',
            dataUrl: canvas.toDataURL('image/png'),
            startX: bounds.minX,
            startY: bounds.minY,
            endX: bounds.maxX,
            endY: bounds.maxY,
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1 }
        };

        const oldIds = this.lastConversionMeta.selection ? Array.from(this.lastConversionMeta.selection) : [];

        // Use atomic replacement
        drawingEngine.replaceObjects(oldIds, [newImageObj]);

        // Update timing and UI
        this.lastConversionTime = this.requestedTime;
        if (this.elements.addSvgBtn) this.elements.addSvgBtn.style.display = 'none';

        // Force immediate save for critical state change
        if (window.app.historyManager) {
            window.app.historyManager.scheduleAutosave(true);
        }
    }
}

// Expose globally
window.SvgConverter = new SvgConverter();
