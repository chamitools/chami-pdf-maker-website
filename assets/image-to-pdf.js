/* Images to PDF — runs 100% in your browser. Images are embedded at
   original resolution: JPEG and PNG go in untouched; WEBP and other
   formats are converted through a canvas at full pixel size. */
(function () {
  'use strict';
  var files = []; // {name, type, dataUrl, width, height}
  var $ = function (id) { return document.getElementById(id); };

  function renderList() {
    var list = $('imgList');
    list.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li');
      li.dataset.idx = i;
      var grip = document.createElement('span');
      grip.className = 'drag-handle';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder';
      grip.setAttribute('aria-label', 'Drag to reorder');
      li.appendChild(grip);
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (i + 1) + '. ' + f.name + ' (' + f.width + ' x ' + f.height + ' px)';
      li.appendChild(name);
      var up = document.createElement('button');
      up.type = 'button'; up.textContent = 'Up';
      up.disabled = i === 0;
      up.addEventListener('click', function () { move(i, -1); });
      var down = document.createElement('button');
      down.type = 'button'; down.textContent = 'Down';
      down.disabled = i === files.length - 1;
      down.addEventListener('click', function () { move(i, 1); });
      var del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Remove';
      del.addEventListener('click', function () { files.splice(i, 1); renderAll(); });
      li.appendChild(up); li.appendChild(down); li.appendChild(del);
      list.appendChild(li);
    });
    var thumbs = $('thumbs');
    thumbs.innerHTML = '';
    files.forEach(function (f, i) {
      var d = document.createElement('div');
      d.className = 'thumb';
      d.dataset.idx = i;
      var tgrip = document.createElement('span');
      tgrip.className = 'drag-handle';
      tgrip.textContent = '⠿';
      tgrip.title = 'Drag to reorder';
      tgrip.setAttribute('aria-label', 'Drag to reorder');
      d.appendChild(tgrip);
      var img = document.createElement('img');
      img.src = f.dataUrl; img.alt = 'Page ' + (i + 1) + ' — ' + f.name;
      d.appendChild(img);
      var cap = document.createElement('span');
      cap.className = 'page-badge';
      cap.textContent = 'Page ' + (i + 1);
      d.appendChild(cap);
      thumbs.appendChild(d);
    });
    var stripLabel = $('stripLabel');
    if (stripLabel) stripLabel.hidden = files.length === 0;
    $('convertBtn').disabled = files.length === 0;
    $('clearBtn').disabled = files.length === 0;
    var count = $('countText');
    if (count) count.textContent = files.length ? files.length + ' image' + (files.length > 1 ? 's' : '') + ' added' : '';
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= files.length) return;
    var t = files[i]; files[i] = files[j]; files[j] = t;
    renderAll();
  }

  /* ---------- Drag to reorder (touch + mouse, Pointer Events) ----------
     The handle is the only grab point, so swiping anywhere else still
     scrolls the page. The dragged row/thumb floats under the finger
     and a dashed gap shows where it will land; on release the files
     array is reordered, so the preview and the final PDF follow the
     new order. Up / Down buttons stay as the keyboard alternative. */
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
    ph.className = item.classList.contains('thumb') ? 'thumb drag-gap' : 'drag-gap';
    ph.style.height = rect.height + 'px';
    if (item.classList.contains('thumb')) ph.style.width = rect.width + 'px';
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
      var after;
      if (d.axis === 'grid') {
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        after = Math.abs(dx) > Math.abs(dy) ? dx > 0 : dy > 0;
      } else {
        after = e.clientY > r.top + r.height / 2;
      }
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
    var added = 0, failed = 0;
    for (var k = 0; k < list.length; k++) {
      var file = list[k];
      // Some pickers (notably on Android) send an empty MIME type for a
      // valid image, so fall back to the file extension before rejecting.
      if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '')) {
        Chami.setStatus(status, '"' + file.name + '" is not an image file. Please choose JPG, PNG or WEBP images.', 'error');
        failed++;
        continue;
      }
      try {
        var dataUrl = await Chami.readAsDataURL(file);
        var img = await Chami.loadImage(dataUrl);
        files.push({ name: file.name, type: file.type, dataUrl: dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        added++;
      } catch (e) {
        failed++;
        Chami.setStatus(status, 'Could not read "' + file.name + '": ' + (e && e.message ? e.message : e), 'error');
      }
    }
    if (added) {
      var msg = added + ' image' + (added > 1 ? 's' : '') + ' added. Drag the list or use Up / Down to reorder, then tap Convert to PDF.';
      if (failed) msg += ' ' + failed + ' file' + (failed > 1 ? 's' : '') + ' could not be added.';
      Chami.setStatus(status, msg, 'ok');
    }
    renderAll();
  }

  async function convert() {
    var status = $('status');
    if (!files.length) { Chami.setStatus(status, 'Please add at least one image first.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.jspdf && window.jspdf.jsPDF; }, 'PDF', status)) return;
    var btn = $('convertBtn');
    btn.disabled = true;
    $('clearBtn').disabled = true;
    // Snapshot the list: if the user clears or adds images mid-convert,
    // the loop must still finish exactly the pages that were queued.
    var pages = files.slice();
    Chami.setStatus(status, 'Creating your PDF...');
    try {
      var size = $('pageSize').value;
      var jsPDF = window.jspdf.jsPDF;
      var doc = null;
      for (var i = 0; i < pages.length; i++) {
        var f = pages[i];
        var wPt, hPt, format, orientation;
        // A4 is ALWAYS portrait. (The old code flipped orientation by image
        // aspect, which turned A4 into a landscape page while the fit math
        // still used portrait dimensions, so images landed bottom-left and
        // overflowed.) Original keeps the image's own page size, so its
        // orientation must match the image's aspect — jsPDF enforces
        // orientation by swapping dimensions.
        if (size === 'a4') {
          wPt = 595.28; hPt = 841.89; // A4 portrait, in points
          format = 'a4';
          orientation = 'portrait';
        } else {
          // Original: one point per pixel (72 dpi), so nothing is downscaled.
          wPt = f.width; hPt = f.height;
          format = [wPt, hPt];
          orientation = f.width >= f.height ? 'landscape' : 'portrait';
        }
        if (i === 0) doc = new jsPDF({ unit: 'pt', format: format, orientation: orientation, compress: true });
        else doc.addPage(format, orientation);
        var drawW = wPt, drawH = hPt, x = 0, y = 0;
        if (size === 'a4') {
          // Fit inside a uniform 36pt margin on every side, keeping the
          // image's aspect ratio exactly (never stretched, never cropped),
          // centred on the page.
          var margin = 36;
          var availW = wPt - margin * 2, availH = hPt - margin * 2;
          var scale = Math.min(availW / f.width, availH / f.height);
          drawW = f.width * scale; drawH = f.height * scale;
          x = (wPt - drawW) / 2; y = (hPt - drawH) / 2;
        }
        // jsPDF accepts a data URL for JPEG/PNG/WEBP. Do NOT pass a raw
        // ArrayBuffer here: jsPDF 2.5.1 throws "charCodeAt is not a function".
        if (f.type === 'image/jpeg' || f.type === 'image/jpg') {
          doc.addImage(f.dataUrl, 'JPEG', x, y, drawW, drawH);
        } else if (f.type === 'image/png') {
          doc.addImage(f.dataUrl, 'PNG', x, y, drawW, drawH);
        } else if (f.type === 'image/webp') {
          try { doc.addImage(f.dataUrl, 'WEBP', x, y, drawW, drawH); }
          catch (e) { await addViaCanvas(doc, f, x, y, drawW, drawH); }
        } else {
          await addViaCanvas(doc, f, x, y, drawW, drawH);
        }
        Chami.setStatus(status, 'Creating your PDF... page ' + (i + 1) + ' of ' + pages.length);
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var out = doc.output('blob');
      $('downloadBtn').onclick = function () {
        Chami.downloadBlob(out, 'chami-images-to-pdf.pdf');
      };
      $('previewBtn').onclick = function () {
        Chami.openPreview('Your PDF — ' + pages.length + ' page' + (pages.length > 1 ? 's' : ''), out, 'pdf');
      };
      Chami.showResult($('resultBox'), true);
      var meta = $('resultMeta');
      if (meta) meta.textContent = (size === 'a4' ? 'A4' : 'Original size') + '  •  ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + '  •  ' + Chami.fmtBytes(out.size);
      Chami.setStatus(status, 'Done! Your PDF is ready — ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + ', ' + Chami.fmtBytes(out.size) + '.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Could not create the PDF: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      renderList();
    }
  }

  async function addViaCanvas(doc, f, x, y, w, h) {
    var img = await Chami.loadImage(f.dataUrl);
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    var jpg = c.toDataURL('image/jpeg', 0.92);
    doc.addImage(jpg, 'JPEG', x, y, w, h);
  }

  document.addEventListener('DOMContentLoaded', function () {
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    /* Dropping files anywhere on the tool adds them (the dropzone
       already handles drops on itself — skip those so a file is not
       added twice). The list drag above uses Pointer Events, not
       HTML5 drag-and-drop, so the two never interfere. */
    var tool = document.querySelector('.tool');
    if (tool) {
      tool.addEventListener('dragover', function (e) {
        if (!e.dataTransfer || !e.dataTransfer.types || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') === -1) return;
        e.preventDefault();
        tool.classList.add('drop-active');
      });
      tool.addEventListener('dragleave', function (e) {
        if (e.relatedTarget && tool.contains(e.relatedTarget)) return;
        tool.classList.remove('drop-active');
      });
      tool.addEventListener('drop', function (e) {
        tool.classList.remove('drop-active');
        if (e.target.closest && e.target.closest('#dropzone')) return;
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          e.preventDefault();
          addFiles(Array.prototype.slice.call(e.dataTransfer.files));
        }
      });
    }
    /* Drag to reorder: list rows (vertical) and thumbnails (grid). */
    attachReorder($('imgList'), 'y');
    attachReorder($('thumbs'), 'grid');
    document.addEventListener('pointermove', dragMove, { passive: false });
    document.addEventListener('pointerup', dragEnd);
    document.addEventListener('pointercancel', dragEnd);
    var addMore = $('addMoreBtn');
    if (addMore) addMore.addEventListener('click', function () { $('fileInput').click(); });
    $('convertBtn').addEventListener('click', convert);
    $('clearBtn').addEventListener('click', function () {
      files = [];
      Chami.setStatus($('status'), '');
      renderAll();
    });
    renderList();
  });
})();
