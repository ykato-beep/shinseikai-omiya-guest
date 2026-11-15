/* 地球：NASA の衛星写真「ブルーマーブル」（assets/earth-hd.webp。見える範囲だけ切り出したもの）を球体に貼り、画面の下から昇らせる（WebGL）。
 * 下へスワイプするほど昇り、同時にごくゆっくり自転する。昇りきると画面の下半分が半球になる。
 * 描き直すのはスクロールで値が変わったときだけ（常時は動かさない）。操作は受け取らない。
 * WebGL が使えない端末では何も出さず、bg.js が代わりに月を出す。 */
(function () {
  var base = document.getElementById('bg');
  if (!base) return;
  var cv = document.createElement('canvas');
  cv.className = 'earth';
  cv.setAttribute('aria-hidden', 'true');
  var gl = null;
  try { gl = cv.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch (e) { gl = null; }
  if (!gl) return;
  base.parentNode.insertBefore(cv, base);
  window.__earthOk = true;

  var GLOW = 40;                       /* 球の上に取る、大気の光の余白（px） */
  var LON_END = 138 * Math.PI / 180;   /* 昇りきったとき正面に来る経度（日本付近） */
  var ROT = 55 * Math.PI / 180;        /* 最初から最後までに自転する角度 */
  var LAT = -18 * Math.PI / 180;       /* 視点の緯度。日本が半球の上寄りに見える傾き */
  /* 写真の範囲：東経40度から東へ250度、北緯90度から南へ114度（切り出しを変えたらここも直す） */
  var MAP = [40, 250, 90, 114].map(function (d) { return d * Math.PI / 180; });
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var prog = null, uni = {}, tex = null, img = null, ready = false;
  var W = 0, H = 0, dpr = 1, cur = -1, raf = 0;

  var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 uC;uniform float uR;uniform float uLon;uniform float uLat;uniform sampler2D uTex;',
    'uniform vec4 uMap;',                                         /* 写真の範囲：西端の経度, 経度の幅, 北端の緯度, 緯度の幅（ラジアン） */
    'void main(){',
    '  vec2 p=(gl_FragCoord.xy-uC)/uR;',
    '  float d=length(p);',
    '  float e=max(d-1.0,0.0);',
    '  float g=exp(-e*110.0)*0.7+exp(-e*16.0)*0.1;',             /* 球の外側：薄い大気の層と、ごく淡い光 */
    '  vec4 outer=vec4(vec3(0.45,0.68,1.0)*g,g);',
    '  if(d>=1.0){gl_FragColor=outer;return;}',
    '  float z=sqrt(1.0-d*d);',
    '  vec3 n=vec3(p,z);',
    '  float cl=cos(uLat),sl=sin(uLat);',
    '  vec3 m=vec3(n.x,n.y*cl+n.z*sl,-n.y*sl+n.z*cl);',
    '  float lat=asin(clamp(m.y,-1.0,1.0));',
    '  float lon=mod(atan(m.x,m.z)+uLon-uMap.x,6.2831853);',
    '  vec2 uv=vec2(lon/uMap.y,(uMap.z-lat)/uMap.w);',
    '  vec3 c=texture2D(uTex,clamp(uv,0.0,1.0)).rgb;',
    '  vec3 L=normalize(vec3(-0.25,0.55,0.8));',
    '  float dl=max(dot(n,L),0.0);',
    '  float lum=dot(c,vec3(0.3,0.59,0.11));',
    '  float sea=clamp((c.b-max(c.r,c.g))*7.0,0.0,1.0)*(1.0-smoothstep(0.22,0.5,lum));', /* 暗い青＝海 */
    '  c*=0.5+0.6*smoothstep(0.0,1.0,dl);',                       /* 太陽光の当たり方（ゆるやか） */
    '  vec3 hv=normalize(L+vec3(0.0,0.0,1.0));',
    '  float sp=max(dot(n,hv),0.0);',
    '  c+=vec3(1.0,0.97,0.9)*(pow(sp,90.0)*0.4+pow(sp,14.0)*0.06)*sea;', /* 海面に映る太陽 */
    '  float haze=pow(1.0-z,3.2);',
    '  c=mix(c,vec3(0.5,0.7,1.0),haze*0.75);',                    /* ふちに向かって大気でかすむ */
    '  float a=smoothstep(1.0,1.0-1.5/uR,d);',
    '  gl_FragColor=mix(outer,vec4(c,1.0),a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  function setup() {
    var vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uC', 'uR', 'uLon', 'uLat', 'uTex', 'uMap'].forEach(function (k) { uni[k] = gl.getUniformLocation(prog, k); });
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    tex = gl.createTexture();
    if (img && img.complete && img.naturalWidth) upload();
    return true;
  }
  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ready = true;
    cv.style.opacity = '1';
    cur = -1;
    kick();
  }
  function fit() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    W = w; H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2, 2400 / w);
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    cur = -1;
    kick();
  }
  function target() {
    var vh = window.innerHeight;
    var range = document.documentElement.scrollHeight - vh;
    /* スクロールするほどの長さがない画面（送信完了など）では、昇りきった状態にする */
    return range < 80 ? 1 : Math.max(0, Math.min(1, (window.pageYOffset || 0) / range));
  }
  function draw(p) {
    cv.style.transform = 'translate3d(0,' + Math.round((1 - p) * (H + 4)) + 'px,0)';
    if (!ready || !prog || p <= 0) return;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(uni.uC, cv.width / 2, 0);
    gl.uniform1f(uni.uR, (H - GLOW) * dpr);
    gl.uniform1f(uni.uLon, LON_END + (1 - p) * ROT);
    gl.uniform1f(uni.uLat, LAT);
    gl.uniform4f(uni.uMap, MAP[0], MAP[1], MAP[2], MAP[3]);
    gl.uniform1i(uni.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  /* 目標の位置へ、少し遅れてなめらかに追いつく（ゆっくり回って見える） */
  function tick() {
    raf = 0;
    var t = target();
    if (cur < 0 || (mq && mq.matches)) cur = t;
    else { var d = t - cur; cur = Math.abs(d) < 0.0004 ? t : cur + d * 0.08; }
    draw(cur);
    if (cur !== t) raf = requestAnimationFrame(tick);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  if (!setup()) { cv.parentNode.removeChild(cv); window.__earthOk = false; return; }
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ready = false; prog = null; });
  cv.addEventListener('webglcontextrestored', function () { if (setup()) kick(); });
  var rs = 0;
  window.addEventListener('resize', function () { clearTimeout(rs); rs = setTimeout(fit, 150); });
  window.addEventListener('orientationchange', function () { setTimeout(fit, 300); });
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('bg:update', function () { setTimeout(kick, 0); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  function load() {
    /* 高精細版（WebP・横3072px）を使う。読めない端末や大きな画像を扱えない端末は軽量版（JPEG・横2048px） */
    var small = 'assets/earth-sd.jpg';
    var big = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 3072 ? 'assets/earth-hd.webp' : small;
    img = new Image();
    img.onload = function () { if (prog) upload(); };
    img.onerror = function () { if (img.src.indexOf(small) < 0) img.src = small; };
    img.src = big;
  }
  if (document.readyState === 'complete') load(); else window.addEventListener('load', load);
  fit();
})();
