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
    el.className = 'status' + (kind ? ' ' + kind : '');
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
    ['dragleave', 'drop'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('drag'); });
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
     A PDF shows in an iframe so the user can scroll through ALL pages;
     images show stacked, all of them, scrollable. Blob URLs are revoked
     when the modal closes, and previewing never triggers a download. */
  var previewUrls = null;

  function closePreview() {
    var overlay = document.getElementById('previewOverlay');
    if (overlay) overlay.hidden = true;
    var body = document.getElementById('previewBody');
    if (body) body.innerHTML = '';
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
        '<div class="preview-foot"><button type="button" id="previewCloseBtn" class="btn btn-outline">Close preview</button></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closePreview(); });
      document.getElementById('previewClose').addEventListener('click', closePreview);
      document.getElementById('previewCloseBtn').addEventListener('click', closePreview);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePreview(); });
    }
    closePreview();
    document.getElementById('previewTitle').textContent = title || 'Preview';
    var body = document.getElementById('previewBody');
    var urls = [];
    items.forEach(function (item, idx) {
      var b = item.blob;
      var k = kind;
      if (!k) k = (b.type === 'application/pdf') ? 'pdf' : (b.type && b.type.indexOf('image/') === 0 ? 'image' : '');
      var url = URL.createObjectURL(b);
      urls.push(url);
      var label = item.label || (items.length > 1 ? 'Page ' + (idx + 1) : '');
      if (k === 'pdf') {
        var frame = document.createElement('iframe');
        frame.src = url;
        frame.className = 'preview-pdf';
        frame.title = label || 'PDF preview';
        body.appendChild(frame);
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
    previewUrls = urls;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

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
