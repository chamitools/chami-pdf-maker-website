/* Merge PDF — runs 100% in your browser with pdf-lib.
   Pages are copied exactly, so there is no quality loss.
   v6: merge logic unchanged. Display-only additions are marked "v7 display":
   progress bar + button spinner, before/after size in the result card,
   panda empty state, drag-to-reorder (same Pointer Events code the
   Image to PDF page already uses), and a Start over button. */
(function () {
  'use strict';
  var files = []; // {name, bytes, pages}
  var $ = function (id) { return document.getElementById(id); };

  function renderList() {
    var list = $('pdfList');
    list.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li');
      li.dataset.idx = i; /* v7 display: drag-to-reorder target */
      /* v7 display: drag handle (Up / Down buttons stay as the fallback). */
      var grip = document.createElement('span');
      grip.className = 'drag-handle';
      grip.textContent = '\u283F';
      grip.title = 'Drag to reorder';
      grip.setAttribute('aria-hidden', 'true');
      li.appendChild(grip);
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (i + 1) + '. ' + f.name + ' (' + f.pages + ' pages)';
      li.appendChild(name);
      /* v7 display: per-file size. */
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = Chami.fmtBytes(f.bytes.byteLength);
      li.appendChild(meta);
      var up = document.createElement('button');
      up.type = 'button'; up.textContent = 'Up'; up.disabled = i === 0;
      up.setAttribute('aria-label', 'Move ' + f.name + ' up');
      up.addEventListener('click', function () { move(i, -1); });
      var down = document.createElement('button');
      down.type = 'button'; down.textContent = 'Down'; down.disabled = i === files.length - 1;
      down.setAttribute('aria-label', 'Move ' + f.name + ' down');
      down.addEventListener('click', function () { move(i, 1); });
      var del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Remove';
      del.setAttribute('aria-label', 'Remove ' + f.name);
      del.addEventListener('click', function () { files.splice(i, 1); renderAll(); });
      li.appendChild(up); li.appendChild(down); li.appendChild(del);
      list.appendChild(li);
    });
    $('mergeBtn').disabled = files.length < 2;
    $('clearBtn').disabled = files.length === 0;
    var count = $('countText');
    if (count) count.textContent = files.length ? files.length + ' PDF' + (files.length > 1 ? 's' : '') + ' added' : '';
    /* v7 display: panda empty state while no files are queued. */
    var empty = $('emptyState');
    if (empty) empty.hidden = files.length > 0;
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= files.length) return;
    var t = files[i]; files[i] = files[j]; files[j] = t;
    renderAll();
  }

  /* ---------- Drag to reorder (touch + mouse, Pointer Events) ----------
     Same code as the Image to PDF page: the handle is the only grab
     point, so swiping anywhere else still scrolls the page. The dragged
     row floats under the finger and a dashed gap shows where it will
     land; on release the files array is reordered, so the merged PDF
     follows the new order. Up / Down buttons stay as the alternative. */
  var drag = null; // {container, item, ph, startIdx, targetIdx, axis, grabDX, grabDY}

  function dragPhIndex() {
    var idx = 0;
    var kids = drag.container.children;
    for (var k = 0; k < kids.length; k++) {
      if (kids[k] === drag.ph) return idx;
      if (kids[k] !== drag.item) idx++;
    }
    return idx;
  }

  function dragStart(e, item, container, axis) {
    if (drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    var rect = item.getBoundingClientRect();
    var ph = document.createElement(item.tagName === 'LI' ? 'li' : 'div');
    ph.className = 'drag-gap';
    ph.style.height = rect.height + 'px';
    ph.setAttribute('aria-hidden', 'true');
    item.parentNode.insertBefore(ph, item.nextSibling);
    drag = {
      container: container, item: item, ph: ph,
      startIdx: +item.dataset.idx, targetIdx: +item.dataset.idx,
      axis: axis,
      grabDX: e.clientX - rect.left, grabDY: e.clientY - rect.top
    };
    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.left = (e.clientX - drag.grabDX) + 'px';
    item.style.top = (e.clientY - drag.grabDY) + 'px';
    item.style.width = rect.width + 'px';
    item.style.height = rect.height + 'px';
    item.style.margin = '0';
    item.style.zIndex = '60';
    item.style.pointerEvents = 'none';
    document.body.classList.add('dragging-active');
    try { item.setPointerCapture(e.pointerId); } catch (err) { /* older browsers: document listeners still fire */ }
  }

  function dragMove(e) {
    if (!drag) return;
    e.preventDefault();
    var d = drag;
    d.item.style.left = (e.clientX - d.grabDX) + 'px';
    d.item.style.top = (e.clientY - d.grabDY) + 'px';
    /* Auto-scroll when the finger nears the top / bottom edge. */
    if (e.clientY < 70) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var target = (under && under.closest) ? under.closest('[data-idx]') : null;
    if (target && target !== d.item && d.container.contains(target)) {
      var r = target.getBoundingClientRect();
      var after = e.clientY > r.top + r.height / 2;
      var ref = after ? target.nextSibling : target;
      if (ref !== d.ph && ref !== d.ph.nextSibling) {
        d.container.insertBefore(d.ph, ref);
        d.targetIdx = dragPhIndex();
      }
    } else {
      /* Pointer is past the ends: pin the gap to the start or the end. */
      var kids = [];
      var all = d.container.children;
      for (var k = 0; k < all.length; k++) {
        if (all[k] !== d.item && all[k].dataset && all[k].dataset.idx !== undefined) kids.push(all[k]);
      }
      if (kids.length) {
        var first = kids[0].getBoundingClientRect();
        var last = kids[kids.length - 1].getBoundingClientRect();
        if (e.clientY < first.top) {
          d.container.insertBefore(d.ph, kids[0]);
          d.targetIdx = dragPhIndex();
        } else if (e.clientY > last.bottom) {
          d.container.appendChild(d.ph);
          d.targetIdx = dragPhIndex();
        }
      }
    }
  }

  function dragEnd() {
    if (!drag) return;
    var d = drag; drag = null;
    document.body.classList.remove('dragging-active');
    var item = d.item;
    item.classList.remove('dragging');
    item.style.cssText = '';
    if (d.ph.parentNode) d.ph.parentNode.removeChild(d.ph);
    if (d.targetIdx !== d.startIdx) {
      var moved = files.splice(d.startIdx, 1)[0];
      files.splice(d.targetIdx, 0, moved);
      renderAll();
    }
  }

  function attachReorder(container, axis) {
    if (!container) return;
    container.addEventListener('pointerdown', function (e) {
      if (!e.target.closest) return;
      var handle = e.target.closest('.drag-handle');
      if (!handle || !container.contains(handle)) return;
      var item = handle.closest('[data-idx]');
      if (!item || !container.contains(item)) return;
      dragStart(e, item, container, axis);
    });
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
    /* v7 display: spinner on the button + progress bar (no layout jump:
       the bar element is always in the flow, only its fill moves). */
    var prog = $('mergeProgress');
    var bar = prog ? prog.querySelector('div') : null;
    if (prog) { prog.hidden = false; if (bar) bar.style.width = '0%'; }
    btn.classList.add('is-busy');
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
        if (bar) bar.style.width = Math.round(((i + 1) / list.length) * 100) + '%';
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var out = await merged.save();
      var blob = new Blob([out], { type: 'application/pdf' });
      $('downloadBtn').onclick = function () { Chami.downloadBlob(blob, 'chami-merged.pdf'); };
      $('previewBtn').onclick = function () {
        Chami.openPreview('Merged PDF — ' + total + ' pages', blob, 'pdf');
      };
      /* v7 display: before → after size in the result card. */
      var inBytes = list.reduce(function (sum, f) { return sum + f.bytes.byteLength; }, 0);
      var meta = $('resultMeta');
      if (meta) {
        var line = Chami.fmtBytes(inBytes) + ' \u2192 ' + Chami.fmtBytes(blob.size);
        if (blob.size < inBytes) line += ' \u00B7 ' + Math.round((1 - blob.size / inBytes) * 100) + '% smaller';
        else line += ' \u00B7 combined';
        meta.textContent = line;
        meta.hidden = false;
      }
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! ' + list.length + ' PDFs merged into one file with ' + total + ' pages (' + Chami.fmtBytes(blob.size) + ').', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Merging failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      renderList();
      /* v7 display: hide the progress bar and spinner again. */
      if (prog) { prog.hidden = true; if (bar) bar.style.width = '0%'; }
      btn.classList.remove('is-busy');
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
    /* v7 display: Start over reuses the Clear all action. */
    var startOver = $('startOverBtn');
    if (startOver) startOver.addEventListener('click', function () {
      $('clearBtn').click();
      var dz = $('dropzone');
      if (dz) dz.focus();
    });
    /* v7 display: drag-to-reorder on the file list (touch + mouse). */
    attachReorder($('pdfList'), 'y');
    document.addEventListener('pointermove', dragMove, { passive: false });
    document.addEventListener('pointerup', dragEnd);
    document.addEventListener('pointercancel', dragEnd);
    renderList();
  });
})();
