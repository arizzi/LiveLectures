# LiveLectures

A browser-only lecture notebook for handwriting, PDF slide annotation, typed
notes, mathematical formulas, transcripts, audio recording and study cards.
Deploy the repository as static files (for example with GitHub Pages). No
application backend, database service or build step is required.

## Run

Serve the repository over HTTPS or localhost. For local development:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Microphone, persistent storage and installation depend
on browser support. After the first online load and service-worker installation,
the application and bundled libraries are available offline. Close existing app
tabs to activate an updated service worker. The app works under a subdirectory,
including `/LiveLectures/`.

## Lecture workspace

Click **Lectures** in the toolbar:

- **Library:** create and open lectures; edit title, course, date and tags; search
  the library; see recent thumbnails; open any of the last five saved versions
  as a separate recovery copy. Delete inactive lectures and their local audio.
- **Pages:** import local PDFs as searchable, fitted slide backgrounds; navigate
  thumbnails; add, duplicate, reorder and delete pages; export checked pages as
  PDF. Imported PDFs append pages and are rendered locally. Imports are capped
  at 100 MB and 300 pages per operation. Slides are rasterized, rather than
  preserving original PDF vectors.
- **Study:** search transcript, typed notes, slide text and LaTeX; jump to the
  source; add typed notes; preview and insert manual LaTeX without an API key;
  replace selected ink and restore its original strokes; add bookmarks and
  flashcards linked to the current view; export selected textual content/formulas
  or the whole lecture as Markdown. Optional AI generates cards from selected
  textual content. Handwriting remains available in JSON/bundles/PDF, rather than
  being converted automatically by Markdown export.
- **Audio:** choose a transcription language; start/stop browser speech
  recognition; record the microphone locally; play or download recordings; reveal
  timestamped ink during playback; jump from transcript segments to nearby ink or
  matching audio. Final transcript segments are saved immediately. Speech
  recognition availability varies and may involve a browser-vendor remote service.
- **Storage:** save a JSON file (direct overwrite with File System Access where
  supported, download fallback elsewhere), open a document, export/import complete
  lecture bundles, request persistent browser storage, configure Drive/AI, choose
  pen-side-button behavior and optional tilt erasing, and toggle focus mode.

The original drawing toolbar still provides pen/highlighter, shapes, selection,
transforms, undo/redo, erasing, zoom, backgrounds, AI conversion and full PDF export.
Toolbar controls support keyboard activation. Ctrl/Cmd+S saves locally,
Ctrl/Cmd+K opens note search, and Escape closes the lecture workspace. Finger
input pans while the pen draws; the side button can erase, pan, select, or be
ignored. Tilt erasing is off by default.

## Files, storage and performance

Only compact **version 2 JSON** is accepted. Legacy/unversioned files and old
localStorage autosaves are not migrated. Stroke points use flat arrays without
rounding; rendering caches are excluded. JSON includes notes, lecture metadata,
transcripts and rasterized slides; audio assets remain separate.

A **`.lecture` bundle** contains the versioned document plus all associated audio.
It is gzip-compressed with native browser streams when supported; an uncompressed
bundle is used otherwise. Opening a document or bundle creates a new local
lecture and fresh recording IDs, preserving the original. Large bundles can take
time and memory to pack; file imports are capped at 300 MB (600 MB expanded).
JSON without its original bundle may reference unavailable audio.

IndexedDB holds lecture documents, five recovery versions and audio assets. Save
status is visible beside **Lectures**, including failures. Each recording writes
partial audio periodically and commits its final chunk when stopped. Use complete
bundles for durable backups: browser storage can be cleared by the user/browser.
Recovery copies restore document state and available audio; they do not reconstruct
missing audio assets. Recovery history is kept locally and is not included in bundles.

Undo uses shared immutable packed object payloads. History capture still scans
objects; it is not a full command-log implementation. The drawing canvas stays
viewport-sized regardless of page count, skips offscreen objects, and caches ink
bounds outside saved data. Notes and images retain their original numeric precision.

## Optional Google Drive

In a Google Cloud project, enable Drive API and Google Picker API, configure OAuth
consent and a **Web application** OAuth client, and authorize the exact HTTPS site
origin (or localhost for development). Enter the public OAuth client ID and a
Picker API key under **Lectures → Storage**. Restrict the API key to the intended
origin and Picker API. No client secret belongs in this app.

Connect grants the `drive.file` scope. Access tokens stay in memory; reconnect
when they expire. **Open from Drive** uses Picker, and **Back up complete lecture**
creates a new timestamped file containing notes/slides/audio. Backups never
overwrite another device's work. These are explicit open/backup operations,
rather than automatic multi-device merging or background synchronization.

Configuration details: [Google's browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
and [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Optional Gemini AI

Enter your own Gemini key and an available model ID from Google AI Studio in
**Lectures → Storage → AI settings**. Keys are session-only unless **Remember key
on this device** is checked. Formula/SVG conversion and AI flashcards call Google
directly; selected content is sent only when those features are used. Active
requests can be cancelled and time out after 60 seconds. Notes, slides, manual
formulas, audio and manual cards need no AI account.

## Development and validation

The existing drawing modules use vanilla JavaScript. New functionality is split
into ES modules for document validation/helpers (`features/model.mjs`), IndexedDB
(`features/storage.mjs`), Drive (`features/drive.mjs`) and UI/workflows
(`features/workspace.mjs`). Browser dependencies and their licenses are in `vendor/`.

```bash
npm ci
npm test
```

For browser integration tests, start the static server on port 8765, then run:

```bash
npm run test:browser
```

Tests use system Chrome at `/usr/bin/google-chrome`; set `CHROME_BIN` and/or
`TEST_URL` to override. They cover save/reload, document/history round trips,
validation, atomic IndexedDB recovery, page operations, PDF import/export,
formula restoration, search, microphone recording with fake test audio,
compressed bundle import/export, visible save failures, mocked AI/Drive requests
and offline reload. Real Google OAuth, model availability, speech-recognition
services and physical stylus/device behavior require account/device testing.

The size benchmark uses 1,000 strokes with 100 points each and 21 history
snapshots. Shared-history memory figures estimate unique JSON payloads and
references, rather than total browser heap usage.

MIT license for application code; see LICENSE and vendor license notices.
