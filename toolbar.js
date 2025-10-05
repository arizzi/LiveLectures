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
        this.elements.deleteBtn = document.getElementById('deleteBtn');
        this.elements.addPageBtn = document.getElementById('addPageBtn');
        this.elements.exportJsonBtn = document.getElementById('exportJsonBtn');
        this.elements.importJsonBtn = document.getElementById('importJsonBtn');
        this.elements.importFileInput = document.getElementById('importFileInput');
        this.elements.clearBtn = document.getElementById('clearBtn');

        // Color and size controls
        this.elements.colorPicker = document.getElementById('colorPicker');
        this.elements.brushSize = document.getElementById('brushSize');

        // AI and transcription
        this.elements.convertToLatexBtn = document.getElementById('convertToLatexBtn');
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

        // LaTeX conversion
        this.elements.convertToLatexBtn.addEventListener('click', () => {
            if (window.LatexRenderer && window.LatexRenderer.convertToLatex) {
                window.LatexRenderer.convertToLatex();
            }
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
}

// Export to global scope
window.ToolbarManager = ToolbarManager;