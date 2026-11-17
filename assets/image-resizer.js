/* Image Resizer — runs 100% in your browser with a plain canvas.
   Resize by width/height, percent, or preset. Optional target KB:
   the JPEG quality is adjusted until the file is close to the target. */
(function () {
  'use strict';
  var file = null; // {name, type, dataUrl, width, height}
  var $ = function (id) { return document.getElementById(id); };

  var PRESETS = {
    whatsapp:  { label: 'WhatsApp status / post', w: 1080, h: 1080 },
    instagram: { label: 'Instagram post', w: 1080, h: 1080 },
    story:     { label: 'Instagram / WhatsApp story', w: 1080, h: 1920 },
    passport:  { label: 'Passport photo (35 x 45 mm)', w: 413, h: 531 },
    a4:        { label: 'A4 at 300 dpi', w: 2480, h: 3508 }
  };

  function renderInfo() {
    var info = $('fileInfo');
    if (!file) { info.textContent = ''; $('resizeBtn').disabled = true; return; }
    info.textContent = file.name + ' — ' + file.width + ' x ' + file.height + ' px. Pick a size below and tap Resize Image.';
    $('resizeBtn').disabled = false;
    $('clearBtn').disabled = false;
  }

  function showPreview() {
    var box = $('previewBox');
    if (!file) { box.innerHTML = ''; return; }
    box.innerHTML = '';
    var img = document.createElement('img');
    img.src = file.dataUrl; img.alt = file.name;
    img.style.maxWidth = '240px'; img.style.borderRadius = '8px'; img.style.border = '1px solid #E5E7EB';
    box.appendChild(img);
  }

  async function addFiles(list) {
    var status = $('status');
    var f = list[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      Chami.setStatus(status, '"' + f.name + '" is not an image file. Please choose a JPG, PNG or WEBP image.', 'error');
      return;
    }
    try {
      var dataUrl = await Chami.readAsDataURL(f);
      var img = await Chami.loadImage(dataUrl);
      file = { name: f.name, type: f.type, dataUrl: dataUrl, width: img.naturalWidth, height: img.naturalHeight };
      $('widthInput').value = file.width;
      $('heightInput').value = file.height;
      Chami.setStatus(status, 'Image loaded.', 'ok');
      Chami.showResult($('resultBox'), false);
      showPreview();
      renderInfo();
    } catch (e) {
      Chami.setStatus(status, 'Could not read that image. It may be a damaged file.', 'error');
    }
  }

  function targetSize() {
    var mode = document.querySelector('input[name="sizeMode"]:checked').value;
    if (mode === 'percent') {
      var pct = parseFloat($('percentInput').value);
      if (isNaN(pct) || pct <= 0 || pct > 400) return null;
      return {
        w: Math.max(1, Math.round(file.width * pct / 100)),
        h: Math.max(1, Math.round(file.height * pct / 100))
      };
    }
    if (mode === 'preset') {
      var p = PRESETS[$('presetInput').value];
      return p ? { w: p.w, h: p.h } : null;
    }
    var w = parseInt($('widthInput').value, 10);
    var h = parseInt($('heightInput').value, 10);
    if (isNaN(w) || isNaN(h) || w < 1 || h < 1 || w > 8000 || h > 8000) return null;
    return { w: w, h: h };
  }

  function canvasToBlob(canvas, format, quality) {
    return new Promise(function (resolve, reject) {
      var type = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('encode')); }, type, quality);
    });
  }

  async function resize() {
    var status = $('status');
    if (!file) { Chami.setStatus(status, 'Please choose an image first.', 'error'); return; }
    var size = targetSize();
    if (!size) {
      Chami.setStatus(status, 'Please enter a valid size — width and height between 1 and 8000 px, or a percent between 1 and 400.', 'error');
      return;
    }
    var format = $('format').value; // jpg, png, webp
    var targetKb = parseFloat($('targetKb').value);
    var btn = $('resizeBtn');
    btn.disabled = true;
    Chami.setStatus(status, 'Resizing your image...');
    try {
      var img = await Chami.loadImage(file.dataUrl);
      var canvas = document.createElement('canvas');
      canvas.width = size.w; canvas.height = size.h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size.w, size.h);
      var blob, quality = 0.92;
      if (format === 'png') {
        blob = await canvasToBlob(canvas, 'png');
      } else if (!isNaN(targetKb) && targetKb > 0) {
        // Adjust JPEG/WEBP quality until the file is near the target size.
        var lo = 0.1, hi = 0.95, best = null;
        for (var i = 0; i < 7; i++) {
          var q = (lo + hi) / 2;
          var test = await canvasToBlob(canvas, format, q);
          if (!best || Math.abs(test.size - targetKb * 1024) < Math.abs(best.size - targetKb * 1024)) best = test;
          if (test.size > targetKb * 1024) hi = q; else lo = q;
          quality = q;
        }
        blob = best;
      } else {
        blob = await canvasToBlob(canvas, format, quality);
      }
      var ext = format === 'jpg' ? 'jpg' : format;
      var base = file.name.replace(/\.[^.]+$/, '');
      $('sizeInfo').textContent = 'New size: ' + size.w + ' x ' + size.h + ' px — ' + Chami.fmtBytes(blob.size) +
        (format !== 'png' && !isNaN(targetKb) && targetKb > 0 ? ' (target was ' + targetKb + ' KB)' : '');
      $('downloadBtn').onclick = function () { Chami.downloadBlob(blob, base + '-resized.' + ext); };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status, 'Done! Your resized image is ready.', 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Resizing failed. Please try a different image or size.', 'error');
    } finally {
      btn.disabled = !file;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    Chami.setupDropzone($('dropzone'), $('fileInput'), addFiles);
    $('resizeBtn').addEventListener('click', resize);
    $('clearBtn').addEventListener('click', function () {
      file = null;
      $('widthInput').value = ''; $('heightInput').value = '';
      $('targetKb').value = '';
      $('previewBox').innerHTML = '';
      Chami.setStatus($('status'), '');
      Chami.showResult($('resultBox'), false);
      renderInfo();
    });
    // Keep aspect ratio when the user edits width.
    $('widthInput').addEventListener('change', function () {
      if (!file) return;
      var w = parseInt($('widthInput').value, 10);
      if (!isNaN(w) && w > 0) $('heightInput').value = Math.max(1, Math.round(file.height * w / file.width));
    });
    renderInfo();
  });
})();
