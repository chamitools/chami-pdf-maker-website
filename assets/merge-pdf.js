/* Merge PDF — runs 100% in your browser with pdf-lib.
   Pages are copied exactly, so there is no quality loss. */
(function () {
  'use strict';
  var files = []; // {name, bytes, pages}
  var $ = function (id) { return document.getElementById(id); };

  function renderList() {
    var list = $('pdfList');
    list.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (i + 1) + '. ' + f.name + ' (' + f.pages + ' pages)';
      li.appendChild(name);
      var up = document.createElement('button');
      up.type = 'button'; up.textContent = 'Up'; up.disabled = i === 0;
      up.addEventListener('click', function () { move(i, -1); });
      var down = document.createElement('button');
      down.type = 'button'; down.textContent = 'Down'; down.disabled = i === files.length - 1;
      down.addEventListener('click', function () { move(i, 1); });
      var del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Remove';
      del.addEventListener('click', function () { files.splice(i, 1); renderAll(); });
      li.appendChild(up); li.appendChild(down); li.appendChild(del);
      list.appendChild(li);
    });
    $('mergeBtn').disabled = files.length < 2;
    $('clearBtn').disabled = files.length === 0;
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= files.length) return;
    var t = files[i]; files[i] = files[j]; files[j] = t;
    renderAll();
  }

  function renderAll() { renderList(); Chami.showResult($('resultBox'), false); }

  async function addFiles(list) {
    var status = $('status');
    if (!Chami.requireLib(function () { return window.PDFLib; }, 'PDF', status)) return;
    var added = 0;
    for (var k = 0; k < list.length; k++) {
      var file = list[k];
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        Chami.setStatus(status, '"' + file.name + '" is not a PDF file. Please choose PDF files only.', 'error');
        continue;
      }
      try {
        var bytes = await Chami.readAsArrayBuffer(file);
        var doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false });
        files.push({ name: file.name, bytes: bytes, pages: doc.getPageCount() });
        added++;
      } catch (e) {
        Chami.setStatus(status, '"' + file.name + '" could not be opened. It may be a damaged or password-protected PDF.', 'error');
      }
    }
    if (added) Chami.setStatus(status, added + ' PDF' + (added > 1 ? 's' : '') + ' added. Reorder with Up / Down, then tap Merge PDFs.', 'ok');
    renderAll();
  }

  async function merge() {
    var status = $('status');
    if (files.length < 2) { Chami.setStatus(status, 'Please add at least 2 PDF files to merge.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.PDFLib; }, 'PDF', status)) return;
    var btn = $('mergeBtn');
    btn.disabled = true;
    Chami.setStatus(status, 'Merging your PDFs...');
    try {
      var merged = await PDFLib.PDFDocument.create();
      var total = 0;
      for (var i = 0; i < files.length; i++) {
        var src = await PDFLib.PDFDocument.load(files[i].bytes);
        var pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { merged.addPage(p); });
        total += pages.length;
        Chami.setStatus(status, 'Merging... ' + (i + 1) + ' of ' + files.length + ' files');
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var out = await merged.save();
      var blob = new Blob([out], { type: 'application/pdf' });
      $('downloadBtn').onclick = function () { Chami.downloadBlob(blob, 'chami-merged.pdf'); };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! ' + files.length + ' PDFs merged into one file with ' + total + ' pages (' + Chami.fmtBytes(blob.size) + ').', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Merging failed. One of the files may be damaged or password-protected.', 'error');
    } finally {
      btn.disabled = files.length < 2;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    $('mergeBtn').addEventListener('click', merge);
    $('clearBtn').addEventListener('click', function () {
      files = [];
      Chami.setStatus($('status'), '');
      renderAll();
    });
    renderList();
  });
})();
