/* Split PDF — runs 100% in your browser with pdf-lib.
   Modes: page range (e.g. 1-3, 5, 7-9) or every page as its own PDF in a ZIP. */
(function () {
  'use strict';
  var file = null; // {name, bytes, pages}
  var $ = function (id) { return document.getElementById(id); };

  function parseRanges(text, maxPage) {
    var pages = [];
    var seen = {};
    var parts = text.split(',');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (a < 1 || b > maxPage) throw new Error('range');
        if (a > b) throw new Error('order');
        for (var p = a; p <= b; p++) { if (!seen[p]) { seen[p] = 1; pages.push(p); } }
      } else if (/^\d+$/.test(part)) {
        var n = parseInt(part, 10);
        if (n < 1 || n > maxPage) throw new Error('range');
        if (!seen[n]) { seen[n] = 1; pages.push(n); }
      } else {
        throw new Error('format');
      }
    }
    // Keep the user's own order (e.g. "5, 1-2" extracts page 5 first);
    // do not silently re-sort.
    return pages;
  }

  function renderInfo() {
    var info = $('fileInfo');
    if (!file) { info.textContent = ''; $('splitBtn').disabled = true; $('clearBtn').disabled = true; return; }
    info.textContent = file.name + ' — ' + file.pages + ' pages. Enter the pages you want to keep.';
    $('splitBtn').disabled = false;
    $('clearBtn').disabled = false;
  }

  async function addFiles(list) {
    var status = $('status');
    if (!Chami.requireLib(function () { return window.PDFLib; }, 'PDF', status)) return;
    var f = list[0];
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      Chami.setStatus(status, '"' + f.name + '" is not a PDF file. Please choose a PDF file.', 'error');
      return;
    }
    try {
      var bytes = await Chami.readAsArrayBuffer(f);
      var doc = await PDFLib.PDFDocument.load(bytes);
      file = { name: f.name, bytes: bytes, pages: doc.getPageCount() };
      Chami.setStatus(status, 'PDF loaded.' + (list.length > 1 ? ' Only the first PDF was used.' : ''), 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      Chami.setStatus(status, 'Could not open that PDF: ' + (e && e.message ? e.message : e), 'error');
    }
  }

  async function split() {
    var status = $('status');
    if (!file) { Chami.setStatus(status, 'Please choose a PDF file first.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.PDFLib; }, 'PDF', status)) return;
    var checked = document.querySelector('input[name="splitMode"]:checked');
    var mode = checked ? checked.value : 'range';
    var btn = $('splitBtn');
    btn.disabled = true;
    $('clearBtn').disabled = true;
    // Snapshot the file: if the user clears or drops a new PDF mid-split,
    // the output must still come from the file that was queued.
    var srcFile = file;
    try {
      var src = await PDFLib.PDFDocument.load(srcFile.bytes);
      if (mode === 'all') {
        if (!Chami.requireLib(function () { return window.JSZip; }, 'ZIP', status)) { btn.disabled = false; return; }
        Chami.setStatus(status, 'Splitting into ' + srcFile.pages + ' separate PDFs...');
        var zip = new JSZip();
        var firstPageBytes = null;
        for (var i = 0; i < srcFile.pages; i++) {
          var one = await PDFLib.PDFDocument.create();
          var copied = await one.copyPages(src, [i]);
          one.addPage(copied[0]);
          var savedPage = await one.save();
          if (i === 0) firstPageBytes = savedPage;
          zip.file('page-' + (i + 1) + '.pdf', savedPage);
          if (i % 10 === 0) await new Promise(function (r) { setTimeout(r, 0); });
        }
        var blob = await zip.generateAsync({ type: 'blob' });
        $('downloadBtn').textContent = 'Download ZIP (' + srcFile.pages + ' PDFs)';
        $('downloadBtn').onclick = function () { Chami.downloadBlob(blob, 'chami-split-pages.zip'); };
        // A ZIP file cannot be previewed, so preview the first extracted page.
        $('previewBtn').onclick = function () {
          var firstPage = new Blob([firstPageBytes], { type: 'application/pdf' });
          Chami.openPreview('Split pages — page 1 of ' + srcFile.pages + ' (preview)', firstPage, 'pdf');
        };
        Chami.showResult($('resultBox'), true);
        Chami.setStatus(status, 'Done! ' + srcFile.pages + ' separate PDFs in one ZIP file.', 'ok');
      } else {
        var pages;
        try {
          pages = parseRanges($('rangeInput').value, srcFile.pages);
        } catch (e) {
          Chami.setStatus(status, e.message === 'format'
            ? 'Please use numbers and dashes only, for example: 1-3, 5, 7-9.'
            : e.message === 'order'
            ? 'Please list the smaller page first, for example: 2-5.'
            : 'Those page numbers are outside this PDF. It has ' + srcFile.pages + ' pages.', 'error');
          btn.disabled = false;
          return;
        }
        if (!pages.length) {
          Chami.setStatus(status, 'Please enter at least one page, for example: 1-3.', 'error');
          btn.disabled = false;
          return;
        }
        Chami.setStatus(status, 'Extracting ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + '...');
        var out = await PDFLib.PDFDocument.create();
        var copiedPages = await out.copyPages(src, pages.map(function (p) { return p - 1; }));
        copiedPages.forEach(function (p) { out.addPage(p); });
        var bytes = await out.save();
        var pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        $('downloadBtn').textContent = 'Download PDF (' + pages.length + ' pages)';
        $('downloadBtn').onclick = function () { Chami.downloadBlob(pdfBlob, 'chami-split.pdf'); };
        $('previewBtn').onclick = function () {
          Chami.openPreview('Split PDF — ' + pages.length + ' page' + (pages.length > 1 ? 's' : ''), pdfBlob, 'pdf');
        };
        Chami.showResult($('resultBox'), true);
        Chami.setStatus(status, 'Done! Extracted ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + ' into a new PDF.', 'ok');
      }
    } catch (e) {
      Chami.setStatus(status, 'Splitting failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      renderInfo();
    }
  }

  // The page-range box does nothing in "Every page separately" mode,
  // so disable it there instead of letting it look applicable.
  function syncRangeInput() {
    var checked = document.querySelector('input[name="splitMode"]:checked');
    $('rangeInput').disabled = !!checked && checked.value === 'all';
  }

  document.addEventListener('DOMContentLoaded', function () {
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    document.querySelectorAll('input[name="splitMode"]').forEach(function (r) {
      r.addEventListener('change', syncRangeInput);
    });
    syncRangeInput();
    $('splitBtn').addEventListener('click', split);
    $('clearBtn').addEventListener('click', function () {
      file = null;
      $('rangeInput').value = '';
      $('downloadBtn').textContent = 'Download PDF';
      Chami.setStatus($('status'), '');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    });
    renderInfo();
  });
})();
