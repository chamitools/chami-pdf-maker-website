/* Chami PDF Maker website — Particles (matches the Android app, Phase 6).
   Tiny Emerald dots floating up, behind content, never over text/buttons.
   Same colours/speed as the app: #22C55E / #16A34A / #86EFAC / #BBF7D0,
   5-9px dots, rise 4.0-6.4s, transform/opacity only, pauses when the tab
   is hidden. No libraries, no tracking, no network. */
(function () {
  'use strict';
  if (window.__chamiParticles) return;
  window.__chamiParticles = true;

  var COLORS = ['#22C55E', '#16A34A', '#86EFAC', '#BBF7D0'];
  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:0;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var dots = [], W = 0, H = 0, raf = null, last = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.max(8, Math.min(16, Math.round(W / 90)));
    dots = [];
    for (var i = 0; i < count; i++) dots.push(newDot(true));
  }

  function newDot(anywhere) {
    var size = 5 + Math.random() * 4;               /* 5-9px, like the app */
    var rise = 4.0 + Math.random() * 2.4;           /* 4.0-6.4s to cross */
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + size + Math.random() * 40,
      r: size / 2,
      speed: H / (rise * 60),
      drift: (Math.random() - 0.5) * 0.25,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      alpha: 0.25 + Math.random() * 0.45
    };
  }

  function frame(now) {
    raf = null;
    if (document.hidden) return;
    var dt = last ? Math.min(now - last, 50) : 16;
    last = now;
    var step = dt / 16.7;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.y -= d.speed * step;
      d.x += d.drift * step;
      if (d.y < -12) dots[i] = newDot(false);
      /* Fade in near the bottom, out near the top. */
      var a = d.alpha * Math.min(1, (H - d.y) / 80) * Math.min(1, (d.y + 12) / 60);
      if (a <= 0) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf == null && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
    } else start();
  });
  resize();
  start();
})();
