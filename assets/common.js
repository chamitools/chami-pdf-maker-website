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
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    });
    inputEl.addEventListener('change', function () {
      if (inputEl.files && inputEl.files.length) onFiles(inputEl.files);
      inputEl.value = '';
    });
  }

  /* Check a CDN library loaded; if not, show a plain-words error and stop. */
  function requireLib(checkFn, libName, statusEl) {
    if (checkFn()) return true;
    setStatus(statusEl, 'Could not load the ' + libName + ' tool library. Please check your internet connection and reload this page.', 'error');
    return false;
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
    requireLib: requireLib
  };
})();
