# Bundled browser dependencies

These pinned browser distributions are served locally for offline use. No build
step or dependency server is required by the application.

- PDF.js / pdfjs-dist 3.11.174 — Apache 2.0 (LICENSE-pdfjs.txt).
  The importer disables eval with `isEvalSupported: false`.
- MathJax 3.2.2, tex-svg-full distribution — Apache 2.0 (LICENSE-mathjax.txt).
- jsPDF 2.5.1 — MIT (LICENSE-jspdf.txt).
- Pickr 1.9.1 — MIT (LICENSE-pickr.txt).
- Font Awesome Free 6.4.0 — CSS MIT, fonts SIL OFL 1.1
  (LICENSE-fontawesome.txt). Only solid/regular WOFF2 fonts are bundled.

Files were obtained from the corresponding pinned npm distributions on jsDelivr
and cdnjs. Update these libraries and the service-worker cache version together.
Google Identity Services and Picker are loaded from Google only when connecting
Drive; they are not required for offline notes, slides, formulas or audio.
