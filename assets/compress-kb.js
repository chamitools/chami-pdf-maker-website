/* Compress KB — shrink one image or one PDF to a target KB size, in your browser.
   Images: re-encode JPEG at decreasing quality, then smaller dimensions.
   PDFs: render pages at decreasing scale/quality and rebuild the PDF.
   If the target cannot be reached, the smallest possible file is still offered
   and its size is stated plainly. Text in a compressed PDF becomes an image. */
(function () {
  'use strict';
  var file = null; // {name, type, size, dataUrl?, bytes?, width?, height?, pages?}
  var outBlob = null;
  var busy = false; // a compression is running; ignore new files until it finishes
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
    if (!file) { info.textContent = ''; $('compressBtn').disabled = true; $('clearBtn').disabled = true; return; }
    var kind = file.type === 'pdf' ? file.pages + ' pages' : file.width + ' x ' + file.height + ' px';
    info.textContent = file.name + ' — ' + Chami.fmtBytes(file.size) + ' (' + kind + '). Pick a target size and tap Compress to KB.';
    $('compressBtn').disabled = false;
    $('clearBtn').disabled = false;
  }

  async function addFiles(list) {
    var status = $('status');
    if (busy) { Chami.setStatus(status, 'Please wait for the current compression to finish before choosing another file.', 'error'); return; }
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
      Chami.setStatus(status, list.length > 1 ? 'File loaded — only the first of ' + list.length + ' files is used; this tool takes one file at a time.' : 'File loaded.', 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      if (/password/i.test(msg)) msg = 'This PDF is password-protected. Please use an unlocked copy — this tool cannot open password-protected PDFs.';
      Chami.setStatus(status, 'Could not open that file: ' + msg, 'error');
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
      // White background: JPEG has no transparency, so a transparent PNG
      // would otherwise come out with a black background.
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
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
    // The binary search above never probes the very lowest quality at the
    // smallest size, so the smallest file it saw may not be the smallest
    // possible. Probe q=0.10 at the smallest scale before giving up.
    var tiny = await canvasToBlob(canvas, 0.10);
    if (!best || tiny.size < best.size) best = tiny;
    return { blob: best, reached: false };
  }

  var PDF_STEPS = [
    { scale: 2.0, jpeg: 0.85 },
    { scale: 1.5, jpeg: 0.70 },
    { scale: 1.2, jpeg: 0.60 },
    { scale: 1.0, jpeg: 0.50 },
    { scale: 0.8, jpeg: 0.40 },
    { scale: 0.6, jpeg: 0.30 },
    // Last resorts: the old floor was ~293 KB for a 19-page text PDF, so a
    // 200 KB (or 100 KB) target was unreachable. These two steps get it
    // there (measured: 138 KB, then 86 KB) at the cost of low resolution —
    // only ever tried after every sharper step has failed.
    { scale: 0.45, jpeg: 0.22 },
    { scale: 0.35, jpeg: 0.18 }
  ];

  async function compressPdf(targetBytes) {
    var pdf = await pdfjsLib.getDocument({ data: file.bytes.slice(0) }).promise;
    var jsPDF = window.jspdf.jsPDF;
    var best = null;
    try {
      for (var s = 0; s < PDF_STEPS.length; s++) {
        var st = PDF_STEPS[s];
        var doc = null;
        for (var i = 1; i <= pdf.numPages; i++) {
          var page = await pdf.getPage(i);
          var viewport = page.getViewport({ scale: st.scale });
          var canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          var ctx = canvas.getContext('2d');
          // White background: JPEG has no transparency, so a page with a
          // transparent background would otherwise come out black.
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: viewport }).promise;
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
        if (blob.size <= targetBytes) return { blob: blob, reached: true };
      }
    } finally {
      await pdf.destroy();
    }
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
    busy = true;
    Chami.showResult($('resultBox'), false);
    try {
      Chami.setStatus(status, 'Compressing to under ' + kb + ' KB...');
      var res;
      if (file.size <= targetBytes) {
        // Already under target: re-encoding would only lose quality (and
        // can even make the file BIGGER), so keep the original as-is.
        var origBlob = file.type === 'image'
          ? await (await fetch(file.dataUrl)).blob()
          : new Blob([file.bytes], { type: 'application/pdf' });
        res = { blob: origBlob, reached: true, alreadyUnder: true };
      } else {
        res = file.type === 'image' ? await compressImage(targetBytes) : await compressPdf(targetBytes);
      }
      outBlob = res.blob;
      var base = file.name.replace(/\.[^.]+$/, '');
      // A kept-as-is original must keep its real extension: naming a PNG
      // ".jpg" would hand the user a mislabelled file.
      var ext;
      if (res.alreadyUnder) {
        var m = file.name.match(/\.([^.]+)$/);
        ext = m ? m[1].toLowerCase() : (file.type === 'image' ? 'jpg' : 'pdf');
      } else {
        ext = file.type === 'image' ? 'jpg' : 'pdf';
      }
      var grew = !res.alreadyUnder && outBlob.size > file.size;
      $('sizeInfo').textContent = 'Before: ' + Chami.fmtBytes(file.size) + '  →  After: ' + Chami.fmtBytes(outBlob.size) +
        (res.alreadyUnder ? '  (already under your ' + kb + ' KB target — original kept as-is, no quality lost)'
          : res.reached ? '  (under your ' + kb + ' KB target)'
          : '  (smallest possible is ' + Chami.fmtBytes(outBlob.size) + ' — still above your ' + kb + ' KB target)') +
        (grew ? '  Note: that is larger than the original, so this file cannot be shrunk further by this tool.' : '');
      $('downloadBtn').onclick = function () { Chami.downloadBlob(outBlob, base + '-under-' + kb + 'kb.' + ext); };
      $('previewBtn').onclick = function () {
        var kind = file.type === 'pdf' ? 'pdf' : 'image';
        Chami.openPreview('Compressed file — ' + Chami.fmtBytes(outBlob.size), outBlob, kind);
      };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status,
        res.alreadyUnder ? 'Done! Your file was already under ' + kb + ' KB, so the original is kept as-is.' :
        res.reached ? 'Done! Your file is under ' + kb + ' KB.' :
        grew ? 'Done — but the smallest this tool can make is ' + Chami.fmtBytes(outBlob.size) + ', larger than the original.' :
        'Done — this is the smallest it can go: ' + Chami.fmtBytes(outBlob.size) + '.',
        res.reached && !grew ? 'ok' : '');
    } catch (e) {
      Chami.setStatus(status, 'Compression failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      busy = false;
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
