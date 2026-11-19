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
    if (!file) { info.textContent = ''; $('compressBtn').disabled = true; $('clearBtn').disabled = true; return; }
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
      // Pass a COPY to pdf.js: it transfers the buffer to its worker, which
      // detaches the original. The stored bytes must stay usable for the
      // compress step, so every getDocument call gets a fresh slice.
      var pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      file = { name: f.name, bytes: bytes, size: f.size, pages: pdf.numPages };
      await pdf.destroy();
      Chami.setStatus(status, 'PDF loaded — ' + file.pages + ' pages.' + (list.length > 1 ? ' Only the first PDF was used.' : ''), 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      if (/password/i.test(msg)) msg = 'This PDF is password-protected. Please use an unlocked copy — this tool cannot open password-protected PDFs.';
      Chami.setStatus(status, 'Could not open that PDF: ' + msg, 'error');
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
    $('clearBtn').disabled = true;
    // Snapshot the file: if the user clears or drops a new PDF mid-run,
    // the size math and output must still use the file that was queued.
    var srcFile = file;
    Chami.showResult($('resultBox'), false);
    $('sizeInfo').textContent = '';
    var pdf = null;
    try {
      pdf = await pdfjsLib.getDocument({ data: srcFile.bytes.slice(0) }).promise;
      if (!pdf.numPages) throw new Error('That PDF has no pages to compress.');
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
        doc.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
        Chami.setStatus(status, 'Compressing... page ' + i + ' of ' + pdf.numPages + ' (' + q.label + ' quality)');
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var rebuilt = doc.output('blob');
      // Text-only PDFs can come out BIGGER once every page becomes an image.
      // Never hand the user a bigger file: keep the original instead.
      var keepOriginal = rebuilt.size >= srcFile.size;
      var out = keepOriginal ? new Blob([srcFile.bytes], { type: 'application/pdf' }) : rebuilt;
      var saved = srcFile.size - out.size;
      var pct = srcFile.size > 0 ? Math.round(saved / srcFile.size * 100) : 0;
      $('sizeInfo').textContent = 'Before: ' + Chami.fmtBytes(srcFile.size) + '  →  After: ' + Chami.fmtBytes(out.size) +
        (keepOriginal ? '  (this PDF is mostly text and already small — rebuilding it would make it bigger, so your original is kept as-is)'
          : '  (saved ' + pct + '%)');
      $('downloadBtn').onclick = function () { Chami.downloadBlob(out, keepOriginal ? srcFile.name : 'chami-compressed.pdf'); };
      $('previewBtn').onclick = function () {
        Chami.openPreview((keepOriginal ? 'Original PDF — ' : 'Compressed PDF — ') + Chami.fmtBytes(out.size), out, 'pdf');
      };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, keepOriginal ? 'Done — this PDF is already as small as this tool can make it, so the original is kept.' : 'Done! Your compressed PDF is ready.', keepOriginal ? '' : 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Compression failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      // Destroy even when a page render throws mid-loop; otherwise the
      // pdf.js document (and its worker) leaks and the next run reuses a
      // half-dead document.
      if (pdf) { try { await pdf.destroy(); } catch (ignored) { /* already torn down */ } }
      renderInfo();
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
      $('sizeInfo').textContent = '';
      Chami.showResult($('resultBox'), false);
      renderInfo();
    });
    renderInfo();
  });
})();
