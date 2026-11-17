/* 回答フォーム。設問は questions.js から組み立てる。 */
(function () {
  var API = window.HEARING_API;
  var Q = window.HEARING_QUESTIONS;
  var DRAFT_KEY = 'ssk-omiya-guest-hearing-draft-v1';
  var DRAFT_DAYS = 14;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form');
  var sending = false;
  var submissionId = '';
  var saveTimer = 0;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* ---------- 設問の組み立て ---------- */
  var parts = []; /* {key, type, options, exclusive, wrap} */
  function build() {
    var box = $('questions');
    Q.forEach(function (q) {
      var sec = el('section', 'card');
      sec.appendChild(el('span', 'qno', q.no));
      sec.appendChild(el('h2', '', q.title));
      q.parts.forEach(function (p) {
        var fs = el('fieldset', 'part');
        fs.id = 'wrap-' + p.key;
        var lg = el('legend', 'part-label');
        lg.appendChild(document.createTextNode(p.label || (p.type === 'multi' ? 'あてはまるもの' : '')));
        lg.appendChild(el('span', 'tag req', '必須'));
        lg.appendChild(el('span', 'hint', p.type === 'multi' ? '複数選択できます' : '1つ選択'));
        fs.appendChild(lg);
        var opts = el('div', 'opts');
        p.options.forEach(function (o) {
          var lab = el('label', 'opt');
          var inp = document.createElement('input');
          inp.type = p.type === 'multi' ? 'checkbox' : 'radio';
          inp.name = p.key; inp.value = o;
          lab.appendChild(inp);
          lab.appendChild(el('span', '', o));
          opts.appendChild(lab);
        });
        fs.appendChild(opts);
        var er = el('p', 'err'); er.id = 'err-' + p.key; er.setAttribute('role', 'alert');
        fs.appendChild(er);
        sec.appendChild(fs);
        parts.push({ key: p.key, type: p.type, options: p.options, exclusive: p.exclusive || [], wrap: fs });
      });
      var f = el('div', 'field');
      f.id = 'wrap-' + q.noteKey;
      var lab = el('label', 'field-label', '補足コメント ');
      lab.htmlFor = q.noteKey;
      lab.appendChild(el('span', 'tag opt', '任意'));
      f.appendChild(lab);
      var ta = document.createElement('textarea');
      ta.id = q.noteKey; ta.name = q.noteKey; ta.rows = 3; ta.maxLength = 1000;
      ta.placeholder = '入力例）' + q.example;
      f.appendChild(ta);
      var er2 = el('p', 'err'); er2.id = 'err-' + q.noteKey; er2.setAttribute('role', 'alert');
      f.appendChild(er2);
      sec.appendChild(f);
      box.appendChild(sec);
    });
  }

  /* ---------- 値の読み書き ---------- */
  function inputsOf(key) { return Array.prototype.slice.call(form.querySelectorAll('input[name="' + key + '"]')); }
  function read() {
    var d = { guest: $('guest').value, guest_link: $('guest_link').value, introducer: $('introducer').value, meeting_date: $('meeting_date').value };
    parts.forEach(function (p) {
      var on = inputsOf(p.key).filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
      d[p.key] = p.type === 'multi' ? on : (on[0] || '');
    });
    Q.forEach(function (q) { d[q.noteKey] = $(q.noteKey).value; });
    return d;
  }
  function write(d) {
    d = d || {};
    $('guest').value = d.guest || '';
    $('guest_link').value = d.guest_link || '';
    $('introducer').value = d.introducer || '';
    $('meeting_date').value = d.meeting_date || '';
    parts.forEach(function (p) {
      var v = d[p.key];
      var arr = Array.isArray(v) ? v : (v ? [v] : []);
      inputsOf(p.key).forEach(function (i) { i.checked = arr.indexOf(i.value) >= 0; });
    });
    Q.forEach(function (q) { $(q.noteKey).value = d[q.noteKey] || ''; });
  }

  /* ---------- 入力途中の保持（この端末の中だけ） ---------- */
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: submissionId, t: Date.now(), data: read() })); } catch (e) { /* 保存できない端末でも回答はできる */ }
  }
  function loadDraft() {
    try {
      var s = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (s && s.data && typeof s.id === 'string' && Date.now() - s.t < DRAFT_DAYS * 864e5) return s;
    } catch (e) { /* 壊れていたら使わない */ }
    return null;
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 何もしない */ } }
  function changed() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 250);
    progress();
  }

  /* ---------- 検査と案内 ---------- */
  function validate(d) {
    var errs = {};
    if (!d.guest.trim()) errs.guest = 'ゲスト様のお名前を入力してください。';
    if (!d.introducer.trim()) errs.introducer = 'ご紹介者様のお名前を入力してください。';
    parts.forEach(function (p) {
      if (p.type === 'single') { if (!d[p.key]) errs[p.key] = '1つ選択してください。'; }
      else if (!d[p.key].length) errs[p.key] = '1つ以上選択してください。ご存じない場合は「わからない」をお選びください。';
    });
    return errs;
  }
  function showErrors(errs) {
    var first = null;
    Array.prototype.forEach.call(form.querySelectorAll('.err'), function (e) {
      var key = e.id.slice(4);
      var msg = errs[key] || '';
      e.textContent = msg;
      e.classList.toggle('on', !!msg);
      var w = $('wrap-' + key);
      if (w) w.classList.toggle('has-err', !!msg);
      if (msg && !first) first = w;
    });
    return first;
  }
  function clearError(key) {
    var e = $('err-' + key);
    if (e && e.classList.contains('on')) { e.textContent = ''; e.classList.remove('on'); $('wrap-' + key).classList.remove('has-err'); }
  }
  function progress() {
    var d = read(), n = 0, total = 2 + parts.length;
    if (d.guest.trim()) n++;
    if (d.introducer.trim()) n++;
    parts.forEach(function (p) { if (p.type === 'single' ? d[p.key] : d[p.key].length) n++; });
    $('progress').textContent = n === total ? '必須項目はすべて入力済みです。' : '必須項目 ' + n + ' / ' + total + ' 入力済み';
  }
  function notice(msg) {
    var b = $('formError');
    b.textContent = msg || '';
    b.hidden = !msg;
  }

  /* ---------- 送信 ---------- */
  function post(body, tries) {
    if (!API) return Promise.resolve({ ok: false, message: '送信先が設定されていません。運営までお知らせください。' });
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 40000);
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () {
        /* 同じ送信IDで送り直すので、届いていた場合も二重には保存されない */
        if (tries > 0) return new Promise(function (ok) { setTimeout(ok, 1200); }).then(function () { return post(body, tries - 1); });
        return { ok: false, code: 'NETWORK', message: '送信できませんでした。入力内容はそのまま残っています。電波の良い場所で、もう一度「回答を送信する」を押してください。' };
      })
      .then(function (r) { clearTimeout(timer); return r; });
  }
  function setSending(on) {
    sending = on;
    var b = $('submitBtn');
    b.disabled = on;
    b.textContent = '';
    if (on) b.appendChild(el('span', 'spin'));
    b.appendChild(document.createTextNode(on ? '送信しています…' : '回答を送信する'));
  }
  function submit(ev) {
    ev.preventDefault();
    if (sending) return;
    var d = read();
    var errs = validate(d);
    var first = showErrors(errs);
    if (first) {
      var n = Object.keys(errs).length;
      notice('未入力の必須項目が ' + n + ' 件あります。赤い案内の箇所をご確認ください。');
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var f = first.querySelector('input');
      if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* 古い端末 */ }
      return;
    }
    notice('');
    saveDraft();
    setSending(true);
    post({ action: 'submit', id: submissionId, data: d }, 2).then(function (r) {
      setSending(false);
      if (r && r.ok) return done(d);
      if (r && r.code === 'INVALID' && r.fields) {
        var w = showErrors(r.fields);
        notice(r.message);
        if (w) w.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      notice((r && r.message) || '送信できませんでした。入力内容はそのまま残っています。もう一度お試しください。');
    });
  }
  function done(d) {
    clearTimeout(saveTimer);
    clearDraft();
    submissionId = newId(); /* 次の回答は別の送信IDで新しい記録になる */
    form.dataset.introducer = d.introducer;
    $('formView').hidden = true;
    $('doneView').hidden = false;
    window.scrollTo(0, 0);
    bgUpdate();
    try { $('doneView').focus({ preventScroll: true }); } catch (e) { /* 古い端末 */ }
  }
  function again() {
    write({ introducer: form.dataset.introducer || '' });
    showErrors({});
    notice('');
    progress();
    $('doneView').hidden = true;
    $('formView').hidden = false;
    window.scrollTo(0, 0);
    bgUpdate();
  }

  function bgUpdate() { try { window.dispatchEvent(new Event('bg:update')); } catch (e) { /* 古い端末 */ } }
  /* 題名は必ず1行に収める（端末の文字幅に合わせて文字を小さくする） */
  function fitTitle() {
    var t = $('titleLine');
    if (!t) return;
    t.style.fontSize = '';
    var size = parseFloat(getComputedStyle(t).fontSize), max = t.parentNode.clientWidth;
    while (t.scrollWidth > max && size > 13) { size -= 0.5; t.style.fontSize = size + 'px'; }
  }

  /* ---------- 起動 ---------- */
  fitTitle();
  window.addEventListener('resize', fitTitle);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  build();
  var draft = loadDraft();
  if (draft) { submissionId = draft.id; write(draft.data); }
  if (!/^[0-9a-f-]{36}$/.test(submissionId)) submissionId = newId();
  progress();

  form.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t && t.type === 'checkbox' && t.checked) {
      /* 「わからない」は他の選択肢と同時に選べない */
      var p = parts.filter(function (x) { return x.key === t.name; })[0];
      if (p && p.exclusive.length) {
        var isEx = p.exclusive.indexOf(t.value) >= 0;
        inputsOf(p.key).forEach(function (i) {
          if (i === t) return;
          if (isEx || p.exclusive.indexOf(i.value) >= 0) i.checked = false;
        });
      }
    }
    if (t && t.name) clearError(t.name);
    changed();
  });
  form.addEventListener('input', function (ev) {
    if (ev.target && ev.target.name) clearError(ev.target.name);
    changed();
  });
  /* 氏名欄の Enter で誤って送信しない */
  form.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.tagName === 'INPUT' && ev.target.type === 'text') {
      ev.preventDefault();
      if (ev.target.id === 'guest') $('guest_link').focus(); else ev.target.blur();
    }
  });
  form.addEventListener('submit', submit);
  $('againBtn').addEventListener('click', again);
  window.addEventListener('pagehide', function () { if (!$('formView').hidden) saveDraft(); });
})();
