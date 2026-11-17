/* Images to PDF — runs 100% in your browser. Images are embedded at
   original resolution: JPEG and PNG go in untouched; WEBP and other
   formats are converted through a canvas at full pixel size. */
(function () {
  'use strict';
  var files = []; // {name, type, bytes, dataUrl, width, height}
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
    files.forEach(function (f) {
      var d = document.createElement('div');
      d.className = 'thumb';
      var img = document.createElement('img');
      img.src = f.dataUrl; img.alt = f.name;
      d.appendChild(img);
      var cap = document.createElement('div');
      cap.textContent = f.name.length > 18 ? f.name.slice(0, 15) + '...' : f.name;
      d.appendChild(cap);
      thumbs.appendChild(d);
    });
    $('convertBtn').disabled = files.length === 0;
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
        var bytes = await Chami.readAsArrayBuffer(file);
        files.push({ name: file.name, type: file.type, bytes: bytes, dataUrl: dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        added++;
      } catch (e) {
        Chami.setStatus(status, 'Could not read "' + file.name + '". It may be a damaged image file.', 'error');
      }
    }
    if (added) Chami.setStatus(status, added + ' image' + (added > 1 ? 's' : '') + ' added. Drag the list or use Up / Down to reorder, then tap Convert to PDF.', 'ok');
    renderAll();
  }

  function dataUrlToBytes(dataUrl) {
    var parts = dataUrl.split(',');
    var bin = atob(parts[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
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
        if (size === 'a4') {
          wPt = 595.28; hPt = 841.89;
          format = 'a4';
          orientation = f.width >= f.height ? 'landscape' : 'portrait';
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
          var scale = Math.min(wPt / f.width, hPt / f.height);
          drawW = f.width * scale; drawH = f.height * scale;
          x = (wPt - drawW) / 2; y = (hPt - drawH) / 2;
        }
        if (f.type === 'image/jpeg' || f.type === 'image/jpg') {
          doc.addImage(f.bytes, 'JPEG', x, y, drawW, drawH);
        } else if (f.type === 'image/png') {
          doc.addImage(f.bytes, 'PNG', x, y, drawW, drawH);
        } else if (f.type === 'image/webp' && doc.addImage) {
          try { doc.addImage(f.bytes, 'WEBP', x, y, drawW, drawH); }
          catch (e) { addViaCanvas(doc, f, x, y, drawW, drawH); }
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
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! Your PDF is ready — ' + files.length + ' page' + (files.length > 1 ? 's' : '') + ', ' + Chami.fmtBytes(out.size) + '.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Something went wrong while creating the PDF. Please try again with different images.', 'error');
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
    doc.addImage(dataUrlToBytes(jpg), 'JPEG', x, y, w, h);
  }

  document.addEventListener('DOMContentLoaded', function () {
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    $('convertBtn').addEventListener('click', convert);
    $('clearBtn').addEventListener('click', function () {
      files = [];
      Chami.setStatus($('status'), '');
      renderAll();
    });
    renderList();
  });
})();
