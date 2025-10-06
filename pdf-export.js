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
                format: 'a4',
                compress: true,
                precision: 16
            });

            // Remove any default margins by explicitly setting page dimensions
            const pageWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            
            // Calculate scaling factor from pixels to mm
            // A4 in pixels at 96 DPI: 794x1123
            // A4 in mm: 210x297
            const scaleX = pageWidth / drawingEngine.A4_WIDTH;
            const scaleY = pageHeight / drawingEngine.A4_HEIGHT;

            // Calculate number of pages accounting for margins and spacing
            const pageMargin = drawingEngine.PAGE_MARGIN || 40;
            const pageSpacing = drawingEngine.PAGE_SPACING || 20;
            const totalCanvasHeight = drawingEngine.canvas.height;
            const numPages = Math.ceil((totalCanvasHeight - pageMargin) / (drawingEngine.A4_HEIGHT + pageSpacing));
            console.log(`Exporting ${numPages} pages to PDF`);
            console.log(`Found ${drawingEngine.drawnObjects.length} objects to export`);
            
        // Debug: log object types
        const objectTypes = {};
        drawingEngine.drawnObjects.forEach(obj => {
            objectTypes[obj.type] = (objectTypes[obj.type] || 0) + 1;
            // Log LaTeX object positions
            if (obj.type === 'latex') {
                console.log(`LaTeX object ${obj.id} at position (${obj.x}, ${obj.y}), size: ${obj.svgWidth || 'unknown'}x${obj.svgHeight || 'unknown'}`);
            }
        });
        console.log('Object types:', objectTypes);            for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
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

                // Draw background pattern if selected
                this.drawPageBackgroundForPDF(pageCtx, 0, 0, pageCanvas.width, pageCanvas.height, drawingEngine);

                // Calculate page offset accounting for margins and spacing
                const pageMargin = drawingEngine.PAGE_MARGIN || 40;
                const pageSpacing = drawingEngine.PAGE_SPACING || 20;
                const pageOffsetY = pageMargin + pageIndex * (drawingEngine.A4_HEIGHT + pageSpacing);
                console.log(`Processing page ${pageIndex + 1}, offset: ${pageOffsetY}`);

                // Draw objects that are on this page
                const objectsOnPage = drawingEngine.drawnObjects.filter(obj => 
                    this.isObjectOnPage(obj, pageOffsetY, drawingEngine.A4_HEIGHT)
                );
                console.log(`Found ${objectsOnPage.length} objects on page ${pageIndex + 1}`);
                
                // Summary of object types on this page
                const pageObjectTypes = {};
                objectsOnPage.forEach(obj => {
                    pageObjectTypes[obj.type] = (pageObjectTypes[obj.type] || 0) + 1;
                });
                console.log(`Page ${pageIndex + 1} object types:`, pageObjectTypes);
                
                for (const obj of objectsOnPage) {
                    // Create a copy of the object with adjusted coordinates
                    const adjustedObj = this.adjustObjectForPage(obj, pageOffsetY);
                    await this.drawObjectToPDF(pageCtx, adjustedObj);
                }

                // Convert canvas to image and add to PDF
                const imageData = pageCanvas.toDataURL('image/png');
                
                // Add image with precise positioning (no margins)
                // Some PDF engines may have tiny default margins, so we explicitly set to 0,0
                pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight, '', 'FAST');
                
                console.log(`Added page ${pageIndex + 1} to PDF at (0,0) with size ${pageWidth}x${pageHeight}mm`);
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
        console.log(`Found ${latexObjects.length} LaTeX objects to render`);
        
        if (latexObjects.length === 0) return;
        
        // Log details about each LaTeX object
        latexObjects.forEach((obj, index) => {
            console.log(`LaTeX object ${index}:`, {
                id: obj.id,
                latex: obj.latex,
                hasRenderedSvg: !!obj.renderedSvg,
                isRendering: obj.isRendering,
                x: obj.x,
                y: obj.y
            });
        });
        
        // Render all LaTeX objects
        const renderPromises = latexObjects.map(obj => {
            return new Promise((resolve) => {
                if (obj.renderedSvg) {
                    console.log(`LaTeX object ${obj.id} already rendered`);
                    resolve();
                    return;
                }
                
                // Use the LatexRenderer to render the object
                if (window.LatexRenderer) {
                    console.log(`Rendering LaTeX object ${obj.id}`);
                    window.LatexRenderer.renderLatexObject(obj);
                    
                    // Wait for rendering to complete
                    const checkRendered = () => {
                        if (obj.renderedSvg || !obj.isRendering) {
                            console.log(`LaTeX object ${obj.id} rendering completed, hasRenderedSvg: ${!!obj.renderedSvg}`);
                            resolve();
                        } else {
                            setTimeout(checkRendered, 100);
                        }
                    };
                    checkRendered();
                } else {
                    console.warn('LatexRenderer not available');
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
        
        // Get the drawing engine to access PAGE_MARGIN and A4_WIDTH
        const drawingEngine = window.app.drawingEngine;
        const pageMargin = drawingEngine.PAGE_MARGIN || 40;
        const pageWidth = drawingEngine.A4_WIDTH || 794;
        
        // Define the actual A4 page boundaries (excluding margins)
        const pageLeft = pageMargin;
        const pageRight = pageMargin + pageWidth;
        const pageTop = pageOffsetY + pageMargin;
        const pageBottom = pageOffsetY + pageHeight + pageMargin;
        
        // Check if object intersects with the actual page area (not margins)
        const intersectsVertically = bounds.maxY >= pageTop && bounds.minY <= pageBottom;
        const intersectsHorizontally = bounds.maxX >= pageLeft && bounds.minX <= pageRight;
        
        const intersects = intersectsVertically && intersectsHorizontally;
        
        // Debug output for problematic objects
        if (obj.type === 'latex' && !intersects) {
            console.log(`LaTeX object ${obj.id} NOT on page (${pageLeft}-${pageRight}, ${pageTop}-${pageBottom}):`, bounds);
        }
        
        return intersects;
    }

    adjustObjectForPage(obj, pageOffsetY) {
        // Create a copy of the object with adjusted coordinates
        const adjustedObj = JSON.parse(JSON.stringify(obj));
        
        // Get the drawing engine to access PAGE_MARGIN
        const drawingEngine = window.app.drawingEngine;
        const pageMargin = drawingEngine.PAGE_MARGIN || 40;
        
        // Small adjustment to compensate for potential PDF engine coordinate rounding
        // Some PDF engines have tiny implicit margins or coordinate precision issues
        const pdfAdjustmentX = 0; // No adjustment needed for X after testing
        const pdfAdjustmentY = 2; // Small upward adjustment to compensate for PDF engine boundaries
        
        // Debug: log original coordinates for first few objects
        if (obj.type === 'path' && obj.points && obj.points.length > 0) {
            console.log(`Adjusting ${obj.type} object:`, {
                originalX: obj.points[0].x,
                originalY: obj.points[0].y,
                pageOffsetY: pageOffsetY,
                pageMargin: pageMargin,
                adjustedX: obj.points[0].x - pageMargin,
                adjustedY: obj.points[0].y - pageOffsetY
            });
        }
        
        switch (obj.type) {
            case 'freehand':
            case 'path':
                if (adjustedObj.points) {
                    adjustedObj.points = obj.points.map(point => ({
                        ...point,
                        x: point.x - pageMargin + pdfAdjustmentX, // Subtract left margin + PDF adjustment
                        y: point.y - pageOffsetY + pdfAdjustmentY // Subtract page offset + PDF adjustment
                    }));
                }
                break;
                
            case 'line':
            case 'rect':
            case 'circle':
                adjustedObj.startX = (obj.startX || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.endX = (obj.endX || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.startY = (obj.startY || 0) - pageOffsetY + pdfAdjustmentY;
                adjustedObj.endY = (obj.endY || 0) - pageOffsetY + pdfAdjustmentY;
                if (obj.x !== undefined) {
                    adjustedObj.x = obj.x - pageMargin + pdfAdjustmentX;
                }
                if (obj.y !== undefined) {
                    adjustedObj.y = obj.y - pageOffsetY + pdfAdjustmentY;
                }
                break;
                
            case 'text':
                adjustedObj.x = (obj.x || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.y = obj.y - pageOffsetY + pdfAdjustmentY;
                break;
                
            case 'latex':
                // LaTeX objects use startX/startY, endX/endY format
                adjustedObj.startX = (obj.startX || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.endX = (obj.endX || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.startY = (obj.startY || 0) - pageOffsetY + pdfAdjustmentY;
                adjustedObj.endY = (obj.endY || 0) - pageOffsetY + pdfAdjustmentY;
                // Also set x,y for compatibility
                adjustedObj.x = (obj.startX || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.y = (obj.startY || 0) - pageOffsetY + pdfAdjustmentY;
                break;
                
            case 'timestamp':
                adjustedObj.x = (obj.x || 0) - pageMargin + pdfAdjustmentX;
                adjustedObj.y = (obj.y || 0) - pageOffsetY + pdfAdjustmentY;
                break;
                
            default:
                // Generic fallback
                if (obj.y !== undefined) {
                    adjustedObj.y = obj.y - pageOffsetY;
                }
                if (obj.startY !== undefined) {
                    adjustedObj.startY = obj.startY - pageOffsetY;
                }
                if (obj.endY !== undefined) {
                    adjustedObj.endY = obj.endY - pageOffsetY;
                }
        }
        
        return adjustedObj;
    }

    getObjectBounds(obj) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        switch (obj.type) {
            case 'freehand':
            case 'path':
                if (obj.points && obj.points.length > 0) {
                    obj.points.forEach(point => {
                        minX = Math.min(minX, point.x);
                        minY = Math.min(minY, point.y);
                        maxX = Math.max(maxX, point.x);
                        maxY = Math.max(maxY, point.y);
                    });
                } else {
                    // Fallback if no points
                    minX = obj.x || 0;
                    minY = obj.y || 0;
                    maxX = minX + 10;
                    maxY = minY + 10;
                }
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
                minX = obj.x;
                minY = obj.y;
                // Use actual rendered dimensions if available
                const textWidth = obj.width || 100;
                const textHeight = obj.height || 20;
                maxX = obj.x + textWidth;
                maxY = obj.y + textHeight;
                break;
                
            case 'latex':
                // LaTeX objects use startX/startY, endX/endY format
                minX = obj.startX || 0;
                minY = obj.startY || 0;
                maxX = obj.endX || (minX + (obj.svgWidth || 100));
                maxY = obj.endY || (minY + (obj.svgHeight || 30));
                break;
                
            case 'timestamp':
                minX = obj.x || 0;
                minY = obj.y || 0;
                maxX = minX + (obj.width || 100);
                maxY = minY + (obj.height || 20);
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
            case 'path':
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
            case 'timestamp':
                this.drawTimestampToPDF(ctx, obj);
                break;
            default:
                console.warn(`Unknown object type for PDF: ${obj.type}`);
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

    drawTimestampToPDF(ctx, obj) {
        // Draw timestamp as text
        ctx.fillStyle = obj.color || '#666666';
        ctx.font = `${obj.fontSize || 12}px ${obj.fontFamily || 'Arial'}`;
        
        const text = obj.text || obj.timestamp || 'Timestamp';
        ctx.fillText(text, obj.x || 0, (obj.y || 0) + (obj.fontSize || 12));
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
        console.log('Drawing LaTeX object to PDF:', obj.id);
        
        // For LaTeX objects, use startX/startY as the position
        const x = obj.x !== undefined ? obj.x : obj.startX || 0;
        const y = obj.y !== undefined ? obj.y : obj.startY || 0;
        
        // Use the bounding box dimensions as the container for the SVG
        const containerWidth = (obj.endX - obj.startX) || 100;
        const containerHeight = (obj.endY - obj.startY) || 30;
        
        // Get the native SVG dimensions
        const svgWidth = obj.svgWidth || containerWidth;
        const svgHeight = obj.svgHeight || containerHeight;

        // Calculate aspect ratios
        const containerRatio = containerWidth / containerHeight;
        const svgRatio = svgWidth / svgHeight;

        let renderWidth, renderHeight;

        // Determine render dimensions to fit SVG inside container while preserving aspect ratio
        if (svgRatio > containerRatio) {
            // SVG is wider than container, fit to width
            renderWidth = containerWidth;
            renderHeight = containerWidth / svgRatio;
        } else {
            // SVG is taller than or same ratio as container, fit to height
            renderHeight = containerHeight;
            renderWidth = containerHeight * svgRatio;
        }

        // Center the rendered image within the container bounds
        const drawX = x + (containerWidth - renderWidth) / 2;
        const drawY = y + (containerHeight - renderHeight) / 2;
        
        console.log(`LaTeX ${obj.id} position: (${x}, ${y}), container: ${containerWidth}x${containerHeight}`);
        console.log(`LaTeX ${obj.id} SVG native size: ${svgWidth}x${svgHeight}, render size: ${renderWidth}x${renderHeight}`);
        
        // Check if we have rendered SVG for this LaTeX object
        if (obj.renderedSvg) {
            console.log('Found rendered SVG for LaTeX object', obj.id);
            try {
                // Render SVG to an image canvas at the correct aspect ratio
                const imageData = await this.svgToImageData(obj.renderedSvg, renderWidth, renderHeight);
                console.log('Successfully converted SVG to target size for LaTeX', obj.id);
                
                // Draw the correctly-sized image at the centered position
                ctx.drawImage(imageData, drawX, drawY, renderWidth, renderHeight);
                return;
            } catch (error) {
                console.warn('Failed to render LaTeX SVG to PDF:', error);
            }
        } else {
            console.log('No rendered SVG found for LaTeX object', obj.id);
        }
        
        // Fallback: draw placeholder box with LaTeX text
        console.log('Drawing LaTeX fallback placeholder for', obj.id);
        ctx.strokeStyle = '#cccccc';
        ctx.fillStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        
        ctx.fillRect(x, y, containerWidth, containerHeight);
        ctx.strokeRect(x, y, containerWidth, containerHeight);
        
        // Draw LaTeX indicator
        ctx.fillStyle = '#666666';
        ctx.font = '12px Arial';
        ctx.fillText('LaTeX: ' + (obj.latex || '').substring(0, 20), x + 5, y + 15);
    }

    async svgToImageData(svgString, targetWidth, targetHeight) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Use high DPI for crisp rendering (2x for retina-like quality)
            const dpi = 2;
            const canvasWidth = targetWidth * dpi;
            const canvasHeight = targetHeight * dpi;
            
            // Set canvas size at high DPI
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            
            console.log(`Rendering SVG directly at target size: ${targetWidth}x${targetHeight} @ ${dpi}x DPI = ${canvasWidth}x${canvasHeight}`);
            
            // Create image from SVG
            const img = new Image();
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = function() {
                // Clear canvas with transparent background
                ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                
                // Draw the SVG directly at the target size with high DPI
                ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
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

    /* ==========================================================================
       Background Pattern Drawing for PDF
       ========================================================================== */
    drawPageBackgroundForPDF(ctx, x, y, width, height, drawingEngine) {
        if (drawingEngine.backgroundType === 'white') {
            return; // Already drawn white background
        }
        
        ctx.save();
        ctx.strokeStyle = drawingEngine.patternColor || '#e8e8e8';
        ctx.lineWidth = 0.5;
        
        if (drawingEngine.backgroundType === 'lines') {
            // Draw horizontal lines every 25px
            for (let lineY = y + 25; lineY < y + height; lineY += 25) {
                ctx.beginPath();
                ctx.moveTo(x, lineY);
                ctx.lineTo(x + width, lineY);
                ctx.stroke();
            }
        } else if (drawingEngine.backgroundType === 'squares') {
            // Draw grid squares every 25px
            for (let lineY = y; lineY <= y + height; lineY += 25) {
                ctx.beginPath();
                ctx.moveTo(x, lineY);
                ctx.lineTo(x + width, lineY);
                ctx.stroke();
            }
            for (let lineX = x; lineX <= x + width; lineX += 25) {
                ctx.beginPath();
                ctx.moveTo(lineX, y);
                ctx.lineTo(lineX, y + height);
                ctx.stroke();
            }
        } else if (drawingEngine.backgroundType === 'dots') {
            // Draw dots every 25px
            ctx.fillStyle = drawingEngine.patternColor || '#e8e8e8';
            for (let dotY = y + 25; dotY < y + height; dotY += 25) {
                for (let dotX = x + 25; dotX < x + width; dotX += 25) {
                    ctx.beginPath();
                    ctx.arc(dotX, dotY, 1, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }
        
        ctx.restore();
    }
}

// Initialize the PDF exporter
window.pdfExporter = new PDFExporter();