/* PDF to Images — runs 100% in your browser with pdf.js.
   Every page is rendered at 2x scale and downloaded as PNG or JPG,
   one by one or all together in a ZIP. */
(function () {
  'use strict';
  var file = null; // {name, bytes}
  var pages = [];  // {num, blob, url, ext}
  var busy = false; // a conversion is running; ignore new files until it finishes
  var $ = function (id) { return document.getElementById(id); };

  function renderInfo() {
    var info = $('fileInfo');
    if (!file) { info.textContent = ''; $('convertBtn').disabled = true; $('clearBtn').disabled = true; return; }
    info.textContent = file.name + ' loaded. Choose PNG or JPG, then tap Convert to Images.';
    $('convertBtn').disabled = false;
    $('clearBtn').disabled = false;
  }

  function renderPages() {
    var grid = $('thumbs');
    grid.innerHTML = '';
    pages.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'thumb';
      var img = document.createElement('img');
      img.src = p.url; img.alt = 'Page ' + p.num;
      d.appendChild(img);
      var cap = document.createElement('div');
      cap.textContent = 'Page ' + p.num + ' (' + Chami.fmtBytes(p.blob.size) + ')';
      d.appendChild(cap);
      var row = document.createElement('div');
      row.className = 'row';
      var dl = document.createElement('button');
      dl.type = 'button'; dl.textContent = 'Download';
      dl.addEventListener('click', function () {
        Chami.downloadBlob(p.blob, 'chami-page-' + p.num + '.' + p.ext);
      });
      row.appendChild(dl);
      d.appendChild(row);
      grid.appendChild(d);
    });
    $('zipBtn').disabled = pages.length === 0;
    var stripLabel = $('stripLabel');
    if (stripLabel) stripLabel.hidden = pages.length === 0;
  }

  async function addFiles(list) {
    var status = $('status');
    if (busy) { Chami.setStatus(status, 'Please wait for the current conversion to finish before choosing another file.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
    var f = list[0];
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      Chami.setStatus(status, '"' + f.name + '" is not a PDF file. Please choose a PDF file.', 'error');
      return;
    }
    try {
      var bytes = await Chami.readAsArrayBuffer(f);
      // Pass a COPY: pdf.js transfers the buffer to its worker, detaching
      // the original. The stored bytes must stay usable for the convert step.
      var pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      file = { name: f.name, bytes: bytes, pages: pdf.numPages };
      await pdf.destroy();
      pages.forEach(function (p) { URL.revokeObjectURL(p.url); });
      pages = [];
      renderPages();
      Chami.setStatus(status, 'PDF loaded — ' + file.pages + ' pages.' + (list.length > 1 ? ' Only the first of ' + list.length + ' files is used; this tool takes one PDF at a time.' : ''), 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      if (/password/i.test(msg)) msg = 'This PDF is password-protected. Please use an unlocked copy — this tool cannot open password-protected PDFs.';
      Chami.setStatus(status, 'Could not open that PDF: ' + msg, 'error');
    }
  }

  function canvasToBlob(canvas, format) {
    return new Promise(function (resolve, reject) {
      var type = format === 'jpg' ? 'image/jpeg' : 'image/png';
      var q = format === 'jpg' ? 0.92 : undefined;
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not encode the page image.')); }, type, q);
    });
  }

  async function convert() {
    var status = $('status');
    if (!file) { Chami.setStatus(status, 'Please choose a PDF file first.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
    var format = $('format').value; // png or jpg
    var btn = $('convertBtn');
    btn.disabled = true;
    $('zipBtn').disabled = true; // no partial ZIP while pages are still rendering
    busy = true;
    Chami.showResult($('resultBox'), false);
    var pdf = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: file.bytes.slice(0) }).promise;
      // Only drop the previous results once the new PDF has actually
      // opened — a bad file used to wipe the good results for nothing.
      pages.forEach(function (p) { URL.revokeObjectURL(p.url); });
      pages = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var viewport = page.getViewport({ scale: 2 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        var ctx = canvas.getContext('2d');
        if (format === 'jpg') {
          // White background: JPEG has no transparency, so a page with a
          // transparent background would otherwise come out black.
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        var blob = await canvasToBlob(canvas, format);
        pages.push({ num: i, blob: blob, url: URL.createObjectURL(blob), ext: format });
        Chami.setStatus(status, 'Converting... page ' + i + ' of ' + pdf.numPages);
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      await pdf.destroy();
      renderPages();
      $('previewBtn').onclick = function () {
        var items = pages.map(function (p) { return { blob: p.blob, label: 'Page ' + p.num }; });
        Chami.openPreview('Page images — ' + pages.length + ' page' + (pages.length > 1 ? 's' : ''), items, 'image');
      };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + ' converted to ' + format.toUpperCase() + ' at 2x quality.', 'ok');
    } catch (e) {
      // Drop any half-finished set: showing partial pages (or letting the
      // ZIP button offer them) would pass off an incomplete conversion.
      pages.forEach(function (p) { URL.revokeObjectURL(p.url); });
      pages = [];
      renderPages();
      Chami.setStatus(status, 'Conversion failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      // Always release the pdf.js document, even when a page fails mid-way.
      if (pdf) { try { await pdf.destroy(); } catch (ignored) { /* already torn down */ } }
      busy = false;
      btn.disabled = !file;
    }
  }

  async function downloadZip() {
    var status = $('status');
    if (!pages.length) return;
    if (!Chami.requireLib(function () { return window.JSZip; }, 'ZIP', status)) return;
    var zipBtn = $('zipBtn');
    zipBtn.disabled = true;
    Chami.setStatus(status, 'Making your ZIP file...');
    try {
      var zip = new JSZip();
      pages.forEach(function (p) { zip.file('page-' + p.num + '.' + p.ext, p.blob); });
      var blob = await zip.generateAsync({ type: 'blob' });
      Chami.downloadBlob(blob, 'chami-pdf-images.zip');
      Chami.setStatus(status, 'Done! ZIP downloaded with ' + pages.length + ' images.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Could not make the ZIP file: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      zipBtn.disabled = pages.length === 0;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    $('convertBtn').addEventListener('click', convert);
    $('zipBtn').addEventListener('click', downloadZip);
    $('clearBtn').addEventListener('click', function () {
      file = null;
      pages.forEach(function (p) { URL.revokeObjectURL(p.url); });
      pages = [];
      renderPages();
      Chami.setStatus($('status'), '');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    });
    renderInfo();
  });
})();
