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

  function renderAll() { renderList(); Chami.showResult($('resultBox'), false); }

  async function addFiles(list) {
    var status = $('status');
    var added = 0;
    for (var k = 0; k < list.length; k++) {
      var file = list[k];
      if (!/^image\//.test(file.type)) {
        Chami.setStatus(status, '"' + file.name + '" is not an image file. Please choose JPG, PNG or WEBP images.', 'error');
        continue;
      }
      try {
        var dataUrl = await Chami.readAsDataURL(file);
        var img = await Chami.loadImage(dataUrl);
        files.push({ name: file.name, type: file.type, dataUrl: dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        added++;
      } catch (e) {
        Chami.setStatus(status, 'Could not read "' + file.name + '": ' + (e && e.message ? e.message : e), 'error');
      }
    }
    if (added) Chami.setStatus(status, added + ' image' + (added > 1 ? 's' : '') + ' added. Drag the list or use Up / Down to reorder, then tap Convert to PDF.', 'ok');
    renderAll();
  }

  async function convert() {
    var status = $('status');
    if (!files.length) { Chami.setStatus(status, 'Please add at least one image first.', 'error'); return; }
    if (!Chami.requireLib(function () { return window.jspdf && window.jspdf.jsPDF; }, 'PDF', status)) return;
    var btn = $('convertBtn');
    btn.disabled = true;
    Chami.setStatus(status, 'Creating your PDF...');
    try {
      var size = $('pageSize').value;
      var jsPDF = window.jspdf.jsPDF;
      var doc = null;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
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
        Chami.setStatus(status, 'Creating your PDF... page ' + (i + 1) + ' of ' + files.length);
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var out = doc.output('blob');
      $('downloadBtn').onclick = function () {
        Chami.downloadBlob(out, 'chami-images-to-pdf.pdf');
      };
      $('previewBtn').onclick = function () {
        Chami.openPreview('Your PDF — ' + files.length + ' page' + (files.length > 1 ? 's' : ''), out, 'pdf');
      };
      Chami.showResult($('resultBox'), true);
      var meta = $('resultMeta');
      if (meta) meta.textContent = (size === 'a4' ? 'A4' : 'Original size') + '  •  ' + files.length + ' page' + (files.length > 1 ? 's' : '') + '  •  ' + Chami.fmtBytes(out.size);
      Chami.setStatus(status, 'Done! Your PDF is ready — ' + files.length + ' page' + (files.length > 1 ? 's' : '') + ', ' + Chami.fmtBytes(out.size) + '.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Could not create the PDF: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      btn.disabled = files.length === 0;
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
