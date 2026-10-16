# Browser-only lecture workspace

All application code runs in the browser on a static HTTPS host. Third-party
services are optional; no application backend, shared API secret, or deployment
of server code is required.

## Delivery sequence

1. Add a versioned document model, validation and IndexedDB lecture/recovery/asset
   storage, and visible save status. Keep compact v2 JSON, with no legacy migration.
2. Add a library with metadata, thumbnails, local files and portable bundles.
3. Add local PDF slides, page navigation, duplicate/delete/reorder and selected PDF
   export; preserve slide assets through saves and bundles.
4. Persist finalized transcript segments, add language choice, search/navigation,
   local microphone recording and synchronized replay.
5. Preserve formula source strokes, add manual LaTeX and preview/restore controls.
6. Add bookmarks, typed notes, Markdown export and linked flashcards (manual and
   optional AI generation).
7. Add focus mode, accessible keyboard controls, configurable stylus behavior,
   cancellation/timeouts for external AI calls and session-only credentials.
8. Add optional Google Drive authorization/open/backup with user-visible conflict
   copies; configuration uses a public OAuth client ID and developer API key.
9. Cache the complete static application and local vendor dependencies, fix
   project-relative PWA paths, supply icons, and verify offline behavior.
10. Run document/history/model tests and browser integration checks, including
    save/reload, recovery, files, pages, transcript, formula and offline flows.

## Implementation boundaries

Audio is stored separately in IndexedDB; portable lecture bundles include assets.
Drive operations are explicit and create new backups, so competing devices never
silently overwrite each other. Browser speech recognition and optional AI/Drive
require their respective external services. Browser microphone/device behavior
and live OAuth require user hardware/credentials for full end-to-end validation.

## Delivery and verification

Steps 1–9 are implemented. Drive uses create-only timestamped backups as its
conflict-preservation mechanism. Existing drawing modules remain vanilla scripts;
new storage, document and cloud workflows use ES modules. Undo retains shared
snapshots rather than introducing a full edit-command log.

Step 10 passed:

- Compact document/history and model/IndexedDB transaction tests.
- Chrome save/reload, notes/formulas/cards/bookmarks, page duplicate/undo/redo,
  real PDF import and selected-page export, reorder/delete and source restoration.
- Search, recovery-copy creation, visible save failures and save/edit races.
- Fake-device microphone recording, asset persistence and compressed bundles.
- Mocked AI flashcards and create-only Drive multipart uploads.
- Offline reload with local math/PDF libraries, project-subdirectory hosting,
  phone-width workspace and keyboard toolbar activation.

Live Google OAuth/Picker and AI model availability, real speech-recognition
services, and physical stylus behavior remain account/device validation tasks.
No backend was added or deployed. No live external account data was written.
