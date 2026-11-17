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
    var count = $('countText');
    if (count) count.textContent = files.length ? files.length + ' PDF' + (files.length > 1 ? 's' : '') + ' added' : '';
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
    var added = 0, failed = 0;
    for (var k = 0; k < list.length; k++) {
      var file = list[k];
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        Chami.setStatus(status, '"' + file.name + '" is not a PDF file. Please choose PDF files only.', 'error');
        failed++;
        continue;
      }
      try {
        var bytes = await Chami.readAsArrayBuffer(file);
        var doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false });
        files.push({ name: file.name, bytes: bytes, pages: doc.getPageCount() });
        added++;
      } catch (e) {
        failed++;
        Chami.setStatus(status, 'Could not open "' + file.name + '": ' + (e && e.message ? e.message : e), 'error');
      }
    }
    if (added) {
      var msg = added + ' PDF' + (added > 1 ? 's' : '') + ' added. Reorder with Up / Down, then tap Merge PDFs.';
      if (failed) msg += ' ' + failed + ' file' + (failed > 1 ? 's' : '') + ' could not be added.';
      Chami.setStatus(status, msg, 'ok');
    }
    renderAll();
  }

  async function merge() {
    var status = $('status');
    if (files.length < 2) { Chami.setStatus(status, 'Please add at least 2 PDF files to merge.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.PDFLib; }, 'PDF', status)) return;
    var btn = $('mergeBtn');
    btn.disabled = true;
    $('clearBtn').disabled = true;
    // Snapshot the list: if the user clears or adds PDFs mid-merge, the
    // output must still be exactly the files that were queued.
    // (pdf-lib does not detach the stored ArrayBuffers — verified: the
    // same bytes load twice — so reusing files[i].bytes here is safe.)
    var list = files.slice();
    Chami.setStatus(status, 'Merging your PDFs...');
    try {
      var merged = await PDFLib.PDFDocument.create();
      var total = 0;
      for (var i = 0; i < list.length; i++) {
        var src = await PDFLib.PDFDocument.load(list[i].bytes);
        var pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { merged.addPage(p); });
        total += pages.length;
        Chami.setStatus(status, 'Merging... ' + (i + 1) + ' of ' + list.length + ' files');
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var out = await merged.save();
      var blob = new Blob([out], { type: 'application/pdf' });
      $('downloadBtn').onclick = function () { Chami.downloadBlob(blob, 'chami-merged.pdf'); };
      $('previewBtn').onclick = function () {
        Chami.openPreview('Merged PDF — ' + total + ' pages', blob, 'pdf');
      };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! ' + list.length + ' PDFs merged into one file with ' + total + ' pages (' + Chami.fmtBytes(blob.size) + ').', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Merging failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      renderList();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    var addMore = $('addMoreBtn');
    if (addMore) addMore.addEventListener('click', function () { $('fileInput').click(); });
    $('mergeBtn').addEventListener('click', merge);
    $('clearBtn').addEventListener('click', function () {
      files = [];
      Chami.setStatus($('status'), '');
      renderAll();
    });
    renderList();
  });
})();
