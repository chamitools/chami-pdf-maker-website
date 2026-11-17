/* PDF to Images — runs 100% in your browser with pdf.js.
   Every page is rendered at 2x scale and downloaded as PNG or JPG,
   one by one or all together in a ZIP. */
(function () {
  'use strict';
  var file = null; // {name, bytes}
  var pages = [];  // {num, blob, url, ext}
  var $ = function (id) { return document.getElementById(id); };

  function renderInfo() {
    var info = $('fileInfo');
    if (!file) { info.textContent = ''; $('convertBtn').disabled = true; return; }
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
      file = { name: f.name, bytes: bytes, pages: pdf.numPages };
      await pdf.destroy();
      pages.forEach(function (p) { URL.revokeObjectURL(p.url); });
      pages = [];
      renderPages();
      Chami.setStatus(status, 'PDF loaded — ' + file.pages + ' pages.', 'ok');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    } catch (e) {
      Chami.setStatus(status, 'That PDF could not be opened. It may be damaged or password-protected.', 'error');
    }
  }

  function canvasToBlob(canvas, format) {
    return new Promise(function (resolve, reject) {
      var type = format === 'jpg' ? 'image/jpeg' : 'image/png';
      var q = format === 'jpg' ? 0.92 : undefined;
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('render')); }, type, q);
    });
  }

  async function convert() {
    var status = $('status');
    if (!file) { Chami.setStatus(status, 'Please choose a PDF file first.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.pdfjsLib; }, 'PDF', status)) return;
    var format = $('format').value; // png or jpg
    var btn = $('convertBtn');
    btn.disabled = true;
    Chami.showResult($('resultBox'), false);
    try {
      var pdf = await pdfjsLib.getDocument({ data: file.bytes }).promise;
      pages.forEach(function (p) { URL.revokeObjectURL(p.url); });
      pages = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var viewport = page.getViewport({ scale: 2 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        var blob = await canvasToBlob(canvas, format);
        pages.push({ num: i, blob: blob, url: URL.createObjectURL(blob), ext: format });
        Chami.setStatus(status, 'Converting... page ' + i + ' of ' + pdf.numPages);
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      await pdf.destroy();
      renderPages();
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + ' converted to ' + format.toUpperCase() + ' at 2x quality.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Conversion failed. The file may be damaged or password-protected.', 'error');
    } finally {
      btn.disabled = !file;
    }
  }

  async function downloadZip() {
    var status = $('status');
    if (!pages.length) return;
    if (!Chami.requireLib(function () { return window.JSZip; }, 'ZIP', status)) return;
    Chami.setStatus(status, 'Making your ZIP file...');
    var zip = new JSZip();
    pages.forEach(function (p) { zip.file('page-' + p.num + '.' + p.ext, p.blob); });
    var blob = await zip.generateAsync({ type: 'blob' });
    Chami.downloadBlob(blob, 'chami-pdf-images.zip');
    Chami.setStatus(status, 'Done! ZIP downloaded with ' + pages.length + ' images.', 'ok');
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
