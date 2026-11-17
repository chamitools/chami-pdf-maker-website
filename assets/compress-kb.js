/* Compress KB — shrink one image or one PDF to a target KB size, in your browser.
   Images: re-encode JPEG at decreasing quality, then smaller dimensions.
   PDFs: render pages at decreasing scale/quality and rebuild the PDF.
   If the target cannot be reached, the smallest possible file is still offered
   and its size is stated plainly. Text in a compressed PDF becomes an image. */
(function () {
  'use strict';
  var file = null; // {name, type, size, dataUrl?, bytes?, width?, height?, pages?}
  var outBlob = null;
  var $ = function (id) { return document.getElementById(id); };

  var TARGETS = { '100': 100, '200': 200, '500': 500, '1000': 1000 };

  function targetKb() {
    var picked = document.querySelector('input[name="target"]:checked');
    if (!picked) return null;
    if (picked.value === 'custom') {
      var n = parseFloat($('customKb').value);
      return (!isNaN(n) && n > 0) ? n : null;
    }
    return TARGETS[picked.value] || null;
  }

  function renderInfo() {
    var info = $('fileInfo');
    if (!file) { info.textContent = ''; $('compressBtn').disabled = true; return; }
    var kind = file.type === 'pdf' ? file.pages + ' pages' : file.width + ' x ' + file.height + ' px';
    info.textContent = file.name + ' — ' + Chami.fmtBytes(file.size) + ' (' + kind + '). Pick a target size and tap Compress to KB.';
    $('compressBtn').disabled = false;
    $('clearBtn').disabled = false;
  }

  async function addFiles(list) {
    var status = $('status');
    var f = list[0];
    if (!f) return;
    var isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    var isImg = /^image\//.test(f.type);
    if (!isPdf && !isImg) {
      Chami.setStatus(status, '"' + f.name + '" is not an image or PDF file. Please choose a JPG, PNG, WEBP image or a PDF.', 'error');
      return;
    }
    try {
      if (isImg) {
        var dataUrl = await Chami.readAsDataURL(f);
        var img = await Chami.loadImage(dataUrl);
        file = { name: f.name, type: 'image', size: f.size, dataUrl: dataUrl, width: img.naturalWidth, height: img.naturalHeight };
      } else {
        if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
        var bytes = await Chami.readAsArrayBuffer(f);
        // Pass a COPY: pdf.js transfers the buffer to its worker, detaching it.
        var pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
        file = { name: f.name, type: 'pdf', size: f.size, bytes: bytes, pages: pdf.numPages };
        await pdf.destroy();
      }
      outBlob = null;
      Chami.setStatus(status, 'File loaded.', 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      Chami.setStatus(status, 'Could not open that file: ' + (e && e.message ? e.message : e), 'error');
    }
  }

  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not encode the image.')); }, 'image/jpeg', quality);
    });
  }

  async function compressImage(targetBytes) {
    var img = await Chami.loadImage(file.dataUrl);
    var best = null; // smallest blob found at any step
    var scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3];
    for (var s = 0; s < scales.length; s++) {
      var w = Math.max(1, Math.round(file.width * scales[s]));
      var h = Math.max(1, Math.round(file.height * scales[s]));
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      var lo = 0.10, hi = 0.95, fit = null;
      for (var i = 0; i < 6; i++) {
        var q = (lo + hi) / 2;
        var test = await canvasToBlob(canvas, q);
        if (!best || test.size < best.size) best = test;
        if (test.size <= targetBytes) { fit = test; lo = q; } else { hi = q; }
      }
      if (fit) return { blob: fit, reached: true };
      Chami.setStatus($('status'), 'Still too big — trying a smaller image (' + Math.round(scales[s] * 100) + '% size)...');
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    return { blob: best, reached: false };
  }

  var PDF_STEPS = [
    { scale: 2.0, jpeg: 0.85 },
    { scale: 1.5, jpeg: 0.70 },
    { scale: 1.2, jpeg: 0.60 },
    { scale: 1.0, jpeg: 0.50 },
    { scale: 0.8, jpeg: 0.40 },
    { scale: 0.6, jpeg: 0.30 }
  ];

  async function compressPdf(targetBytes) {
    var pdf = await pdfjsLib.getDocument({ data: file.bytes.slice(0) }).promise;
    var jsPDF = window.jspdf.jsPDF;
    var best = null;
    for (var s = 0; s < PDF_STEPS.length; s++) {
      var st = PDF_STEPS[s];
      var doc = null;
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var viewport = page.getViewport({ scale: st.scale });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        var imgData = canvas.toDataURL('image/jpeg', st.jpeg);
        var vp1 = page.getViewport({ scale: 1 });
        var pageW = vp1.width, pageH = vp1.height;
        var orientation = pageW >= pageH ? 'landscape' : 'portrait';
        if (i === 1) doc = new jsPDF({ unit: 'pt', format: [pageW, pageH], orientation: orientation, compress: true });
        else doc.addPage([pageW, pageH], orientation);
        doc.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
      }
      var blob = doc.output('blob');
      if (!best || blob.size < best.size) best = blob;
      Chami.setStatus($('status'), 'Trying quality ' + (s + 1) + ' of ' + PDF_STEPS.length + ' — now ' + Chami.fmtBytes(blob.size) + '...');
      await new Promise(function (r) { setTimeout(r, 0); });
      if (blob.size <= targetBytes) { await pdf.destroy(); return { blob: blob, reached: true }; }
    }
    await pdf.destroy();
    return { blob: best, reached: false };
  }

  async function compress() {
    var status = $('status');
    if (!file) { Chami.setStatus(status, 'Please choose an image or PDF first.', 'error'); return; }
    var kb = targetKb();
    if (!kb) { Chami.setStatus(status, 'Please pick a target size, or enter a custom KB number.', 'error'); return; }
    if (file.type === 'pdf') {
      if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
      if (!Chami.requireLib(function () { return window.jspdf && window.jspdf.jsPDF; }, 'PDF', status)) return;
    }
    var targetBytes = Math.round(kb * 1024);
    var btn = $('compressBtn');
    btn.disabled = true;
    Chami.showResult($('resultBox'), false);
    try {
      Chami.setStatus(status, 'Compressing to under ' + kb + ' KB...');
      var res = file.type === 'image' ? await compressImage(targetBytes) : await compressPdf(targetBytes);
      outBlob = res.blob;
      var base = file.name.replace(/\.[^.]+$/, '');
      var ext = file.type === 'image' ? 'jpg' : 'pdf';
      $('sizeInfo').textContent = 'Before: ' + Chami.fmtBytes(file.size) + '  →  After: ' + Chami.fmtBytes(outBlob.size) +
        (res.reached ? '  (under your ' + kb + ' KB target)' : '  (smallest possible is ' + Chami.fmtBytes(outBlob.size) + ' — still above your ' + kb + ' KB target)');
      $('downloadBtn').onclick = function () { Chami.downloadBlob(outBlob, base + '-under-' + kb + 'kb.' + ext); };
      $('previewBtn').onclick = function () {
        var kind = file.type === 'pdf' ? 'pdf' : 'image';
        Chami.openPreview('Compressed file — ' + Chami.fmtBytes(outBlob.size), outBlob, kind);
      };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, res.reached ? 'Done! Your file is under ' + kb + ' KB.' : 'Done — this is the smallest it can go: ' + Chami.fmtBytes(outBlob.size) + '.', res.reached ? 'ok' : '');
    } catch (e) {
      Chami.setStatus(status, 'Compression failed: ' + (e && e.message ? e.message : e), 'error');
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
      file = null; outBlob = null;
      Chami.setStatus($('status'), '');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    });
    renderInfo();
  });
})();
