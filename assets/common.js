/* Chami PDF Maker website — shared helpers (no libraries, no tracking). */
(function () {
  'use strict';

  function fmtBytes(n) {
    if (n == null || isNaN(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    /* Keep any other classes on the element (e.g. layout classes):
       only swap the status kind. The old version overwrote className
       entirely, which silently dropped classes added elsewhere. */
    el.classList.add('status');
    el.classList.remove('error', 'ok');
    if (kind) el.classList.add(kind);
  }

  function showResult(box, show) {
    if (box) box.hidden = !show;
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read "' + file.name + '".')); };
      r.readAsArrayBuffer(file);
    });
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read "' + file.name + '".')); };
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That file is not a valid image.')); };
      img.src = src;
    });
  }

  /* Wire a dropzone + hidden file input. onFiles receives a FileList/array. */
  function setupDropzone(dropEl, inputEl, onFiles) {
    if (!dropEl || !inputEl) return;
    dropEl.addEventListener('click', function () { inputEl.click(); });
    dropEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputEl.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('drag'); });
    });
    /* dragleave also fires when the pointer moves over a child element
       inside the dropzone — only clear the highlight when it really
       leaves the dropzone, otherwise the highlight flickers mid-drag. */
    dropEl.addEventListener('dragleave', function (e) {
      e.preventDefault();
      if (e.relatedTarget && dropEl.contains(e.relatedTarget)) return;
      dropEl.classList.remove('drag');
    });
    dropEl.addEventListener('drop', function (e) {
      e.preventDefault();
      dropEl.classList.remove('drag');
    });
    dropEl.addEventListener('drop', function (e) {
      // Snapshot the FileList into a plain array: a live FileList can be
      // invalidated while an async handler is still reading it.
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) onFiles(Array.prototype.slice.call(e.dataTransfer.files));
    });
    inputEl.addEventListener('change', function () {
      if (inputEl.files && inputEl.files.length) onFiles(Array.prototype.slice.call(inputEl.files));
      inputEl.value = '';
    });
  }

  /* Check a CDN library loaded; if not, show a plain-words error and stop. */
  function requireLib(checkFn, libName, statusEl) {
    if (checkFn()) return true;
    setStatus(statusEl, 'Could not load the ' + libName + ' tool library. Please check your internet connection and reload this page.', 'error');
    return false;
  }

  /* Shared preview modal. openPreview(title, blob, kind):
     blob may be a single Blob or an array of Blobs / {blob, label} items.
     kind is 'pdf' or 'image' (auto-detected from the blob type if omitted).
     PDFs are rendered page by page to <canvas> with pdf.js (see below):
     an <iframe> from a blob URL renders blank on many mobile / in-app
     browsers, which was the mobile Preview-blank bug. Images show
     stacked, all of them, scrollable. Blob URLs are revoked when the
     modal closes, and previewing never triggers a download. */
  var previewUrls = null;
  var previewToken = 0;

  /* pdf.js CDN (same version the tool pages already use). Loaded on
     demand only when a PDF preview needs it; pages that already loaded
     it (compress-kb / compress-pdf / pdf-to-images) reuse window.pdfjsLib. */
  var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var pdfjsLoading = null;

  function loadPdfJs() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return Promise.resolve(window.pdfjsLib);
    }
    if (pdfjsLoading) return pdfjsLoading;
    pdfjsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = function () {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          resolve(window.pdfjsLib);
        } else reject(new Error('pdf.js did not load.'));
      };
      s.onerror = function () { reject(new Error('Could not load the PDF preview library.')); };
      document.head.appendChild(s);
    });
    /* Allow a later retry if the load failed (e.g. offline at first tap). */
    pdfjsLoading.catch(function () { pdfjsLoading = null; });
    return pdfjsLoading;
  }

  function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return readAsArrayBuffer(blob);
  }

  /* Render every page of a PDF blob as a canvas inside the modal body,
     one at a time so a long PDF never freezes the UI. A page that fails
     is skipped and noted; a total failure leaves a plain message and the
     "Open in new tab" fallback still works. `token` is the openPreview
     generation — rendering stops if the modal was closed/reopened. */
  function renderPdfPreview(body, blob, token) {
    var note = document.createElement('div');
    note.className = 'preview-note';
    note.textContent = 'Loading preview…';
    body.appendChild(note);
    blobToArrayBuffer(blob).then(function (buf) {
      return loadPdfJs().then(function (lib) {
        return lib.getDocument({ data: buf }).promise;
      });
    }).then(function (pdf) {
      note.textContent = 'Rendering ' + pdf.numPages + ' page' + (pdf.numPages > 1 ? 's' : '') + '…';
      var skipped = [];
      var chain = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) {
        (function (pageNum) {
          chain = chain.then(function () {
            if (token !== previewToken) return;
            return pdf.getPage(pageNum).then(function (page) {
              var base = page.getViewport({ scale: 1 });
              var avail = Math.max(200, body.clientWidth - 24);
              var dpr = Math.min(window.devicePixelRatio || 1, 2);
              var viewport = page.getViewport({ scale: (avail / base.width) * dpr });
              var canvas = document.createElement('canvas');
              canvas.className = 'preview-page';
              canvas.width = Math.floor(viewport.width);
              canvas.height = Math.floor(viewport.height);
              var cap = document.createElement('div');
              cap.className = 'preview-caption';
              cap.textContent = 'Page ' + pageNum;
              body.appendChild(cap);
              body.appendChild(canvas);
              return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            }).catch(function () { skipped.push(pageNum); });
          }).then(function () {
            /* Yield between pages so taps/scrolling stay responsive. */
            return new Promise(function (res) { setTimeout(res, 0); });
          });
        })(p);
      }
      return chain.then(function () {
        if (token !== previewToken) return;
        if (skipped.length) {
          note.textContent = 'Preview loaded — page' + (skipped.length > 1 ? 's ' : ' ') + skipped.join(', ') + ' could not be rendered.';
        } else if (note.parentNode) note.parentNode.removeChild(note);
      });
    }).catch(function () {
      if (token !== previewToken) return;
      note.textContent = 'Preview could not be rendered — tap Open in new tab.';
    });
  }

  function closePreview() {
    var overlay = document.getElementById('previewOverlay');
    if (overlay) overlay.hidden = true;
    var body = document.getElementById('previewBody');
    if (body) body.innerHTML = '';
    /* Bump the generation so an in-flight pdf.js render stops appending
       canvases to the now-closed modal. */
    previewToken++;
    if (previewUrls) {
      previewUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      previewUrls = null;
    }
    document.body.style.overflow = '';
  }

  function openPreview(title, blob, kind) {
    var raw = Array.isArray(blob) ? blob : [blob];
    var items = [];
    raw.forEach(function (b) {
      if (!b) return;
      if (b instanceof Blob) items.push({ blob: b, label: '' });
      else if (b && b.blob instanceof Blob) items.push({ blob: b.blob, label: b.label || '' });
    });
    if (!items.length) return;
    var overlay = document.getElementById('previewOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'previewOverlay';
      overlay.className = 'preview-overlay';
      overlay.hidden = true;
      overlay.innerHTML = '<div class="preview-dialog" role="dialog" aria-modal="true" aria-label="Preview">' +
        '<div class="preview-head"><span id="previewTitle"></span>' +
        '<button type="button" id="previewClose" class="preview-close" aria-label="Close preview">\u2715</button></div>' +
        '<div class="preview-body" id="previewBody"></div>' +
        '<div class="preview-foot"><button type="button" id="previewOpenTab" class="btn btn-outline">Open in new tab</button><button type="button" id="previewCloseBtn" class="btn btn-outline">Close preview</button></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closePreview(); });
      document.getElementById('previewClose').addEventListener('click', closePreview);
      document.getElementById('previewCloseBtn').addEventListener('click', closePreview);
      document.getElementById('previewOpenTab').addEventListener('click', function () {
        /* First blob URL: the whole file for a single PDF/image, the
           first item for a multi-item preview. URLs stay alive until
           the modal closes (see closePreview). */
        if (previewUrls && previewUrls.length) window.open(previewUrls[0], '_blank');
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePreview(); });
    }
    closePreview();
    previewToken++;
    var token = previewToken;
    document.getElementById('previewTitle').textContent = title || 'Preview';
    var body = document.getElementById('previewBody');
    var urls = [];
    items.forEach(function (item, idx) {
      var b = item.blob;
      var k = kind;
      if (!k) k = (b.type === 'application/pdf') ? 'pdf' : (b.type && b.type.indexOf('image/') === 0 ? 'image' : '');
      /* Unknown type (e.g. a ZIP): there is nothing sensible to render —
         skip it instead of showing a broken <img>. */
      if (k !== 'pdf' && k !== 'image') return;
      var url = URL.createObjectURL(b);
      urls.push(url);
      var label = item.label || (items.length > 1 ? 'Page ' + (idx + 1) : '');
      if (k === 'pdf') {
        /* Canvas rendering via pdf.js (async): the old <iframe> from a
           blob URL renders blank on many mobile / in-app browsers. The
           blob URL is still created so "Open in new tab" works. */
        renderPdfPreview(body, b, token);
      } else {
        if (label) {
          var cap = document.createElement('div');
          cap.className = 'preview-caption';
          cap.textContent = label;
          body.appendChild(cap);
        }
        var img = document.createElement('img');
        img.src = url;
        img.className = 'preview-img';
        img.alt = label || 'Preview';
        body.appendChild(img);
      }
    });
    if (!urls.length) return; /* nothing renderable — leave the modal closed */
    previewUrls = urls;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  /* Mobile header menu: hamburger toggle. Works on every page that loads
     common.js; harmless on pages without a toggle button. */
  function initNavToggle() {
    var btn = document.querySelector('.nav-toggle');
    var header = btn && btn.closest('header.site');
    var nav = header && header.querySelector('nav.main');
    if (!btn || !header || !nav) return;
    btn.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      /* closest() so a tap on any element inside a link (icon, span)
         still closes the menu — e.target alone is the inner element. */
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link) {
        header.classList.remove('nav-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNavToggle);
  else initNavToggle();

  window.Chami = {
    fmtBytes: fmtBytes,
    downloadBlob: downloadBlob,
    setStatus: setStatus,
    showResult: showResult,
    readAsArrayBuffer: readAsArrayBuffer,
    readAsDataURL: readAsDataURL,
    loadImage: loadImage,
    setupDropzone: setupDropzone,
    requireLib: requireLib,
    openPreview: openPreview,
    closePreview: closePreview
  };
})();
