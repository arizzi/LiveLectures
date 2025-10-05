# Live Lectures - Advanced Notes App

🖊️ **A powerful web-based note-taking application with handwriting recognition, LaTeX conversion, and audio transcription.**

## ✨ Features

- **✏️ Advanced Drawing Tools**: Pen, shapes (lines, circles, rectangles), eraser with pressure sensitivity
- **🤖 AI-Powered LaTeX Conversion**: Convert handwritten mathematical formulas to LaTeX using Google's Gemini AI
- **🎤 Real-time Audio Transcription**: Live speech-to-text with multi-language support
- **📱 Touch & Stylus Support**: Full support for touch devices and digital stylus/pen input
- **🔄 Undo/Redo System**: Complete history management with autosave
- **📄 Multi-Page Support**: Add pages dynamically for longer notes
- **💾 Import/Export**: Save and load your work in JSON format
- **🎯 Selection & Transformation**: Select, move, resize, and rotate objects
- **📏 Zoom & Pan**: Navigate large documents with smooth zoom and pan
- **📱 Responsive Design**: Works on desktop, tablet, and mobile devices

## 🚀 Live Demo

Visit the live application: **[https://arizzi.github.io/LiveLectures](https://arizzi.github.io/LiveLectures)**

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3
- **Math Rendering**: MathJax 3.x for LaTeX formula rendering
- **AI Integration**: Google Gemini API for handwriting recognition
- **Speech Recognition**: Web Speech API for audio transcription
- **Icons**: Font Awesome 6.x

## 📋 Setup Instructions

### For GitHub Pages (Recommended)
1. The app is automatically deployed via GitHub Pages
2. Simply visit the live demo link above
3. No installation required!

### For Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/arizzi/LiveLectures.git
   cd LiveLectures
   ```

2. Serve the files using any static web server:
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (if you have http-server installed)
   npx http-server
   
   # Using PHP
   php -S localhost:8000
   ```

3. Open your browser and navigate to `http://localhost:8000`

## 🔑 API Setup

To use the LaTeX conversion feature, you'll need a Google Gemini API key:

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. In the app, click the settings gear icon → "Set API Key"
4. Paste your API key and save

## 📖 Usage Guide

### Basic Drawing
- **Select tools** from the toolbar (hand, select, pen, shapes, eraser)
- **Draw freely** with the pen tool
- **Create shapes** by selecting line, circle, or rectangle tools
- **Erase** content with the eraser tool

### LaTeX Conversion
1. **Draw** mathematical formulas by hand
2. **Select** the strokes you want to convert (use selection tool)
3. **Click** the magic wand icon (Convert to LaTeX)
4. **Review** the generated LaTeX in the sidebar
5. **Click** "Add to Canvas" to replace the handwriting with rendered LaTeX

### Audio Transcription
1. **Click** the microphone icon to start/stop recording
2. **Speak** clearly - transcription appears in real-time
3. **Interim results** appear in gray, final results in black
4. **Supports** multiple languages (default: Italian)

### File Operations
- **Export**: Save your work as JSON file
- **Import**: Load previously saved JSON files
- **Clear**: Remove all content (with confirmation)
- **Add Page**: Extend the canvas downward

## 🏗️ Project Structure

```
├── index.html          # Main HTML structure
├── styles.css          # Application styles
├── app.js             # Main application controller
├── drawing.js         # Drawing engine and canvas operations
├── toolbar.js         # Toolbar management and UI controls
├── latex.js           # LaTeX conversion and rendering
├── transcription.js   # Speech recognition functionality
├── utils.js           # Utility functions and helpers
└── README.md          # This file
```

## 🔧 Architecture

The application follows a modular architecture:

- **🎮 App.js**: Main application coordinator
- **🖼️ Drawing.js**: Canvas operations, object rendering, selection
- **🛠️ Toolbar.js**: UI controls, tool selection, keyboard shortcuts
- **📐 LaTeX.js**: AI-powered formula recognition and MathJax rendering
- **🎤 Transcription.js**: Web Speech API integration
- **⚙️ Utils.js**: Shared utilities, geometry, history management

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- **MathJax** for excellent mathematical typography
- **Google Gemini AI** for handwriting recognition
- **Font Awesome** for beautiful icons
- **Web Standards** for making this possible in the browser

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

Made with ❤️ by [arizzi](https://github.com/arizzi)