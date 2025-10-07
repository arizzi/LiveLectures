/* ==========================================================================
   Notes App v2.1 - Toolbar Manager Module
   ========================================================================== */

class ToolbarManager {
    constructor() {
        this.currentTool = 'pen';
        this.toolIcons = {
            hand: 'fas fa-hand-paper',
            select: 'fas fa-mouse-pointer',
            pen: 'fas fa-pen',
            line: 'fas fa-minus',
            circle: 'far fa-circle',
            rect: 'far fa-square',
            eraser: 'fas fa-eraser'
            , 'stroke-deleter': 'fas fa-cut'
            , highlighter: 'fas fa-highlighter'
            , 'flood-fill': 'fas fa-fill-drip'
        };

        this.elements = {};
        this.initializeElements();
        this.setupEventListeners();
        // Ensure controls reflect saved settings for initial tool
        try { this.applyControlsForTool(this.currentTool); } catch (err) { /* ignore */ }
    }

    /* ==========================================================================
       Persistent per-tool settings (color / size)
       Stored in localStorage under key 'll_last_settings'
    ========================================================================== */
    loadLastSettings() {
        try {
            const raw = localStorage.getItem('ll_last_settings');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (err) {
            console.debug('Failed to load last settings', err);
            return null;
        }
    }

    saveLastSettings(settings) {
        try {
            localStorage.setItem('ll_last_settings', JSON.stringify(settings));
        } catch (err) {
            console.debug('Failed to save last settings', err);
        }
    }

    // Apply controls (color picker + brush size) for the given tool using
    // saved settings or sensible defaults.
    applyControlsForTool(tool) {
        const defaults = {
            pen: { color: '#000000', size: 2 },
            highlighter: { color: '#ff0000', size: 5 }, // red, 50% alpha handled in drawing
            eraser: { color: '#ffffff', size: 7 },
            shape: { color: '#003366', size: 2 }
        };

        const stored = this.loadLastSettings() || {};
        const entry = stored[tool] || stored[tool === 'line' || tool === 'circle' || tool === 'rect' ? 'shape' : tool] || defaults[tool] || defaults.pen;

        // Set color and size controls
        if (entry && entry.color) this.elements.colorPicker.value = entry.color;
        if (entry && entry.size !== undefined) this.elements.brushSize.value = entry.size;

        // Update preview swatch if present
        if (this.elements.colorPreview) this.elements.colorPreview.style.background = this.elements.colorPicker.value;
    }

    /* ==========================================================================
       Element Initialization
       ========================================================================== */
    initializeElements() {
        // Tool buttons
        this.elements.toolButtons = document.querySelectorAll('.toolbar-button[data-tool], .submenu-item[data-tool]');
        this.elements.drawingToolBtn = document.getElementById('drawingToolBtn');
        this.elements.drawingSubmenu = document.getElementById('drawingSubmenu');
        this.elements.fileActionsBtn = document.getElementById('fileActionsBtn');
        this.elements.fileSubmenu = document.getElementById('fileSubmenu');
        this.elements.settingsBtn = document.getElementById('settingsBtn');
        this.elements.settingsSubmenu = document.getElementById('settingsSubmenu');
        this.elements.setApiKeyBtn = document.getElementById('setApiKeyBtn');

        // Action buttons
        this.elements.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.elements.undoBtn = document.getElementById('undoBtn');
        this.elements.redoBtn = document.getElementById('redoBtn');
        this.elements.editPropertiesBtn = document.getElementById('editPropertiesBtn');
        this.elements.deleteBtn = document.getElementById('deleteBtn');
        this.elements.addPageBtn = document.getElementById('addPageBtn');
        this.elements.backgroundBtn = document.getElementById('backgroundBtn');
        this.elements.exportPdfBtn = document.getElementById('exportPdfBtn');
        this.elements.exportJsonBtn = document.getElementById('exportJsonBtn');
        this.elements.importJsonBtn = document.getElementById('importJsonBtn');
        this.elements.importFileInput = document.getElementById('importFileInput');
    // Note: clearBtn moved into file submenu in index.html
    this.elements.clearBtn = document.getElementById('clearBtn');
    // Zoom submenu controls
    this.elements.zoomMenuBtn = document.getElementById('zoomMenuBtn');
    this.elements.zoomSubmenu = document.getElementById('zoomSubmenu');
    this.elements.zoomInBtn = document.getElementById('zoomInBtn');
    this.elements.zoomOutBtn = document.getElementById('zoomOutBtn');
    this.elements.resetZoomBtn = document.getElementById('resetZoomBtn');
    this.elements.fitWidthBtn = document.getElementById('fitWidthBtn');
    this.elements.lockZoomBtn = document.getElementById('lockZoomBtn');
    this.elements.lockZoomLabel = document.getElementById('lockZoomLabel');
    this.elements.zoomLabel = document.getElementById('zoomLabel');

        // Color and size controls
    this.elements.colorPicker = document.getElementById('colorPicker');
    this.elements.brushSize = document.getElementById('brushSize');
    this.elements.colorPaletteBtn = document.getElementById('colorPaletteBtn');
    this.elements.colorPalette = document.getElementById('colorPalette');
    this.elements.colorPreview = document.getElementById('colorPreview');
    // swatches are added in DOM; we will query them after DOM ready

        // AI and transcription
        this.elements.convertToLatexBtn = document.getElementById('convertToLatexBtn');
    this.elements.convertToSvgBtn = document.getElementById('convertToSvgBtn');
        this.elements.autoFormulaBtn = document.getElementById('autoFormulaBtn');
        this.elements.transcriptionBtn = document.getElementById('transcriptionBtn');
    }

    /* ==========================================================================
       Event Listeners Setup
       ========================================================================== */
    setupEventListeners() {
        this.setupSubmenuHandlers();
        this.setupToolSelection();
        this.setupActionButtons();
        this.setupKeyboardShortcuts();
        this.setupFullscreenHandling();
        this.setupColorControls();
    }

    setupColorControls() {
        // Toggle palette
        if (this.elements.colorPaletteBtn && this.elements.colorPalette) {
            this.elements.colorPaletteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShown = this.elements.colorPalette.style.display === 'flex' || this.elements.colorPalette.classList.contains('show');
                if (isShown) {
                    this.elements.colorPalette.style.display = 'none';
                } else {
                    this.elements.colorPalette.style.display = 'flex';
                }
            });

            // Close palette when clicking elsewhere
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.color-palette-wrapper')) {
                    this.elements.colorPalette.style.display = 'none';
                }
            });
        }

        // Swatch clicks
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(s => {
            s.addEventListener('click', (ev) => {
                const c = s.dataset.color;
                if (c) {
                    this.elements.colorPicker.value = c;
                    if (this.elements.colorPreview) this.elements.colorPreview.style.background = c;
                    this.onColorOrSizeChanged();
                    this.elements.colorPalette.style.display = 'none';
                }
            });
        });

        // Native color input change: update preview on input, hide palette on change
        if (this.elements.colorPicker) {
            this.elements.colorPicker.addEventListener('input', () => {
                if (this.elements.colorPreview) this.elements.colorPreview.style.background = this.elements.colorPicker.value;
                this.onColorOrSizeChanged();
            });
            this.elements.colorPicker.addEventListener('change', () => {
                // hide palette after a selection is confirmed
                if (this.elements.colorPalette) this.elements.colorPalette.style.display = 'none';
            });
        }

        // 'More...' button opens the native color picker for RGB selection
        const moreBtn = document.getElementById('moreColorsBtn');
        if (moreBtn && this.elements.colorPicker) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Ensure the native input is visible to the browser before clicking it.
                // Some browsers won't open the color dialog if the input is hidden.
                if (this.elements.colorPalette) this.elements.colorPalette.style.display = 'flex';
                // Programmatically click the native color input to open the OS color picker
                // This happens as part of the user gesture (the More button click)
                try {
                    this.elements.colorPicker.click();
                } catch (err) {
                    // Fallback: focus then click
                    try { this.elements.colorPicker.focus(); this.elements.colorPicker.click(); } catch (e) { }
                }
                // Do NOT immediately hide the palette here; wait for the 'change' event
            });
        }

        // Brush size change
        if (this.elements.brushSize) {
            this.elements.brushSize.addEventListener('input', () => {
                this.onColorOrSizeChanged();
            });
        }

        // Initialize from saved settings for current tool
        setTimeout(() => {
            this.applyControlsForTool(this.currentTool || 'pen');
        }, 50);
    }

    onColorOrSizeChanged() {
        // Persist current color/size for the current tool
        const tool = this.currentTool || 'pen';
        const color = this.elements.colorPicker.value;
        const size = Number(this.elements.brushSize.value);

        const saved = this.loadLastSettings() || {};
        const key = (['line','circle','rect'].includes(tool)) ? 'shape' : tool;
        saved[key] = { color, size };
        this.saveLastSettings(saved);
    }

    setupSubmenuHandlers() {
        // Close submenus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.toolbar-group')) {
                document.querySelectorAll('.submenu').forEach(s => s.classList.remove('show'));
            }
        });

        // Drawing tools submenu
        if (this.elements.drawingToolBtn) {
            this.elements.drawingToolBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
                this.toggleSubmenu(this.elements.drawingToolBtn, this.elements.drawingSubmenu);
            }));
        }

        // File actions submenu
        if (this.elements.fileActionsBtn) {
            this.elements.fileActionsBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
                this.toggleSubmenu(this.elements.fileActionsBtn, this.elements.fileSubmenu);
            }));
        }

        // Settings submenu
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
                this.toggleSubmenu(this.elements.settingsBtn, this.elements.settingsSubmenu);
            }));
        }

        // API Key setting
        if (this.elements.setApiKeyBtn) {
            this.elements.setApiKeyBtn.addEventListener('click', () => {
                this.handleApiKeySetup();
            });
        }
    }

    setupToolSelection() {
        this.elements.toolButtons.forEach(btn => {
            btn.addEventListener('click', EventUtils.stopPropagation((e) => {
                const tool = btn.dataset.tool;
                if (tool) {
                    this.selectTool(tool);
                    this.hideAllSubmenus();
                }
            }));
        });
    }

    setupActionButtons() {
        // Undo/Redo
        this.elements.undoBtn.addEventListener('click', () => {
            if (window.app && window.app.undo) {
                window.app.undo();
            }
        });

        this.elements.redoBtn.addEventListener('click', () => {
            if (window.app && window.app.redo) {
                window.app.redo();
            }
        });

        // Delete
        this.elements.deleteBtn.addEventListener('click', () => {
            if (window.app && window.app.deleteSelected) {
                window.app.deleteSelected();
            }
        });

        // Add Page
        this.elements.addPageBtn.addEventListener('click', () => {
            if (window.app && window.app.addPage) {
                window.app.addPage();
            }
        });

        // Zoom controls & submenu wiring
        if (this.elements.zoomMenuBtn && this.elements.zoomSubmenu) {
            this.elements.zoomMenuBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
                this.toggleSubmenu(this.elements.zoomMenuBtn, this.elements.zoomSubmenu);
            }));
        }

        if (this.elements.zoomInBtn) {
            this.elements.zoomInBtn.addEventListener('click', () => {
                const de = window.app?.drawingEngine;
                if (de) {
                    de.setZoom(de.viewScale + window.NotesApp.ZOOM_STEP);
                }
            });
        }

        if (this.elements.zoomOutBtn) {
            this.elements.zoomOutBtn.addEventListener('click', () => {
                const de = window.app?.drawingEngine;
                if (de) {
                    de.setZoom(de.viewScale - window.NotesApp.ZOOM_STEP);
                }
            });
        }

        if (this.elements.resetZoomBtn) {
            this.elements.resetZoomBtn.addEventListener('click', () => {
                const de = window.app?.drawingEngine;
                if (de) {
                    de.setZoom(1);
                }
            });
        }

        if (this.elements.fitWidthBtn) {
            this.elements.fitWidthBtn.addEventListener('click', () => {
                const de = window.app?.drawingEngine;
                if (!de) return;
                de.fitWidthCenter();
            });
        }

        // Lock Zoom toggle
        if (this.elements.lockZoomBtn) {
            this.elements.lockZoomBtn.addEventListener('click', () => {
                // Toggle global zoom lock flag
                window.NotesApp = window.NotesApp || {};
                window.NotesApp.zoomLocked = !window.NotesApp.zoomLocked;

                const locked = !!window.NotesApp.zoomLocked;
                // Update button appearance
                if (locked) {
                    this.elements.lockZoomBtn.classList.add('active');
                    const ico = this.elements.lockZoomBtn.querySelector('i');
                    if (ico) ico.className = 'fas fa-lock';
                    if (this.elements.lockZoomLabel) this.elements.lockZoomLabel.textContent = 'Unlock Zoom';
                } else {
                    this.elements.lockZoomBtn.classList.remove('active');
                    const ico = this.elements.lockZoomBtn.querySelector('i');
                    if (ico) ico.className = 'fas fa-lock-open';
                    if (this.elements.lockZoomLabel) this.elements.lockZoomLabel.textContent = 'Lock Zoom';
                }

                // Hide submenu after toggle
                this.hideAllSubmenus();
            });
        }

        // Background Selection
        this.elements.backgroundBtn.addEventListener('click', () => {
            this.showBackgroundModal();
        });

        // Clear All
        if (this.elements.clearBtn) {
            this.elements.clearBtn.addEventListener('click', () => {
                // Keep same UX as before: confirmation and call clearAll on app
                if (!confirm('Clear all content on all pages?')) return;
                if (window.app && window.app.clearAll) {
                    window.app.clearAll();
                }
                // Hide submenu after action
                this.hideAllSubmenus();
            });
        }

        // File operations
        this.elements.exportPdfBtn.addEventListener('click', async () => {
            try {
                // Show loading state
                this.elements.exportPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                this.elements.exportPdfBtn.disabled = true;
                
                if (window.pdfExporter && window.app && window.app.drawingEngine) {
                    await window.pdfExporter.exportToPDF(window.app.drawingEngine);
                    console.log('PDF exported successfully');
                } else {
                    throw new Error('PDF export is not available. Drawing engine or PDF exporter not found.');
                }
            } catch (error) {
                console.error('PDF export failed:', error);
                alert('PDF export failed: ' + error.message);
            } finally {
                // Restore button state
                this.elements.exportPdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i>';
                this.elements.exportPdfBtn.disabled = false;
            }
        });

        this.elements.exportJsonBtn.addEventListener('click', () => {
            if (window.app && window.app.exportToJson) {
                window.app.exportToJson();
            }
        });

        this.elements.importJsonBtn.addEventListener('click', () => {
            this.elements.importFileInput.click();
        });

        this.elements.importFileInput.addEventListener('change', async (ev) => {
            const file = ev.target.files[0];
            if (!file) return;

            try {
                if (window.app && window.app.importFromJson) {
                    await window.app.importFromJson(file);
                }
            } catch (e) {
                alert('Invalid file: ' + e.message);
            } finally {
                this.elements.importFileInput.value = '';
            }
        });

        // Edit Properties
        this.elements.editPropertiesBtn.addEventListener('click', () => {
            this.openEditPropertiesModal();
        });

        // LaTeX conversion
        this.elements.convertToLatexBtn.addEventListener('click', async () => {
            // Check if auto-formula mode is enabled
            const drawingEngine = window.app?.drawingEngine;
            if (drawingEngine && drawingEngine.autoFormulaEnabled) {
                // In auto-formula mode, treat manual button as immediate trigger
                console.log('🪄 Manual LaTeX button clicked in auto-formula mode');
                
                // Check if we have auto-formula strokes to convert
                if (drawingEngine.autoFormulaStrokeIds.size > 0) {
                    console.log(`🚀 Triggering auto-formula with ${drawingEngine.autoFormulaStrokeIds.size} tracked strokes`);
                    // Trigger auto formula; the drawing engine will auto-add after conversion
                    drawingEngine.triggerAutoFormula('manual_button');
                } else {
                    console.log('📝 No auto-formula strokes tracked, falling back to normal manual conversion');
                    // Fall back to normal manual conversion if no auto-formula strokes
                    if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
                        // perform manual conversion and then auto-add result when available
                        try {
                            await window.LatexRenderer.convertToLatex();
                            // Auto-add to canvas if conversion produced content and Add button is visible
                            if (window.LatexRenderer.lastLatexResult && window.LatexRenderer.lastLatexResult.trim()) {
                                // If the add button is visible (renderer shows it), call addLatexToCanvas
                                if (window.LatexRenderer.elements.addLatexBtn.style.display !== 'none') {
                                    window.LatexRenderer.addLatexToCanvas();
                                }
                            }
                        } catch (e) {
                            console.error('Manual LaTeX conversion failed:', e);
                        }
                    }
                }
            } else {
                // Normal manual conversion
                if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
                    console.log('🪄 Manual LaTeX conversion (normal mode) - will auto-add on success');
                    try {
                        await window.LatexRenderer.convertToLatex();
                        if (window.LatexRenderer.lastLatexResult && window.LatexRenderer.lastLatexResult.trim()) {
                            if (window.LatexRenderer.elements.addLatexBtn.style.display !== 'none') {
                                window.LatexRenderer.addLatexToCanvas();
                            }
                        }
                    } catch (e) {
                        console.error('Manual LaTeX conversion failed:', e);
                    }
                }
            }
        });

        // SVG conversion
        if (this.elements.convertToSvgBtn) {
            this.elements.convertToSvgBtn.addEventListener('click', async () => {
                console.log('Convert to SVG button clicked');
                // Mirror LaTeX behavior: respect auto-formula mode if appropriate
                const drawingEngine = window.app?.drawingEngine;
                console.log('drawingEngine present:', !!drawingEngine);
                console.log('SvgConverter available:', !!window.SvgConverter);
                if (drawingEngine && drawingEngine.autoFormulaEnabled) {
                    // If auto formula mode is enabled, prefer engine's auto flow
                    if (drawingEngine.autoFormulaStrokeIds.size > 0) {
                        // Trigger auto formula recognition; drawing engine may handle auto-add
                        drawingEngine.triggerAutoFormula && drawingEngine.triggerAutoFormula('convert_to_svg_button');
                    } else {
                        // Fallback: call converter manually and add
                        if (window.SvgConverter && window.SvgConverter.convertToSvg) {
                            try {
                                console.log('Calling SvgConverter.convertToSvg() (fallback)');
                                await window.SvgConverter.convertToSvg();
                                console.log('SvgConverter finished convertToSvg');
                                if (window.SvgConverter.lastSvgResult && window.SvgConverter.lastSvgResult.trim()) {
                                    if (window.SvgConverter.elements.addSvgBtn && window.SvgConverter.elements.addSvgBtn.style.display !== 'none') {
                                        window.SvgConverter.addSvgToCanvas();
                                    }
                                }
                            } catch (e) {
                                console.error('Manual SVG conversion failed:', e);
                            }
                        }
                    }
                } else {
                    if (window.SvgConverter && window.SvgConverter.convertToSvg) {
                        console.log('Calling SvgConverter.convertToSvg() (normal)');
                        try {
                            await window.SvgConverter.convertToSvg();
                            console.log('SvgConverter finished convertToSvg');
                            if (window.SvgConverter.lastSvgResult && window.SvgConverter.lastSvgResult.trim()) {
                                if (window.SvgConverter.elements.addSvgBtn && window.SvgConverter.elements.addSvgBtn.style.display !== 'none') {
                                    window.SvgConverter.addSvgToCanvas();
                                }
                            }
                        } catch (e) {
                            console.error('Manual SVG conversion failed:', e);
                        }
                    }
                }
            });
        }

        // Auto Formula toggle
        this.elements.autoFormulaBtn.addEventListener('click', () => {
            this.toggleAutoFormula();
        });

        // Transcription toggle
        this.elements.transcriptionBtn.addEventListener('click', () => {
            if (window.TranscriptionManager && window.TranscriptionManager.toggle) {
                window.TranscriptionManager.toggle();
            }
        });
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in input fields
            if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            // Undo/Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.elements.redoBtn.click();
                } else {
                    this.elements.undoBtn.click();
                }
            }

            // Delete
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (window.app && window.app.drawingEngine && window.app.drawingEngine.selectedIds.size > 0) {
                    e.preventDefault();
                    this.elements.deleteBtn.click();
                }
            }

            // Select All
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && this.currentTool === 'select') {
                e.preventDefault();
                if (window.app && window.app.drawingEngine) {
                    window.app.drawingEngine.selectAll();
                    window.app.drawingEngine.redrawAll();
                }
            }

            // Zoom
            if ((e.ctrlKey || e.metaKey) && e.key === '+') {
                e.preventDefault();
                if (window.app && window.app.drawingEngine) {
                    window.app.drawingEngine.setZoom(
                        window.app.drawingEngine.viewScale + window.NotesApp.ZOOM_STEP
                    );
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                if (window.app && window.app.drawingEngine) {
                    window.app.drawingEngine.setZoom(
                        window.app.drawingEngine.viewScale - window.NotesApp.ZOOM_STEP
                    );
                }
            }

            // Reset zoom
            if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (window.app && window.app.drawingEngine) {
                    window.app.drawingEngine.setZoom(1);
                }
            }
        });
    }

    setupFullscreenHandling() {
        this.elements.fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    alert('Error: ' + err.message);
                });
            } else {
                document.exitFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const icon = this.elements.fullscreenBtn.querySelector('i');
            icon.className = document.fullscreenElement ? 'fas fa-compress' : 'fas fa-expand';
        });
    }

    /* ==========================================================================
       Submenu Management
       ========================================================================== */
    toggleSubmenu(button, submenu) {
        const isVisible = submenu.classList.contains('show');
        // Hide all submenus
        this.hideAllSubmenus();
        // Show this one if it wasn't visible
        if (!isVisible) {
            submenu.classList.add('show');
        }
    }

    hideAllSubmenus() {
        document.querySelectorAll('.submenu').forEach(s => s.classList.remove('show'));
    }

    /* ==========================================================================
       Tool Selection
       ========================================================================== */
    selectTool(tool) {
        // Remove active class from all tool buttons
        document.querySelectorAll('.toolbar-button[data-tool]').forEach(b => {
            b.classList.remove('active');
        });
        document.querySelectorAll('.submenu-item[data-tool]').forEach(b => {
            b.classList.remove('active');
        });

        // Find and activate the clicked button
        const toolButton = document.querySelector(`[data-tool="${tool}"]`);
        if (toolButton) {
            toolButton.classList.add('active');
        }

        // Update main drawing tool button icon and active state
        if (['pen', 'line', 'circle', 'rect', 'highlighter'].includes(tool)) {
            this.elements.drawingToolBtn.classList.add('active');
            this.elements.drawingToolBtn.querySelector('i').className = this.toolIcons[tool];
        } else {
            this.elements.drawingToolBtn.classList.remove('active');
            // Restore pen icon if no drawing tool is active
            this.elements.drawingToolBtn.querySelector('i').className = this.toolIcons['pen'];
        }

        this.currentTool = tool;

        // Notify the app about tool change
        if (window.app && window.app.setCurrentTool) {
            window.app.setCurrentTool(tool);
        }
        // Apply saved color/size for this tool
        try { this.applyControlsForTool(tool); } catch (err) { console.debug('applyControlsForTool failed', err); }
    }

    /* ==========================================================================
       API Key Management
       ========================================================================== */
    handleApiKeySetup() {
        const newKey = prompt('Please paste your Gemini API Key:', window.NotesApp.GEMINI_API_KEY);
        if (ApiManager.updateApiKey(newKey)) {
            alert('API Key updated.');
        }
        this.hideAllSubmenus();
    }

    /* ==========================================================================
       Getters
       ========================================================================== */
    getCurrentTool() {
        return this.currentTool;
    }

    getColorValue() {
        return this.elements.colorPicker.value;
    }

    getBrushSize() {
        return Number(this.elements.brushSize.value);
    }

    /* ==========================================================================
       UI State Updates
       ========================================================================== */
    updateTranscriptionButton(isRecording) {
        if (isRecording) {
            this.elements.transcriptionBtn.classList.add('recording');
            this.elements.transcriptionBtn.title = 'Stop Transcription';
        } else {
            this.elements.transcriptionBtn.classList.remove('recording');
            this.elements.transcriptionBtn.title = 'Start Transcription';
        }
    }

    updateAutoFormulaButton(isEnabled) {
        if (isEnabled) {
            this.elements.autoFormulaBtn.classList.add('auto-formula-active');
            this.elements.autoFormulaBtn.title = 'Disable Auto Formula Recognition';
        } else {
            this.elements.autoFormulaBtn.classList.remove('auto-formula-active');
            this.elements.autoFormulaBtn.title = 'Enable Auto Formula Recognition';
        }
    }

    /* ==========================================================================
       Auto Formula Toggle
       ========================================================================== */
    toggleAutoFormula() {
        const drawingEngine = window.app?.drawingEngine;
        if (!drawingEngine) return;

        const isEnabled = !drawingEngine.autoFormulaEnabled;
        drawingEngine.setAutoFormulaEnabled(isEnabled);
        
        // Update button appearance using the same pattern as transcription
        this.updateAutoFormulaButton(isEnabled);
    }

    /* ==========================================================================
       Selection and Edit Properties
       ========================================================================== */
    updateSelectionState() {
        const drawingEngine = window.app?.drawingEngine;
        if (!drawingEngine) return;

        const hasSelection = drawingEngine.selectedIds.size > 0;
        
        // Show/hide edit properties button based on selection
        if (hasSelection) {
            this.elements.editPropertiesBtn.style.display = 'flex';
        } else {
            this.elements.editPropertiesBtn.style.display = 'none';
        }
    }

    openEditPropertiesModal() {
        const drawingEngine = window.app?.drawingEngine;
        if (!drawingEngine || drawingEngine.selectedIds.size === 0) return;

        // Get the first selected object (for now, we'll edit one at a time)
        const selectedId = Array.from(drawingEngine.selectedIds)[0];
        const selectedObject = drawingEngine.drawnObjects.find(obj => obj.id === selectedId);
        
        if (!selectedObject) return;

        this.currentEditingObject = selectedObject;
        this.showEditPropertiesModal(selectedObject);
    }

    showEditPropertiesModal(obj) {
        const modal = document.getElementById('editPropertiesModal');
        const propertyEditor = document.getElementById('propertyEditor');
        
        // Clear existing content
        propertyEditor.innerHTML = '';
        
        // Generate property fields based on object type
        this.generatePropertyFields(obj, propertyEditor);
        
        // Show modal
        modal.style.display = 'flex';
        
        // Setup modal event listeners
        this.setupModalEventListeners();
    }

    generatePropertyFields(obj, container) {
        // Common properties for all objects
        this.addPropertyField(container, 'color', 'Color', obj.color || '#000000', 'color');
        
        if (obj.size !== undefined) {
            this.addPropertyField(container, 'size', 'Size', obj.size, 'number', { min: 1, max: 50 });
        }

        // Type-specific properties
        switch (obj.type) {
            case 'text':
                this.addPropertyField(container, 'text', 'Text', obj.text || '', 'text');
                this.addPropertyField(container, 'fontSize', 'Font Size', obj.fontSize || 16, 'number', { min: 8, max: 72 });
                this.addPropertyField(container, 'fontFamily', 'Font Family', obj.fontFamily || 'Arial', 'select', {
                    options: ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'sans-serif', 'serif', 'monospace']
                });
                break;
                
            case 'latex':
                this.addPropertyField(container, 'latex', 'LaTeX Source', obj.latex || '', 'textarea');
                break;
                
            case 'line':
            case 'rect':
            case 'circle':
                this.addPropertyField(container, 'startX', 'Start X', obj.startX || 0, 'number');
                this.addPropertyField(container, 'startY', 'Start Y', obj.startY || 0, 'number');
                this.addPropertyField(container, 'endX', 'End X', obj.endX || 0, 'number');
                this.addPropertyField(container, 'endY', 'End Y', obj.endY || 0, 'number');
                break;
        }
    }

    addPropertyField(container, name, label, value, type = 'text', options = {}) {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'property-field';
        
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.setAttribute('for', `prop-${name}`);
        fieldDiv.appendChild(labelEl);
        
        let inputEl;
        
        if (type === 'select') {
            inputEl = document.createElement('select');
            options.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option;
                optionEl.textContent = option;
                if (option === value) optionEl.selected = true;
                inputEl.appendChild(optionEl);
            });
        } else if (type === 'textarea') {
            inputEl = document.createElement('textarea');
            inputEl.value = value;
        } else {
            inputEl = document.createElement('input');
            inputEl.type = type;
            inputEl.value = value;
            
            if (options.min !== undefined) inputEl.min = options.min;
            if (options.max !== undefined) inputEl.max = options.max;
        }
        
        inputEl.id = `prop-${name}`;
        inputEl.name = name;
        fieldDiv.appendChild(inputEl);
        
        container.appendChild(fieldDiv);
    }

    setupModalEventListeners() {
        const modal = document.getElementById('editPropertiesModal');
        const saveBtn = document.getElementById('savePropertiesBtn');
        const cancelBtn = document.getElementById('cancelPropertiesBtn');
        const closeBtn = modal.querySelector('.modal-close');
        
        // Remove existing listeners
        const newSaveBtn = saveBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newCloseBtn = closeBtn.cloneNode(true);
        
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        // Add new listeners
        newSaveBtn.addEventListener('click', () => this.saveProperties());
        newCancelBtn.addEventListener('click', () => this.closeEditPropertiesModal());
        newCloseBtn.addEventListener('click', () => this.closeEditPropertiesModal());
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeEditPropertiesModal();
            }
        });
    }

    saveProperties() {
        const propertyEditor = document.getElementById('propertyEditor');
        const inputs = propertyEditor.querySelectorAll('input, textarea, select');
        
        // Collect new values
        const newProperties = {};
        inputs.forEach(input => {
            let value = input.value;
            
            // Type conversion based on input type
            if (input.type === 'number') {
                value = parseFloat(value);
            } else if (input.type === 'color') {
                // Ensure color format
                value = value;
            }
            
            newProperties[input.name] = value;
        });
        
        // Apply changes to the object
        Object.assign(this.currentEditingObject, newProperties);
        
        // Special handling for LaTeX objects
        if (this.currentEditingObject.type === 'latex' && newProperties.latex) {
            // Clear cached rendering to force re-render with new LaTeX content
            this.currentEditingObject.renderedSvg = null;
            this.currentEditingObject.svgWidth = null;
            this.currentEditingObject.svgHeight = null;
            this.currentEditingObject.isRendering = false;
            
            // Re-render LaTeX if the source changed
            if (window.LatexRenderer && window.LatexRenderer.renderLatexObject) {
                console.log('Re-rendering LaTeX object after edit:', this.currentEditingObject.id);
                // Use setTimeout to ensure the object is updated first
                setTimeout(() => {
                    window.LatexRenderer.renderLatexObject(this.currentEditingObject);
                }, 100);
            }
        }
        
        // Redraw canvas
        if (window.app && window.app.drawingEngine) {
            window.app.drawingEngine.redrawAll();
        }
        
        // Close modal
        this.closeEditPropertiesModal();
    }

    closeEditPropertiesModal() {
        const modal = document.getElementById('editPropertiesModal');
        modal.style.display = 'none';
        this.currentEditingObject = null;
    }

    /* ==========================================================================
       Background Selection Modal
       ========================================================================== */
    showBackgroundModal() {
        const modal = document.getElementById('backgroundModal');
        const options = modal.querySelectorAll('.background-option');
        const patternColorSelect = document.getElementById('patternColor');
        
        // Set current selection
        const currentBackground = window.app.drawingEngine.backgroundType;
        options.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.type === currentBackground) {
                option.classList.add('selected');
            }
        });
        
        // Set current pattern color
        patternColorSelect.value = window.app.drawingEngine.patternColor;
        
        // Add event listeners
        options.forEach(option => {
            option.addEventListener('click', () => {
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });
        
        const applyBtn = document.getElementById('applyBackgroundBtn');
        const cancelBtn = document.getElementById('cancelBackgroundBtn');
        const closeBtn = modal.querySelector('.modal-close');
        
        // Remove existing listeners
        applyBtn.replaceWith(applyBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        closeBtn.replaceWith(closeBtn.cloneNode(true));
        
        // Add new listeners
        document.getElementById('applyBackgroundBtn').addEventListener('click', () => {
            this.applyBackground();
        });
        
        document.getElementById('cancelBackgroundBtn').addEventListener('click', () => {
            this.closeBackgroundModal();
        });
        
        modal.querySelector('.modal-close').addEventListener('click', () => {
            this.closeBackgroundModal();
        });
        
        modal.style.display = 'flex';
    }
    
    applyBackground() {
        const selectedOption = document.querySelector('.background-option.selected');
        const patternColor = document.getElementById('patternColor').value;
        
        if (selectedOption && window.app.drawingEngine) {
            const backgroundType = selectedOption.dataset.type;
            window.app.drawingEngine.backgroundType = backgroundType;
            window.app.drawingEngine.patternColor = patternColor;
            window.app.drawingEngine.redrawAll();
        }
        
        this.closeBackgroundModal();
    }
    
    closeBackgroundModal() {
        const modal = document.getElementById('backgroundModal');
        modal.style.display = 'none';
    }
}

// Export to global scope
window.ToolbarManager = ToolbarManager;