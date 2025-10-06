/* ==========================================================================
   Notes App v2.1 - PDF Export Module
   ========================================================================== */

class PDFExporter {
    constructor() {
        this.jsPDF = null;
        this.isLoaded = false;
        
        // Try to initialize immediately if jsPDF is already available
        if (typeof window.jsPDF !== 'undefined' || (window.jspdf && window.jspdf.jsPDF)) {
            this.jsPDF = window.jsPDF || window.jspdf.jsPDF;
            this.isLoaded = true;
            console.log('jsPDF library found immediately');
        } else {
            // Load asynchronously
            this.loadjsPDF();
        }
    }

    /* ==========================================================================
       Library Loading
       ========================================================================== */
    async loadjsPDF() {
        try {
            // Load jsPDF library dynamically
            if (typeof window.jsPDF === 'undefined') {
                await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            }
            
            // jsPDF might be available as window.jsPDF or window.jspdf.jsPDF
            this.jsPDF = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
            
            if (!this.jsPDF) {
                throw new Error('jsPDF library not found after loading');
            }
            
            this.isLoaded = true;
            console.log('jsPDF library loaded successfully');
        } catch (error) {
            console.error('Failed to load jsPDF library:', error);
            this.isLoaded = false;
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /* ==========================================================================
       PDF Export Functions
       ========================================================================== */
    async exportToPDF(drawingEngine, filename = 'notes.pdf') {
        if (!this.isLoaded) {
            console.log('PDF library not loaded, attempting to load...');
            await this.loadjsPDF();
        }
        
        if (!this.isLoaded || !this.jsPDF) {
            throw new Error('jsPDF library not available. Please check your internet connection and try again.');
        }

        try {
            // Ensure all LaTeX objects are rendered before export
            await this.ensureLatexRendered(drawingEngine);
            
            // Create PDF with A4 dimensions (210mm x 297mm)
            const pdf = new this.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            
            // Calculate scaling factor from pixels to mm
            // A4 in pixels at 96 DPI: 794x1123
            // A4 in mm: 210x297
            const scaleX = pageWidth / drawingEngine.A4_WIDTH;
            const scaleY = pageHeight / drawingEngine.A4_HEIGHT;

            // Calculate number of pages
            const numPages = Math.ceil(drawingEngine.canvas.height / drawingEngine.A4_HEIGHT);
            console.log(`Exporting ${numPages} pages to PDF`);
            console.log(`Found ${drawingEngine.drawnObjects.length} objects to export`);
            
            // Debug: log object types
            const objectTypes = {};
            drawingEngine.drawnObjects.forEach(obj => {
                objectTypes[obj.type] = (objectTypes[obj.type] || 0) + 1;
            });
            console.log('Object types:', objectTypes);
            
            for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
                if (pageIndex > 0) {
                    pdf.addPage();
                }

                // Create a temporary canvas for this page
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = drawingEngine.A4_WIDTH;
                pageCanvas.height = drawingEngine.A4_HEIGHT;
                const pageCtx = pageCanvas.getContext('2d');

                // Fill with white background
                pageCtx.fillStyle = '#ffffff';
                pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

                // Calculate page offset
                const pageOffsetY = pageIndex * drawingEngine.A4_HEIGHT;

                // Draw objects that are on this page
                for (const obj of drawingEngine.drawnObjects) {
                    if (this.isObjectOnPage(obj, pageOffsetY, drawingEngine.A4_HEIGHT)) {
                        // Create a copy of the object with adjusted coordinates
                        const adjustedObj = this.adjustObjectForPage(obj, pageOffsetY);
                        await this.drawObjectToPDF(pageCtx, adjustedObj);
                    }
                }

                // Convert canvas to image and add to PDF
                const imageData = pageCanvas.toDataURL('image/png');
                pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
            }

            // Save the PDF
            pdf.save(filename);
            
            return true;
        } catch (error) {
            console.error('PDF export failed:', error);
            throw error;
        }
    }

    /* ==========================================================================
       Helper Functions
       ========================================================================== */
    async ensureLatexRendered(drawingEngine) {
        // Find all LaTeX objects and ensure they are rendered
        const latexObjects = drawingEngine.drawnObjects.filter(obj => obj.type === 'latex');
        
        if (latexObjects.length === 0) return;
        
        // Render all LaTeX objects
        const renderPromises = latexObjects.map(obj => {
            return new Promise((resolve) => {
                if (obj.renderedSvg) {
                    resolve();
                    return;
                }
                
                // Use the LatexRenderer to render the object
                if (window.LatexRenderer) {
                    window.LatexRenderer.renderLatexObject(obj);
                    
                    // Wait for rendering to complete
                    const checkRendered = () => {
                        if (obj.renderedSvg || !obj.isRendering) {
                            resolve();
                        } else {
                            setTimeout(checkRendered, 100);
                        }
                    };
                    checkRendered();
                } else {
                    resolve();
                }
            });
        });
        
        await Promise.all(renderPromises);
        console.log(`Ensured ${latexObjects.length} LaTeX objects are rendered for PDF export`);
    }

    isObjectOnPage(obj, pageOffsetY, pageHeight) {
        // Get object bounds
        const bounds = this.getObjectBounds(obj);
        
        // Check if object intersects with page
        const pageTop = pageOffsetY;
        const pageBottom = pageOffsetY + pageHeight;
        
        return bounds.maxY >= pageTop && bounds.minY <= pageBottom;
    }

    adjustObjectForPage(obj, pageOffsetY) {
        // Create a copy of the object with adjusted Y coordinates
        const adjustedObj = JSON.parse(JSON.stringify(obj));
        
        switch (obj.type) {
            case 'freehand':
                adjustedObj.points = obj.points.map(point => ({
                    ...point,
                    y: point.y - pageOffsetY
                }));
                break;
                
            case 'line':
            case 'rect':
            case 'circle':
                adjustedObj.startY = (obj.startY || 0) - pageOffsetY;
                adjustedObj.endY = (obj.endY || 0) - pageOffsetY;
                adjustedObj.y = (obj.y || 0) - pageOffsetY;
                break;
                
            case 'text':
            case 'latex':
                adjustedObj.y = obj.y - pageOffsetY;
                break;
        }
        
        return adjustedObj;
    }

    getObjectBounds(obj) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        switch (obj.type) {
            case 'freehand':
                obj.points.forEach(point => {
                    minX = Math.min(minX, point.x);
                    minY = Math.min(minY, point.y);
                    maxX = Math.max(maxX, point.x);
                    maxY = Math.max(maxY, point.y);
                });
                break;
                
            case 'line':
                minX = Math.min(obj.startX, obj.endX);
                minY = Math.min(obj.startY, obj.endY);
                maxX = Math.max(obj.startX, obj.endX);
                maxY = Math.max(obj.startY, obj.endY);
                break;
                
            case 'rect':
                minX = Math.min(obj.startX, obj.endX);
                minY = Math.min(obj.startY, obj.endY);
                maxX = Math.max(obj.startX, obj.endX);
                maxY = Math.max(obj.startY, obj.endY);
                break;
                
            case 'circle':
                const radius = Math.sqrt(
                    Math.pow(obj.endX - obj.startX, 2) + 
                    Math.pow(obj.endY - obj.startY, 2)
                );
                minX = obj.startX - radius;
                minY = obj.startY - radius;
                maxX = obj.startX + radius;
                maxY = obj.startY + radius;
                break;
                
            case 'text':
            case 'latex':
                minX = obj.x;
                minY = obj.y;
                maxX = obj.x + (obj.width || 100);
                maxY = obj.y + (obj.height || 20);
                break;
                
            default:
                minX = obj.x || 0;
                minY = obj.y || 0;
                maxX = minX + (obj.width || 10);
                maxY = minY + (obj.height || 10);
        }
        
        return { minX, minY, maxX, maxY };
    }

    async drawObjectToPDF(ctx, obj) {
        // Use the existing drawing logic from the main app
        if (window.app && window.app.drawingEngine) {
            // For LaTeX objects, we need special handling
            if (obj.type === 'latex') {
                await this.drawLatexToPDF(ctx, obj);
                return;
            }
            
            // Temporarily override the context to draw to our PDF context
            const originalCtx = window.app.drawingEngine.ctx;
            window.app.drawingEngine.ctx = ctx;
            
            try {
                // Use the main drawing engine's drawObject method
                window.app.drawingEngine.drawObject(ctx, obj);
            } catch (error) {
                console.warn('Failed to use main drawing method, falling back to simple drawing:', error);
                await this.drawObjectSimple(ctx, obj);
            } finally {
                // Restore the original context
                window.app.drawingEngine.ctx = originalCtx;
            }
        } else {
            // Fallback to our simple drawing
            await this.drawObjectSimple(ctx, obj);
        }
    }

    async drawObjectSimple(ctx, obj) {
        // Fallback simple drawing logic
        ctx.save();
        
        switch (obj.type) {
            case 'freehand':
                this.drawFreehandToPDF(ctx, obj);
                break;
            case 'line':
                this.drawLineToPDF(ctx, obj);
                break;
            case 'rect':
                this.drawRectToPDF(ctx, obj);
                break;
            case 'circle':
                this.drawCircleToPDF(ctx, obj);
                break;
            case 'text':
                this.drawTextToPDF(ctx, obj);
                break;
            case 'latex':
                await this.drawLatexToPDF(ctx, obj);
                break;
        }
        
        ctx.restore();
    }

    drawFreehandToPDF(ctx, obj) {
        if (!obj.points || obj.points.length < 2) return;
        
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.size || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x, obj.points[0].y);
        
        for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
        }
        
        ctx.stroke();
    }

    drawLineToPDF(ctx, obj) {
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.size || 2;
        
        ctx.beginPath();
        ctx.moveTo(obj.startX, obj.startY);
        ctx.lineTo(obj.endX, obj.endY);
        ctx.stroke();
    }

    drawRectToPDF(ctx, obj) {
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.size || 2;
        
        const width = obj.endX - obj.startX;
        const height = obj.endY - obj.startY;
        
        ctx.strokeRect(obj.startX, obj.startY, width, height);
    }

    drawCircleToPDF(ctx, obj) {
        ctx.strokeStyle = obj.color || '#000000';
        ctx.lineWidth = obj.size || 2;
        
        const radius = Math.sqrt(
            Math.pow(obj.endX - obj.startX, 2) + 
            Math.pow(obj.endY - obj.startY, 2)
        );
        
        ctx.beginPath();
        ctx.arc(obj.startX, obj.startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    drawTextToPDF(ctx, obj) {
        ctx.fillStyle = obj.color || '#000000';
        ctx.font = `${obj.fontSize || 16}px ${obj.fontFamily || 'Arial'}`;
        ctx.fillText(obj.text || '', obj.x, obj.y);
    }

    async drawLatexToPDF(ctx, obj) {
        // Check if we have rendered SVG for this LaTeX object
        if (obj.renderedSvg) {
            try {
                // Convert SVG to image and draw it
                const imageData = await this.svgToImageData(obj.renderedSvg, obj.svgWidth || 100, obj.svgHeight || 50);
                ctx.drawImage(imageData, obj.x, obj.y, obj.svgWidth || 100, obj.svgHeight || 50);
                return;
            } catch (error) {
                console.warn('Failed to render LaTeX SVG to PDF:', error);
            }
        }
        
        // Fallback: draw placeholder box with LaTeX text
        ctx.strokeStyle = '#cccccc';
        ctx.fillStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        
        const width = obj.width || obj.svgWidth || 100;
        const height = obj.height || obj.svgHeight || 30;
        
        ctx.fillRect(obj.x, obj.y, width, height);
        ctx.strokeRect(obj.x, obj.y, width, height);
        
        // Draw LaTeX indicator
        ctx.fillStyle = '#666666';
        ctx.font = '12px Arial';
        ctx.fillText('LaTeX: ' + (obj.latex || '').substring(0, 20), obj.x + 5, obj.y + 15);
    }

    async svgToImageData(svgString, width, height) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size
            canvas.width = width;
            canvas.height = height;
            
            // Create image from SVG
            const img = new Image();
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = function() {
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(canvas);
            };
            
            img.onerror = function() {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load SVG image'));
            };
            
            img.src = url;
        });
    }
}

// Initialize the PDF exporter
window.pdfExporter = new PDFExporter();