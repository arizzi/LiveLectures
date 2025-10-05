/* ==========================================================================
   Notes App v2.1 - Transcription Module
   ========================================================================== */

class TranscriptionManager {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.isSupported = false;

        this.elements = {
            status: document.getElementById('transcription-status'),
            output: document.getElementById('transcription-output'),
            container: document.querySelector('.transcription-display')
        };

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
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        // Add final results to the output
        if (final.trim()) {
            this.elements.output.innerHTML += final.trim() + ' ';
        }

        // Update or create interim span for interim results
        let interimSpan = this.elements.output.querySelector('.interim');
        if (!interimSpan) {
            interimSpan = document.createElement('span');
            interimSpan.className = 'interim';
            interimSpan.style.color = 'grey';
            this.elements.output.appendChild(interimSpan);
        }
        interimSpan.textContent = interim;

        // Auto-scroll to bottom
        this.elements.container.scrollTop = this.elements.container.scrollHeight;
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
        this.elements.output.innerHTML = '';
    }

    getTranscriptionText() {
        // Get text without interim results
        const output = this.elements.output.cloneNode(true);
        const interimSpan = output.querySelector('.interim');
        if (interimSpan) {
            interimSpan.remove();
        }
        return output.textContent.trim();
    }

    setLanguage(language) {
        if (this.recognition) {
            this.recognition.lang = language;
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
            this.elements.output.innerHTML = state.transcriptionText;
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