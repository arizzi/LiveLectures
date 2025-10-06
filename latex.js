/* ==========================================================================
   Notes App v2.1 - LaTeX Converter Module
   ========================================================================== */

class LatexRenderer {
    constructor() {
        this.lastConversionMeta = {};
        this.lastLatexResult = '';
        
        this.elements = {
            aiStatus: document.getElementById('ai-status'),
            latexOutput: document.getElementById('latex-output'),
            addLatexBtn: document.getElementById('addLatexToCanvasBtn')
        };

        this.setupEventListeners();
        
        // Clean up any legacy LaTeX objects when the renderer is initialized
        setTimeout(() => {
            this.cleanupLegacyLatexObjects();
        }, 100);
    }

    /* ==========================================================================
       Event Listeners
       ========================================================================== */
    setupEventListeners() {
        this.elements.addLatexBtn.addEventListener('click', () => {
            this.addLatexToCanvas();
        });
    }

    /* ==========================================================================
       LaTeX Conversion
       ========================================================================== */
    async convertToLatex() {
        this.elements.aiStatus.textContent = 'Preparing image...';
        this.elements.latexOutput.innerHTML = '';
        this.elements.addLatexBtn.style.display = 'none';
        this.lastConversionMeta = {};
        this.lastLatexResult = '';

        if (!window.NotesApp.GEMINI_API_KEY) {
            this.elements.aiStatus.textContent = 'Error: Gemini API Key is missing. Please set it in the settings menu.';
            return;
        }

        try {
            const base64Image = this.captureCanvasImage();
            this.elements.aiStatus.textContent = 'Converting...';

            const prompt = "Transcribe the handwritten mathematical notes in this image into a single block of MathJax LaTeX. Do not include any explanations, just the raw MathJax code. Ensure it is properly formatted with block delimiters like $$...$$ or \\begin{align*}...\\end{align*} if appropriate.";
            
            const latexText = await ApiManager.callGeminiApi(base64Image, prompt);
            
            this.lastLatexResult = latexText;
            this.elements.latexOutput.textContent = latexText;
            
            await MathJax.typesetPromise();
            this.elements.aiStatus.textContent = 'Conversion complete.';
            
            if (latexText.trim()) {
                this.elements.addLatexBtn.style.display = 'block';
            }
        } catch (err) {
            console.error(err);
            this.elements.aiStatus.textContent = 'Error: ' + err.message;
        }
    }

    /* ==========================================================================
       Image Capture
       ========================================================================== */
    captureCanvasImage() {
        const drawingEngine = window.app.drawingEngine;
        const temp = document.createElement('canvas');
        const tctx = temp.getContext('2d');

        // Check if we have temporary stroke selection from auto-formula (takes priority)
        const strokeSelection = this.tempStrokeSelection || null;
        const hasSelection = strokeSelection || drawingEngine.selectedIds.size > 0;
        
        if (hasSelection) {
            // Capture selected objects only
            let selected;
            if (strokeSelection) {
                // Use temporary auto-formula selection
                selected = drawingEngine.drawnObjects.filter(o => strokeSelection.has(o.id));
                console.log(`🎯 Using auto-formula stroke selection: ${strokeSelection.size} strokes`);
            } else {
                // Use regular user selection
                selected = drawingEngine.drawnObjects.filter(o => drawingEngine.selectedIds.has(o.id));
                console.log(`🎯 Using user selection: ${drawingEngine.selectedIds.size} objects`);
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
            const w = maxX - minX + padding * 2;
            const h = maxY - minY + padding * 2;
            
            temp.width = w;
            temp.height = h;
            tctx.fillStyle = '#fff';
            tctx.fillRect(0, 0, w, h);
            tctx.translate(-minX + padding, -minY + padding);
            
            selected.forEach(o => drawingEngine.drawObject(tctx, o));
            
            this.lastConversionMeta = {
                selection: strokeSelection ? strokeSelection : new Set(drawingEngine.selectedIds),
                bounds: { minX, minY, maxX, maxY }
            };
        } else {
            // Capture current viewport
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

    /* ==========================================================================
       LaTeX Object Rendering
       ========================================================================== */
    renderLatexObject(obj) {
        if (obj.isRendering) return;
        
        const latexText = obj.latex.trim()
            .replace(/^\$\$|\$\$$/g, '')
            .replace(/^\\\[|\\\]$/g, '');
            
        if (!latexText) return;

        // If already rendered and cached, no need to re-render
        if (obj.renderedSvg) return;

        obj.isRendering = true;

        MathJax.startup.promise.then(() => {
            try {
                const node = MathJax.tex2svg(latexText, { display: true });
                const svgNode = node.querySelector('svg');
                
                if (!svgNode) {
                    obj.isRendering = false;
                    return;
                }

                // Add MathJax definitions if they exist
                const mjxDefs = MathJax.startup.output.svg.defs;
                if (mjxDefs) {
                    svgNode.prepend(mjxDefs.cloneNode(true));
                }

                // Ensure paths have fill color
                svgNode.querySelectorAll('path').forEach(p => {
                    if (!p.getAttribute('fill')) {
                        p.setAttribute('fill', 'black');
                    }
                });

                // Store the SVG data for reuse
                const svgText = new XMLSerializer().serializeToString(svgNode);
                obj.renderedSvg = svgText;
                obj.svgWidth = parseFloat(svgNode.getAttribute('width')) || svgNode.viewBox?.baseVal?.width || 100;
                obj.svgHeight = parseFloat(svgNode.getAttribute('height')) || svgNode.viewBox?.baseVal?.height || 50;
                
                obj.isRendering = false;
                
                // Trigger redraw
                if (window.app && window.app.drawingEngine) {
                    window.app.drawingEngine.redrawAll();
                }
            } catch (e) {
                console.error('Error rendering LaTeX:', e);
                obj.isRendering = false;
            }
        });
    }

    // Method to draw a LaTeX object to a specific canvas context
    drawLatexObject(ctx, obj) {
        if (!obj.renderedSvg || obj.isRendering) {
            // If not rendered yet, trigger rendering and draw placeholder
            if (!obj.isRendering) {
                this.renderLatexObject(obj);
            }
            // Draw placeholder
            const bounds = GeometryUtils.objectBounds(obj);
            ctx.save();
            ctx.strokeStyle = '#ccc';
            ctx.fillStyle = '#f9f9f9';
            ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            ctx.fillStyle = '#666';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LaTeX', (bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
            ctx.restore();
            return;
        }

        const bounds = GeometryUtils.objectBounds(obj);
        const boundsWidth = bounds.maxX - bounds.minX;
        const boundsHeight = bounds.maxY - bounds.minY;
        
        // Calculate scale to fit within bounds while maintaining aspect ratio
        const scaleX = boundsWidth / obj.svgWidth;
        const scaleY = boundsHeight / obj.svgHeight;
        const scale = Math.min(scaleX, scaleY); // Use the smaller scale to fit within bounds

        const scaledWidth = obj.svgWidth * scale;
        const scaledHeight = obj.svgHeight * scale;

        // Center the scaled LaTeX within the original bounding box
        const offsetX = (boundsWidth - scaledWidth) / 2;
        const offsetY = (boundsHeight - scaledHeight) / 2;
        
        const drawX = bounds.minX + offsetX;
        const drawY = bounds.minY + offsetY;

        // Create SVG data URL
        const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(obj.renderedSvg);

        // Check if we have a cached image for this SVG
        if (!obj.cachedImg || obj.cachedImg.src !== svgDataUrl) {
            obj.cachedImg = new Image();
            obj.cachedImg.onload = () => {
                if (window.app && window.app.drawingEngine) {
                    window.app.drawingEngine.redrawAll();
                }
            };
            obj.cachedImg.src = svgDataUrl;
        }

        // Draw the image if it's loaded, centered within the bounding box
        if (obj.cachedImg.complete && obj.cachedImg.naturalWidth > 0) {
            ctx.drawImage(
                obj.cachedImg,
                drawX,
                drawY,
                scaledWidth,
                scaledHeight
            );
        } else {
            // Draw a loading indicator within the bounds
            ctx.save();
            ctx.strokeStyle = '#ddd';
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(bounds.minX, bounds.minY, boundsWidth, boundsHeight);
            ctx.strokeRect(bounds.minX, bounds.minY, boundsWidth, boundsHeight);
            ctx.fillStyle = '#999';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Rendering...', bounds.minX + boundsWidth/2, bounds.minY + boundsHeight/2);
            ctx.restore();
        }
    }

    /* ==========================================================================
       Add LaTeX to Canvas
       ========================================================================== */
    addLatexToCanvas() {
        const latexText = this.lastLatexResult;
        if (!latexText.trim() || !this.lastConversionMeta.bounds) return;

        const drawingEngine = window.app.drawingEngine;

        // Remove selected objects if they were converted
        if (this.lastConversionMeta.selection && this.lastConversionMeta.selection.size > 0) {
            drawingEngine.drawnObjects = drawingEngine.drawnObjects.filter(o => 
                !this.lastConversionMeta.selection.has(o.id)
            );
            drawingEngine.selectedIds.clear();
            
            if (window.app.historyManager) {
                window.app.historyManager.pushHistory(drawingEngine.getState());
            }
        }

        const bounds = this.lastConversionMeta.bounds;
        const newLatexObject = {
            id: drawingEngine.idGenerator.generate(),
            type: 'latex',
            latex: latexText,
            startX: bounds.minX,
            startY: bounds.minY,
            endX: bounds.maxX,
            endY: bounds.maxY,
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1 }
            // Note: No dataUrl property - LaTeX will be rendered on-the-fly
        };

        drawingEngine.drawnObjects.push(newLatexObject);
        
        if (window.app.historyManager) {
            window.app.historyManager.pushHistory(drawingEngine.getState());
        }
        
        drawingEngine.redrawAll();
        this.elements.addLatexBtn.style.display = 'none';
    }

    /* ==========================================================================
       Utility Functions
       ========================================================================== */
    
    // Clean up legacy LaTeX objects that have dataUrl stored
    cleanupLegacyLatexObjects() {
        if (!window.app || !window.app.drawingEngine) return;
        
        let hasChanges = false;
        window.app.drawingEngine.drawnObjects.forEach(obj => {
            if (obj.type === 'latex') {
                // Remove any cached data to force fresh rendering from LaTeX text
                if (obj.dataUrl) {
                    delete obj.dataUrl;
                    hasChanges = true;
                }
                if (obj.img) {
                    delete obj.img;
                    hasChanges = true;
                }
                if (obj.renderedWidth) {
                    delete obj.renderedWidth;
                    hasChanges = true;
                }
                if (obj.renderedHeight) {
                    delete obj.renderedHeight;
                    hasChanges = true;
                }
                if (obj.renderedSvg) {
                    delete obj.renderedSvg;
                    hasChanges = true;
                }
                if (obj.cachedImg) {
                    delete obj.cachedImg;
                    hasChanges = true;
                }
                if (obj.svgWidth) {
                    delete obj.svgWidth;
                    hasChanges = true;
                }
                if (obj.svgHeight) {
                    delete obj.svgHeight;
                    hasChanges = true;
                }
                obj.isRendering = false;
            }
        });
        
        if (hasChanges) {
            window.app.drawingEngine.redrawAll();
            console.log('Cleaned up legacy LaTeX objects to use on-the-fly rendering');
        }
    }

    /* ==========================================================================
       Public API
       ========================================================================== */
    /* ==========================================================================
       Public API
       ========================================================================== */
    
    // Get LaTeX source text from an object
    getLatexSource(obj) {
        if (obj.type === 'latex' && obj.latex) {
            return obj.latex;
        }
        return null;
    }
    
    // Update LaTeX source for an object
    updateLatexSource(obj, newLatex) {
        if (obj.type === 'latex') {
            obj.latex = newLatex;
            // Clear cached rendering data to force re-render
            delete obj.renderedSvg;
            delete obj.cachedImg;
            delete obj.svgWidth;
            delete obj.svgHeight;
            obj.isRendering = false;
            
            // Trigger re-render
            if (window.app && window.app.drawingEngine) {
                window.app.drawingEngine.redrawAll();
            }
            return true;
        }
        return false;
    }
    
    static getInstance() {
        if (!window.latexRenderer) {
            window.latexRenderer = new LatexRenderer();
        }
        return window.latexRenderer;
    }
}

// Initialize and export
window.LatexRenderer = LatexRenderer.getInstance();