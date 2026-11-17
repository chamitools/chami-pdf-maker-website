/* Compress PDF — runs 100% in your browser.
   Honest method: each page is rendered to an image at the chosen quality
   and the PDF is rebuilt from those images. Scanned and image-heavy PDFs
   shrink the most. Text in the compressed file becomes an image, so it is
   no longer selectable — the page says this plainly. */
(function () {
  'use strict';
  var file = null; // {name, bytes, size}
  var $ = function (id) { return document.getElementById(id); };

  var QUALITY = {
    high:   { scale: 2.0, jpeg: 0.85, label: 'High' },
    medium: { scale: 1.5, jpeg: 0.70, label: 'Medium' },
    low:    { scale: 1.0, jpeg: 0.50, label: 'Low' }
  };

  function renderInfo() {
    var info = $('fileInfo');
    if (!file) { info.textContent = ''; $('compressBtn').disabled = true; return; }
    info.textContent = file.name + ' — original size ' + Chami.fmtBytes(file.size) + '. Choose a quality and tap Compress PDF.';
    $('compressBtn').disabled = false;
    $('clearBtn').disabled = false;
  }

  async function addFiles(list) {
    var status = $('status');
    if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
    var f = list[0];
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      Chami.setStatus(status, '"' + f.name + '" is not a PDF file. Please choose a PDF file.', 'error');
      return;
    }
    try {
      var bytes = await Chami.readAsArrayBuffer(f);
      var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      file = { name: f.name, bytes: bytes, size: f.size, pages: pdf.numPages };
      await pdf.destroy();
      Chami.setStatus(status, 'PDF loaded — ' + file.pages + ' pages.', 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      Chami.setStatus(status, 'That PDF could not be opened. It may be damaged or password-protected.', 'error');
    }
  }

  async function compress() {
    var status = $('status');
    if (!file) { Chami.setStatus(status, 'Please choose a PDF file first.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
    if (!Chami.requireLib(function () { return window.jspdf && window.jspdf.jsPDF; }, 'PDF', status)) return;
    var q = QUALITY[$('quality').value] || QUALITY.medium;
    var btn = $('compressBtn');
    btn.disabled = true;
    Chami.showResult($('resultBox'), false);
    try {
      var pdf = await pdfjsLib.getDocument({ data: file.bytes }).promise;
      var jsPDF = window.jspdf.jsPDF;
      var doc = null;
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var viewport = page.getViewport({ scale: q.scale });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        var ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        var imgData = canvas.toDataURL('image/jpeg', q.jpeg);
        // Use the PDF page size in points, so the compressed file keeps the same page size.
        var vp1 = page.getViewport({ scale: 1 });
        var pageW = vp1.width, pageH = vp1.height;
        var orientation = pageW >= pageH ? 'landscape' : 'portrait';
        if (i === 1) doc = new jsPDF({ unit: 'pt', format: [pageW, pageH], orientation: orientation, compress: true });
        else doc.addPage([pageW, pageH], orientation);
        var bin = atob(imgData.split(',')[1]);
        var bytes = new Uint8Array(bin.length);
        for (var b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
        doc.addImage(bytes, 'JPEG', 0, 0, pageW, pageH);
        Chami.setStatus(status, 'Compressing... page ' + i + ' of ' + pdf.numPages + ' (' + q.label + ' quality)');
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      await pdf.destroy();
      var out = doc.output('blob');
      var saved = file.size - out.size;
      var pct = file.size > 0 ? Math.round(saved / file.size * 100) : 0;
      $('sizeInfo').textContent = 'Before: ' + Chami.fmtBytes(file.size) + '  →  After: ' + Chami.fmtBytes(out.size) +
        (saved > 0 ? '  (saved ' + pct + '%)' : '  (no size saved — this PDF is mostly text, which is already small)');
      $('downloadBtn').onclick = function () { Chami.downloadBlob(out, 'chami-compressed.pdf'); };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! Your compressed PDF is ready.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Compression failed. The file may be damaged or password-protected.', 'error');
    } finally {
      btn.disabled = !file;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    $('compressBtn').addEventListener('click', compress);
    $('clearBtn').addEventListener('click', function () {
      file = null;
      Chami.setStatus($('status'), '');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    });
    renderInfo();
  });
})();
