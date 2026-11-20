/* 定例会の参加者リスト（閲覧専用）。Zoom で参加する人が、手元のスマホで見るための資料。
 * URL の # 以降にある閲覧用トークンを API へ本文で送る。チェックや記入はできない。
 * 例: list.html#v=<閲覧用トークン>           … 今日以降でいちばん近い定例会
 *     list.html#v=<閲覧用トークン>&d=2026-12-22 … 指定した日程の定例会 */
(function () {
  var API = window.HEARING_API;
  var $ = function (id) { return document.getElementById(id); };
  var hash = location.hash || '';
  var vtoken = (/[#&]v=([A-Za-z0-9_-]{32,200})/.exec(hash) || [])[1] || '';
  var atoken = (/[#&]k=([A-Za-z0-9_-]{32,200})/.exec(hash) || [])[1] || ''; /* 管理用URLの形でも開ける */
  var wantDate = (/[#&]d=(\d{4}-\d{2}-\d{2})/.exec(hash) || [])[1] || '';
  var state = { date: '', dates: [], people: [], seq: 0 };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function post(body) {
    if (!API) return Promise.resolve({ ok: false, message: '接続先が設定されていません。' });
    if (vtoken) body.vtoken = vtoken; else body.token = atoken;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { ok: false, code: 'NETWORK', message: '通信できませんでした。電波の状態を確認して、画面を読み込み直してください。' }; });
  }
  function withDay(d) {
    var m = /^(\d{4})[/](\d{2})[/](\d{2})$/.exec(String(d || ''));
    if (!m) return String(d || '');
    return +m[1] + '年' + +m[2] + '月' + +m[3] + '日（' + '日月火水木金土'.charAt(new Date(+m[1], +m[2] - 1, +m[3]).getDay()) + '）';
  }
  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    return s.toLowerCase().replace(/\s+/g, '');
  }
  function setError(msg) { var e = $('hoError'); e.textContent = msg || ''; e.hidden = !msg; }

  function load(date) {
    var seq = ++state.seq;
    setError('');
    $('hoLoading').hidden = false;
    $('hoEmpty').hidden = true;
    post({ action: 'viewParticipants', date: date || '' }).then(function (r) {
      if (seq !== state.seq) return;
      $('hoLoading').hidden = true;
      if (!r.ok) {
        if (r.code === 'AUTH') { $('listView').hidden = true; $('denied').hidden = false; return; }
        return setError(r.message || '読み込めませんでした。');
      }
      state.date = r.date || '';
      state.dates = r.dates || [];
      state.people = r.participants || [];
      dates();
      render();
      if (state.date) document.title = withDay(state.date) + ' 定例会 参加者リスト｜真誓会大宮エリア';
    });
  }
  function dates() {
    var sel = $('hoDate');
    sel.textContent = '';
    if (!state.dates.length) { var o = el('option', '', '名簿なし'); o.value = ''; sel.appendChild(o); sel.disabled = true; return; }
    state.dates.forEach(function (d) { var x = el('option', '', withDay(d)); x.value = d; sel.appendChild(x); });
    sel.value = state.date;
    sel.disabled = state.dates.length < 2;
  }
  function render() {
    var q = norm($('hoSearch').value);
    var ol = $('hoList');
    ol.textContent = '';
    var shown = 0;
    state.people.forEach(function (p) {
      if (q && norm([p.no, p.name, p.area, p.biz].concat(p.pr).join(' ')).indexOf(q) < 0) return;
      shown++;
      var li = el('li', 'ho-card');
      var top = el('div', 'ho-top-row');
      top.appendChild(el('span', 'ho-no', p.no));
      top.appendChild(el('span', 'ho-name', p.name));
      top.appendChild(el('span', 'ho-area', p.area));
      li.appendChild(top);
      if (p.biz) li.appendChild(el('p', 'ho-biz', p.biz));
      var prs = p.pr.filter(Boolean);
      if (prs.length) {
        var ul = el('ul', 'ho-pr');
        p.pr.forEach(function (t, i) { if (t) { var x = el('li', '', t); x.setAttribute('data-n', '①②③'.charAt(i)); ul.appendChild(x); } });
        li.appendChild(ul);
      }
      ol.appendChild(li);
    });
    $('hoCount').textContent = !state.people.length ? '' : q ? shown + ' / ' + state.people.length + ' 名' : state.people.length + ' 名';
    var empty = $('hoEmpty');
    empty.hidden = shown > 0;
    empty.textContent = !state.dates.length ? '参加者リストはまだ登録されていません。' : !state.people.length ? 'この日程の参加者リストはまだ登録されていません。' : '条件に合う参加者はいません。';
  }

  if (!vtoken && !atoken) { $('denied').hidden = false; return; }
  $('listView').hidden = false;
  $('hoDate').addEventListener('change', function () { $('hoSearch').value = ''; window.scrollTo(0, 0); load($('hoDate').value); });
  var t = 0;
  $('hoSearch').addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 120); });
  $('hoSearch').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); } });
  var topBtn = $('hoTop'), tq = false;
  window.addEventListener('scroll', function () {
    if (tq) return;
    tq = true;
    requestAnimationFrame(function () { tq = false; topBtn.hidden = (window.pageYOffset || 0) < 600; });
  }, { passive: true });
  topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  load(wantDate);
})();
