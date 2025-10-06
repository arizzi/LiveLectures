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
        };

        this.elements = {};
        this.initializeElements();
        this.setupEventListeners();
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
        this.elements.exportPdfBtn = document.getElementById('exportPdfBtn');
        this.elements.exportJsonBtn = document.getElementById('exportJsonBtn');
        this.elements.importJsonBtn = document.getElementById('importJsonBtn');
        this.elements.importFileInput = document.getElementById('importFileInput');
        this.elements.clearBtn = document.getElementById('clearBtn');

        // Color and size controls
        this.elements.colorPicker = document.getElementById('colorPicker');
        this.elements.brushSize = document.getElementById('brushSize');

        // AI and transcription
        this.elements.convertToLatexBtn = document.getElementById('convertToLatexBtn');
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
    }

    setupSubmenuHandlers() {
        // Close submenus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.toolbar-group')) {
                document.querySelectorAll('.submenu').forEach(s => s.classList.remove('show'));
            }
        });

        // Drawing tools submenu
        this.elements.drawingToolBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
            this.toggleSubmenu(this.elements.drawingToolBtn, this.elements.drawingSubmenu);
        }));

        // File actions submenu
        this.elements.fileActionsBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
            this.toggleSubmenu(this.elements.fileActionsBtn, this.elements.fileSubmenu);
        }));

        // Settings submenu
        this.elements.settingsBtn.addEventListener('click', EventUtils.stopPropagation((e) => {
            this.toggleSubmenu(this.elements.settingsBtn, this.elements.settingsSubmenu);
        }));

        // API Key setting
        this.elements.setApiKeyBtn.addEventListener('click', () => {
            this.handleApiKeySetup();
        });
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

        // Clear All
        this.elements.clearBtn.addEventListener('click', () => {
            if (!confirm('Clear all content on all pages?')) return;
            if (window.app && window.app.clearAll) {
                window.app.clearAll();
            }
        });

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
        this.elements.convertToLatexBtn.addEventListener('click', () => {
            // Check if auto-formula mode is enabled
            const drawingEngine = window.app?.drawingEngine;
            if (drawingEngine && drawingEngine.autoFormulaEnabled) {
                // In auto-formula mode, treat manual button as immediate trigger
                console.log('🪄 Manual LaTeX button clicked in auto-formula mode');
                
                // Check if we have auto-formula strokes to convert
                if (drawingEngine.autoFormulaStrokeIds.size > 0) {
                    console.log(`🚀 Triggering auto-formula with ${drawingEngine.autoFormulaStrokeIds.size} tracked strokes`);
                    drawingEngine.triggerAutoFormula('manual_button');
                } else {
                    console.log('📝 No auto-formula strokes tracked, falling back to normal manual conversion');
                    // Fall back to normal manual conversion if no auto-formula strokes
                    if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
                        window.LatexRenderer.convertToLatex();
                    }
                }
            } else {
                // Normal manual conversion
                if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
                    console.log('🪄 Manual LaTeX conversion (normal mode)');
                    window.LatexRenderer.convertToLatex();
                }
            }
        });

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
                    window.app.drawingEngine.viewScale = 1;
                    window.app.drawingEngine.updateZoomLabel();
                    window.app.drawingEngine.redrawAll();
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
        if (['pen', 'line', 'circle', 'rect'].includes(tool)) {
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
            // Re-render LaTeX if the source changed
            if (window.LatexRenderer && window.LatexRenderer.renderLatexObject) {
                window.LatexRenderer.renderLatexObject(this.currentEditingObject);
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
}

// Export to global scope
window.ToolbarManager = ToolbarManager;