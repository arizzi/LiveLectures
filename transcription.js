/* ==========================================================================
   Notes App v2.1 - Transcription Module
   ========================================================================== */

class TranscriptionManager {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.isSupported = false;
        this.lastSpeechTime = Date.now();
        this.pauseThreshold = 2000; // 2 seconds for line break

        this.elements = {
            status: document.getElementById('transcription-status'),
            finished: document.getElementById('transcription-finished'),
            interim: document.getElementById('transcription-interim'),
            container: document.querySelector('.transcription-display')
        };

        // Check if all required elements exist
        if (!this.elements.finished || !this.elements.interim) {
            console.error('Transcription elements not found. Make sure the HTML structure is correct.');
            return;
        }

        this.initializeSpeechRecognition();
    }

    /* ==========================================================================
       Speech Recognition Initialization
       ========================================================================== */
    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.isSupported = true;
            this.recognition = new SpeechRecognition();
            this.setupRecognitionSettings();
            this.setupRecognitionEvents();
        } else {
            this.isSupported = false;
            this.elements.status.textContent = 'Sorry, your browser does not support speech recognition.';
            
            // Disable the transcription button in toolbar
            const transcriptionBtn = document.getElementById('transcriptionBtn');
            if (transcriptionBtn) {
                transcriptionBtn.disabled = true;
            }
        }
    }

    setupRecognitionSettings() {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'it-IT'; // Italian language - can be made configurable
    }

    setupRecognitionEvents() {
        this.recognition.onstart = () => {
            this.elements.status.textContent = 'Listening... speak now.';
            this.updateToolbarButton(true);
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                // Restart recognition if we're still supposed to be listening
                this.recognition.start();
            } else {
                this.elements.status.textContent = 'Transcription is stopped.';
                this.updateToolbarButton(false);
            }
        };

        this.recognition.onerror = (event) => {
            this.elements.status.textContent = 'Error: ' + event.error;
            this.updateToolbarButton(false);
        };

        this.recognition.onresult = (event) => {
            this.handleRecognitionResult(event);
        };
    }

    /* ==========================================================================
       Recognition Result Handling
       ========================================================================== */
    handleRecognitionResult(event) {
        // Safety check
        if (!this.elements.finished || !this.elements.interim) {
            console.error('Transcription elements not available');
            return;
        }

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        // Handle final results
        if (final.trim()) {
            const currentTime = Date.now();
            const timeSinceLastSpeech = currentTime - this.lastSpeechTime;
          //  console.log(`Time since last speech: ${timeSinceLastSpeech}ms vs threshold ${this.pauseThreshold}ms diff ${timeSinceLastSpeech - this.pauseThreshold}ms`);
            
            // Add line break if there was a long pause
            if (timeSinceLastSpeech > this.pauseThreshold && this.elements.finished.innerHTML.trim()) {
                console.log(`Pause detected: ${timeSinceLastSpeech}ms > ${this.pauseThreshold}ms - Adding line break`);
                this.elements.finished.innerHTML += '<br>';
                
                // Add the previous text segment to the main document with timestamp
                this.addTextToMainDocument();
            }
            
            // Add the final text to the finished container (escape HTML)
            const escapedText = this.escapeHtml(final.trim());
            this.elements.finished.innerHTML += escapedText + ' ';
            
            // Clear interim container since text is now final
            this.elements.interim.textContent = '';
            
            this.lastSpeechTime = currentTime;
        }

        // Handle interim results
        if (interim.trim()) {
           // console.log(`Interim detected: "${interim.trim()}"`);
            this.elements.interim.textContent = interim.trim();
            // DON'T update lastSpeechTime for interim - only for final results
        } else if (!final.trim()) {
            console.log(`No interim detected`);
            // Clear interim if no speech detected
            this.elements.interim.textContent = '';
            // Don't update lastSpeechTime here - preserve the pause timing
        }

        // Auto-scroll to bottom
        if (this.elements.container) {
            this.elements.container.scrollTop = this.elements.container.scrollHeight;
        }
    }

    /* ==========================================================================
       Utility Methods
       ========================================================================== */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addTextToMainDocument() {
        // Get the current transcribed text (without the line break we just added)
        const currentText = this.getTranscriptionText();
        if (!currentText.trim()) return;

        // Check if we have access to the drawing engine
        if (!window.app || !window.app.drawingEngine) {
            console.warn('Drawing engine not available for adding speech timestamp');
            return;
        }

        const drawingEngine = window.app.drawingEngine;
        const now = new Date();
        const timeString = now.toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });

        // Find a good position for the text, avoiding existing speech objects
        let x = drawingEngine.viewOffsetX + 50;
        let y = drawingEngine.viewOffsetY + 100;
        
        // Check for existing speech objects and position below them
        const speechObjects = drawingEngine.drawnObjects.filter(obj => obj.type === 'speech');
        if (speechObjects.length > 0) {
            const lastSpeech = speechObjects[speechObjects.length - 1];
            const lastBounds = window.GeometryUtils.objectBounds(lastSpeech);
            y = Math.max(y, lastBounds.maxY + 20);
        }

        // Create speech text object
        const speechObj = {
            id: drawingEngine.idGenerator.generate(),
            type: 'speech',
            text: `🎤 [${timeString}] ${currentText}`,
            x: x,
            y: y,
            color: '#0066cc',
            fontSize: 14,
            timestamp: now.getTime(),
            speechText: currentText,
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1 }
        };

        drawingEngine.drawnObjects.push(speechObj);
        console.log(`Added speech to document: [${timeString}] ${currentText.substring(0, 30)}...`);

        // Push to history and redraw
        if (window.app.historyManager) {
            window.app.historyManager.pushHistory(drawingEngine.getState());
        }
        drawingEngine.redrawAll();

        // Clear the transcription display for the next segment
        this.elements.finished.innerHTML = '';
    }

    /* ==========================================================================
       Public Control Methods
       ========================================================================== */
    start() {
        if (!this.isSupported) {
            alert('Speech recognition is not supported in your browser.');
            return false;
        }

        if (this.isListening) {
            return false; // Already listening
        }

        this.isListening = true;
        
        try {
            this.recognition.start();
            return true;
        } catch (e) {
            console.error('Failed to start recognition:', e);
            this.isListening = false;
            this.elements.status.textContent = 'Failed to start recognition: ' + e.message;
            return false;
        }
    }

    stop() {
        if (!this.isListening) {
            return false; // Already stopped
        }

        this.isListening = false;
        
        try {
            this.recognition.stop();
            return true;
        } catch (e) {
            console.error('Failed to stop recognition:', e);
            return false;
        }
    }

    toggle() {
        if (this.isListening) {
            return this.stop();
        } else {
            return this.start();
        }
    }

    /* ==========================================================================
       UI Updates
       ========================================================================== */
    updateToolbarButton(isRecording) {
        if (window.toolbarManager) {
            window.toolbarManager.updateTranscriptionButton(isRecording);
        }
    }

    /* ==========================================================================
       Transcription Management
       ========================================================================== */
    clearTranscription() {
        this.elements.finished.innerHTML = '';
        this.elements.interim.textContent = '';
    }

    getTranscriptionText() {
        // Get only the finished text (not interim) and preserve line breaks
        return this.elements.finished.textContent.trim();
    }

    setLanguage(language) {
        if (this.recognition) {
            this.recognition.lang = language;
        }
    }

    setPauseThreshold(milliseconds) {
        this.pauseThreshold = milliseconds;
        console.log(`Pause threshold set to ${milliseconds}ms`);
    }

    getPauseThreshold() {
        return this.pauseThreshold;
    }

    // Test method - adds a manual line break
    addManualLineBreak() {
        if (this.elements.finished.innerHTML.trim()) {
            this.elements.finished.innerHTML += '<br>';
        }
    }

    /* ==========================================================================
       Configuration
       ========================================================================== */
    getAvailableLanguages() {
        return [
            { code: 'en-US', name: 'English (US)' },
            { code: 'en-GB', name: 'English (UK)' },
            { code: 'it-IT', name: 'Italian' },
            { code: 'es-ES', name: 'Spanish' },
            { code: 'fr-FR', name: 'French' },
            { code: 'de-DE', name: 'German' },
            { code: 'pt-BR', name: 'Portuguese (Brazil)' },
            { code: 'zh-CN', name: 'Chinese (Simplified)' },
            { code: 'ja-JP', name: 'Japanese' },
            { code: 'ko-KR', name: 'Korean' }
        ];
    }

    getCurrentLanguage() {
        return this.recognition ? this.recognition.lang : null;
    }

    getConfiguration() {
        return {
            language: this.getCurrentLanguage(),
            pauseThreshold: this.pauseThreshold,
            isListening: this.isListening
        };
    }

    /* ==========================================================================
       Export/Import Transcription
       ========================================================================== */
    exportTranscription() {
        const text = this.getTranscriptionText();
        if (!text) {
            alert('No transcription to export.');
            return;
        }

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcription.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ==========================================================================
       State Management
       ========================================================================== */
    getState() {
        return {
            isListening: this.isListening,
            language: this.getCurrentLanguage(),
            transcriptionText: this.getTranscriptionText()
        };
    }

    setState(state) {
        if (state.language) {
            this.setLanguage(state.language);
        }
        
        if (state.transcriptionText) {
            // Escape the text and replace newlines with <br> tags
            const escapedText = this.escapeHtml(state.transcriptionText).replace(/\n/g, '<br>');
            this.elements.finished.innerHTML = escapedText;
            this.elements.interim.textContent = '';
        }

        // Don't restore listening state automatically for privacy/security reasons
    }

    /* ==========================================================================
       Static Instance Management
       ========================================================================== */
    static getInstance() {
        if (!window.transcriptionManager) {
            window.transcriptionManager = new TranscriptionManager();
        }
        return window.transcriptionManager;
    }
}

// Initialize and export
window.TranscriptionManager = TranscriptionManager.getInstance();