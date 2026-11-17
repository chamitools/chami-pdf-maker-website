/* Image Resizer — runs 100% in your browser with a plain canvas.
   Resize by width/height, percent, or preset. Optional target KB:
   the JPEG quality is adjusted until the file is close to the target. */
(function () {
  'use strict';
  var file = null; // {name, type, dataUrl, width, height}
  var busy = false; // a resize is running; ignore new files until it finishes
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
    if (!file) { info.textContent = ''; $('resizeBtn').disabled = true; $('clearBtn').disabled = true; return; }
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
    if (busy) { Chami.setStatus(status, 'Please wait for the current resize to finish before choosing another image.', 'error'); return; }
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
      Chami.setStatus(status, list.length > 1 ? 'Image loaded — only the first of ' + list.length + ' images is used; this tool takes one image at a time.' : 'Image loaded.', 'ok');
      Chami.showResult($('resultBox'), false);
      showPreview();
      renderInfo();
    } catch (e) {
      Chami.setStatus(status, 'Could not read that image: ' + (e && e.message ? e.message : e), 'error');
    }
  }

  function targetSize() {
    var picked = document.querySelector('input[name="sizeMode"]:checked');
    if (!picked) return null;
    var mode = picked.value;
    if (mode === 'percent') {
      var pct = parseFloat($('percentInput').value);
      if (isNaN(pct) || pct <= 0 || pct > 400) return null;
      var size = {
        w: Math.max(1, Math.round(file.width * pct / 100)),
        h: Math.max(1, Math.round(file.height * pct / 100))
      };
      // Percent can push a big image past the 8000 px canvas cap that the
      // width/height mode enforces (e.g. 400% of a 3000 px photo).
      if (size.w > 8000 || size.h > 8000) return null;
      return size;
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
    var hasTargetKb = !isNaN(targetKb) && targetKb > 0;
    var btn = $('resizeBtn');
    btn.disabled = true;
    busy = true;
    Chami.setStatus(status, 'Resizing your image...');
    try {
      var img = await Chami.loadImage(file.dataUrl);
      var canvas = document.createElement('canvas');
      canvas.width = size.w; canvas.height = size.h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (format === 'jpg') {
        // White background: JPEG has no transparency, so a transparent PNG
        // would otherwise come out with a black background.
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size.w, size.h);
      }
      ctx.drawImage(img, 0, 0, size.w, size.h);
      var blob, targetMissed = false;
      if (format === 'png') {
        blob = await canvasToBlob(canvas, 'png');
      } else if (hasTargetKb) {
        // Adjust JPEG/WEBP quality until the file is at or under the target.
        // Keep the LARGEST file that fits (best quality under target). The
        // old code kept the file CLOSEST to the target, which could be OVER
        // it — e.g. 129.6 KB picked for a 100 KB target — without saying so.
        var lo = 0.1, hi = 0.95, fit = null, smallest = null;
        for (var i = 0; i < 7; i++) {
          var q = (lo + hi) / 2;
          var test = await canvasToBlob(canvas, format, q);
          if (!smallest || test.size < smallest.size) smallest = test;
          if (test.size <= targetKb * 1024) { if (!fit || test.size > fit.size) fit = test; lo = q; }
          else hi = q;
        }
        blob = fit || smallest;
        targetMissed = !fit;
      } else {
        blob = await canvasToBlob(canvas, format, 0.92);
      }
      var ext = format === 'jpg' ? 'jpg' : format;
      var base = file.name.replace(/\.[^.]+$/, '');
      $('sizeInfo').textContent = 'New size: ' + size.w + ' x ' + size.h + ' px — ' + Chami.fmtBytes(blob.size) +
        (format === 'png' && hasTargetKb ? ' (target KB does not apply to PNG — PNG is lossless, so its size is whatever the pixels need)'
          : hasTargetKb && targetMissed ? ' (target was ' + targetKb + ' KB — still above target, this is the smallest possible at this size)'
          : hasTargetKb ? ' (target was ' + targetKb + ' KB)' : '');
      $('downloadBtn').onclick = function () { Chami.downloadBlob(blob, base + '-resized.' + ext); };
      $('previewBtn').onclick = function () {
        Chami.openPreview('Resized image — ' + size.w + ' x ' + size.h + ' px (' + Chami.fmtBytes(blob.size) + ')', blob, 'image');
      };
      Chami.showResult($('resultBox'), true);
      Chami.setStatus(status,
        targetMissed ? 'Done — but the smallest possible at this size is ' + Chami.fmtBytes(blob.size) + ', still above your ' + targetKb + ' KB target. Try a smaller size.' :
        'Done! Your resized image is ready.',
        targetMissed ? '' : 'ok');
    } catch (e) {
      Chami.setStatus(status, 'Resizing failed: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      busy = false;
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
    // Keep aspect ratio when the user edits width or height.
    $('widthInput').addEventListener('change', function () {
      if (!file) return;
      var w = parseInt($('widthInput').value, 10);
      if (!isNaN(w) && w > 0) $('heightInput').value = Math.max(1, Math.round(file.height * w / file.width));
    });
    $('heightInput').addEventListener('change', function () {
      if (!file) return;
      var h = parseInt($('heightInput').value, 10);
      if (!isNaN(h) && h > 0) $('widthInput').value = Math.max(1, Math.round(file.width * h / file.height));
    });
    renderInfo();
  });
})();
