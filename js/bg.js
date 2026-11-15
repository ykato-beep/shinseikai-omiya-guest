/* 背景：光点とそれを結ぶ線、ときどき流れる流れ星（Canvas 2D）と、スクロールで昇る月（CSS）。
 * どの層も操作は受け取らない。毎秒30コマまで、画面が隠れている間は停止、
 * 端末が重いときは光点を減らす。OSの「視差効果を減らす」設定では静止画にし、流れ星は出さない。
 * <canvas id="bg" data-bg="calm"> では控えめな表示になり、流れ星と月は出さない。 */
(function () {
  var cv = document.getElementById('bg');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  var calm = cv.getAttribute('data-bg') === 'calm';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var COLORS = ['190,232,255', '120,190,255', '255,255,255'];
  var W = 0, H = 0, dpr = 1, pts = [], timer = 0, lastT = 0, load = 0, loadN = 0, shrink = 1;
  var LINK = 132, STRENGTH = calm ? 0.5 : 1;
  var stars = [], nextStar = 2.5 + Math.random() * 3; /* 次の流れ星までの秒数 */
  var often = /[?&]stars=1/.test(location.search); /* 確認用：流れ星を続けて出す */

  function target() {
    var n = Math.round((W * H) / (calm ? 30000 : 15000));
    n = Math.max(16, Math.min(calm ? 38 : 76, n));
    return Math.max(12, Math.round(n * shrink));
  }
  function spawn() {
    var z = 0.35 + Math.random() * 0.65; /* 奥行き：小さいほど遠く、暗く、遅い */
    var a = Math.random() * Math.PI * 2;
    var sp = (4 + Math.random() * 8) * z;
    return { x: Math.random() * W, y: Math.random() * H, z: z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.7 + z * 1.5, c: COLORS[(Math.random() * 3) | 0], ph: Math.random() * 6.28 };
  }
  /* 流れ星：右上寄りから左下へ、1秒ほどで流れて消える */
  function spawnStar() {
    var ang = (138 + Math.random() * 20) * Math.PI / 180;
    var sp = 420 + Math.random() * 300;
    stars.push({
      x: W * (0.3 + Math.random() * 0.8), y: H * (Math.random() * 0.35) - 20,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      len: 90 + Math.random() * 80, life: 0.8 + Math.random() * 0.5, t: 0
    });
  }
  function drawStars(dt) {
    if (calm || !fctx) return;
    if (fxDirty) { fctx.clearRect(0, 0, W, H); fxDirty = false; }
    nextStar -= dt;
    if (nextStar <= 0 && dt > 0) { spawnStar(); nextStar = often ? 0.35 : 6 + Math.random() * 9; }
    for (var i = stars.length - 1; i >= 0; i--) {
      var s = stars[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.t >= s.life) { stars.splice(i, 1); continue; }
      fxDirty = true;
      var a = 0.8 * Math.sin(Math.PI * s.t / s.life); /* 現れて、消える */
      var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      var tx = s.x - s.vx / sp * s.len, ty = s.y - s.vy / sp * s.len;
      var g = fctx.createLinearGradient(s.x, s.y, tx, ty);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')');
      g.addColorStop(0.3, 'rgba(170,215,255,' + (0.4 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(170,215,255,0)');
      fctx.strokeStyle = g; fctx.lineWidth = 1.6; fctx.lineCap = 'round';
      fctx.beginPath(); fctx.moveTo(s.x, s.y); fctx.lineTo(tx, ty); fctx.stroke();
      fctx.fillStyle = 'rgba(255,255,255,' + (0.22 * a).toFixed(3) + ')';
      fctx.beginPath(); fctx.arc(s.x, s.y, 5, 0, 6.2832); fctx.fill();
      fctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      fctx.beginPath(); fctx.arc(s.x, s.y, 1.6, 0, 6.2832); fctx.fill();
    }
  }
  function fit(force) {
    var w = window.innerWidth, h = Math.max(window.innerHeight, document.documentElement.clientHeight);
    /* アドレスバーの出入りによる小さな高さ変化では作り直さない */
    if (!force && w === W && Math.abs(h - H) < 160) return;
    W = w; H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fx) { fx.width = cv.width; fx.height = cv.height; fctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    var n = target();
    while (pts.length < n) pts.push(spawn());
    pts.length = n;
    for (var i = 0; i < n; i++) { if (pts[i].x > W) pts[i].x = Math.random() * W; if (pts[i].y > H) pts[i].y = Math.random() * H; }
    draw(0);
    moonUpdate();
  }
  function draw(dt) {
    var i, j, p, q, n = pts.length, m = 40;
    ctx.clearRect(0, 0, W, H);
    for (i = 0; i < n; i++) {
      p = pts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.ph += dt * 0.6;
      if (p.x < -m) p.x = W + m; else if (p.x > W + m) p.x = -m;
      if (p.y < -m) p.y = H + m; else if (p.y > H + m) p.y = -m;
    }
    ctx.lineWidth = 1;
    for (i = 0; i < n; i++) {
      p = pts[i];
      for (j = i + 1; j < n; j++) {
        q = pts[j];
        var dx = p.x - q.x, dy = p.y - q.y;
        if (dx > LINK || dx < -LINK || dy > LINK || dy < -LINK) continue;
        var zz = p.z < q.z ? p.z : q.z;
        var lim = LINK * (0.55 + zz * 0.45);
        var d2 = dx * dx + dy * dy;
        if (d2 >= lim * lim) continue;
        var al = (1 - Math.sqrt(d2) / lim) * 0.34 * zz * STRENGTH;
        if (al < 0.012) continue;
        ctx.strokeStyle = 'rgba(140,200,255,' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    for (i = 0; i < n; i++) {
      p = pts[i];
      var tw = 0.78 + 0.22 * Math.sin(p.ph);
      var a = (0.25 + p.z * 0.6) * tw * STRENGTH;
      if (p.z > 0.6) { /* 手前の光点だけ、淡い光の輪を付ける */
        ctx.fillStyle = 'rgba(' + p.c + ',' + (a * 0.13).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4.2, 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = 'rgba(' + p.c + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    drawStars(dt);
  }
  function frame(t) {
    timer = 0;
    if (document.hidden || (mq && mq.matches)) return;
    timer = requestAnimationFrame(frame);
    if (t - lastT < 32) return; /* 毎秒30コマまで */
    var dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;
    var t0 = performance.now();
    draw(dt);
    load += performance.now() - t0; loadN++;
    if (loadN >= 45) { /* 1コマの描画が重い端末では光点を減らす */
      if (load / loadN > 7 && shrink > 0.4) { shrink *= 0.7; pts.length = Math.min(pts.length, target()); }
      load = 0; loadN = 0;
    }
  }
  function start() {
    if (timer) return;
    if (mq && mq.matches) { stars.length = 0; draw(0); return; }
    lastT = performance.now();
    timer = requestAnimationFrame(frame);
  }

  /* 月：読み進める（下へスクロールする）ほど画面の下端から昇り、最後は送信ボタンの下の夜空に出る */
  /* 流れ星だけは、回答欄の上を一瞬横切る細い線として描く（別の層。操作は受け取らない） */
  var fx = null, fctx = null, fxDirty = false;
  var moon = null, moonQueued = false;
  if (!calm && !window.__earthOk) { /* 地球（earth.js）を出せない端末だけ、代わりに月を出す */
    moon = document.createElement('div');
    moon.className = 'moon';
    moon.setAttribute('aria-hidden', 'true');
    cv.parentNode.insertBefore(moon, cv);
  }
  if (!calm) {
    fx = document.createElement('canvas');
    fx.className = 'fx';
    fx.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fx);
    fctx = fx.getContext('2d');
  }
  function moonApply() {
    moonQueued = false;
    if (!moon) return;
    var vh = window.innerHeight;
    var range = document.documentElement.scrollHeight - vh;
    /* スクロールするほどの長さがない画面（送信完了など）では、昇りきった位置に出す */
    var p = range < 80 ? 1 : Math.max(0, Math.min(1, (window.pageYOffset || 0) / range));
    var rise = moon.offsetHeight + vh * 0.05 + 24;
    moon.style.transform = 'translate3d(0,' + Math.round((1 - p) * rise) + 'px,0)';
    moon.style.opacity = Math.min(1, p * 3).toFixed(3);
  }
  function moonUpdate() {
    if (!moon || moonQueued) return;
    moonQueued = true;
    requestAnimationFrame(moonApply);
  }

  var rs = 0;
  window.addEventListener('resize', function () { clearTimeout(rs); rs = setTimeout(function () { fit(false); moonUpdate(); }, 180); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { fit(true); }, 300); });
  window.addEventListener('scroll', moonUpdate, { passive: true });
  window.addEventListener('bg:update', function () { setTimeout(moonUpdate, 0); });
  window.addEventListener('load', moonUpdate);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  if (mq) { var on = function () { start(); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  fit(true);
  start();
})();
