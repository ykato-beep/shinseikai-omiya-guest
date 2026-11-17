/* 管理画面。URL の # 以降にある管理用トークンを API へ本文で送る（URL の # 以降はサーバーへ送られない）。 */
(function () {
  var API = window.HEARING_API;
  var PAGE = 30;
  var $ = function (id) { return document.getElementById(id); };
  var token = (function () {
    var m = /[#&]k=([A-Za-z0-9_-]{32,200})/.exec(location.hash || '');
    return m ? m[1] : '';
  })();
  var state = { items: [], matched: 0, guest: '', introducer: '', seq: 0, detail: null, scrollY: 0 };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function post(body) {
    if (!API) return Promise.resolve({ ok: false, message: '接続先が設定されていません。' });
    body.token = token;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { ok: false, code: 'NETWORK', message: '通信できませんでした。電波の状態を確認して、再読み込みしてください。' }; });
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function show(view) {
    ['denied', 'listView', 'detailView'].forEach(function (v) { $(v).hidden = v !== view; });
  }
  function minute(at) { return String(at || '').slice(0, 16); }
  /* 2026/11/20 → 2026/11/20（金） */
  function withDay(d) {
    var m = /^(\d{4})[/](\d{2})[/](\d{2})$/.exec(String(d || ''));
    if (!m) return String(d || '');
    return d + '（' + '日月火水木金土'.charAt(new Date(+m[1], +m[2] - 1, +m[3]).getDay()) + '）';
  }
  function setError(id, msg) { var e = $(id); e.textContent = msg || ''; e.hidden = !msg; }

  /* ---------- 一覧 ---------- */
  function load(append) {
    var seq = ++state.seq;
    if (!append) { state.items = []; $('list').textContent = ''; $('moreBtn').hidden = true; $('listEmpty').hidden = true; }
    setError('listError', '');
    $('listLoading').hidden = false;
    $('moreBtn').disabled = true;
    post({ action: 'adminList', guest: state.guest, introducer: state.introducer, offset: state.items.length, limit: PAGE }).then(function (r) {
      if (seq !== state.seq) return; /* 後から出した要求の結果だけを使う */
      $('listLoading').hidden = true;
      $('moreBtn').disabled = false;
      if (!r.ok) {
        if (r.code === 'AUTH') return show('denied');
        return setError('listError', r.message || '読み込めませんでした。');
      }
      $('statTotal').textContent = r.total;
      $('statToday').textContent = r.today;
      state.matched = r.matched;
      r.items.forEach(function (it) { state.items.push(it); $('list').appendChild(row(it)); });
      var filtered = state.guest || state.introducer;
      $('listInfo').textContent = (filtered ? '該当 ' + r.matched + ' 件' : '全 ' + r.total + ' 件') + '・新しい順' + (r.now ? '（' + r.now.slice(11) + ' 時点）' : '');
      $('moreBtn').hidden = state.items.length >= r.matched;
      if (!$('moreBtn').hidden) $('moreBtn').textContent = 'さらに表示する（残り ' + (r.matched - state.items.length) + ' 件）';
      $('listEmpty').hidden = state.items.length > 0;
      $('listEmpty').textContent = filtered ? '条件に合う回答はありません。' : 'まだ回答はありません。';
    });
  }
  function row(it) {
    var li = el('li');
    var b = el('button', 'item');
    b.type = 'button';
    var t = el('time', '', minute(it.at));
    b.appendChild(t);
    b.appendChild(el('span', 'name', it.guest + ' 様'));
    b.appendChild(el('span', 'chev', '›'));
    b.appendChild(el('span', 'by', (it.meeting ? '定例会 ' + withDay(it.meeting) + '　' : '') + 'ご紹介：' + it.introducer + ' 様'));
    b.addEventListener('click', function () { open(it.id, true); });
    li.appendChild(b);
    return li;
  }

  /* ---------- 詳細 ---------- */
  function open(id, push) {
    state.scrollY = window.scrollY;
    state.detail = null;
    $('detail').textContent = '';
    setError('detailError', '');
    $('detailLoading').hidden = false;
    $('copyBtn').disabled = true;
    show('detailView');
    window.scrollTo(0, 0);
    if (push) try { history.pushState({ id: id }, '', location.href); } catch (e) { /* 履歴が使えなくても表示はできる */ }
    var seq = ++state.seq;
    post({ action: 'adminDetail', id: id }).then(function (r) {
      if (seq !== state.seq) return;
      $('detailLoading').hidden = true;
      if (!r.ok) {
        if (r.code === 'AUTH') return show('denied');
        return setError('detailError', r.message || '読み込めませんでした。');
      }
      state.detail = r.detail;
      $('copyBtn').disabled = false;
      render(r.detail);
    });
  }
  function render(d) {
    var box = $('detail');
    box.textContent = '';
    var head = el('section', 'card');
    var dl = el('dl', 'kv');
    [['ゲスト様', d.guest + ' 様'], ['ご紹介者様', d.introducer + ' 様'], ['参加する定例会', d.meeting ? withDay(d.meeting) : '記載なし'], ['回答登録日時', minute(d.at)]].forEach(function (p) {
      dl.appendChild(el('dt', '', p[0])); dl.appendChild(el('dd', '', p[1]));
    });
    dl.appendChild(el('dt', '', '会社HP・SNS'));
    var dd = el('dd', d.link ? '' : 'none');
    if (!d.link) dd.textContent = '記載なし';
    else d.link.split(/(\s+)/).forEach(function (tok) {
      /* http(s) のURLだけリンクにする。それ以外は文字のまま */
      if (/^https?:[/][/][^\s]+$/i.test(tok)) {
        var a = el('a', '', tok);
        a.href = tok; a.target = '_blank'; a.rel = 'noopener noreferrer';
        dd.appendChild(a);
      } else dd.appendChild(document.createTextNode(tok));
    });
    dl.appendChild(dd);
    head.appendChild(dl);
    box.appendChild(head);
    d.answers.forEach(function (a) {
      var sec = el('section', 'card ans');
      sec.appendChild(el('span', 'qno', a.no));
      sec.appendChild(el('h2', '', a.title));
      a.parts.forEach(function (p) {
        if (p.label) sec.appendChild(el('p', 'sub-label', p.label));
        var ul = el('ul', 'chips');
        (p.values.length ? p.values : ['（未回答）']).forEach(function (v) { ul.appendChild(el('li', '', v)); });
        sec.appendChild(ul);
      });
      sec.appendChild(el('p', 'sub-label', '補足コメント'));
      sec.appendChild(el('p', a.note ? 'memo' : 'memo none', a.note || '記載なし'));
      box.appendChild(sec);
    });
  }
  function asText(d) {
    var L = ['【真誓会大宮エリア ゲスト様事前ヒアリング】', 'ゲスト様：' + d.guest + ' 様', '会社HP・SNS：' + (d.link || '記載なし'), 'ご紹介者様：' + d.introducer + ' 様', '参加する定例会：' + (d.meeting ? withDay(d.meeting) : '記載なし'), '回答登録日時：' + minute(d.at), ''];
    d.answers.forEach(function (a) {
      L.push('■ ' + a.no + ' ' + a.title);
      a.parts.forEach(function (p) {
        if (p.label) L.push('〔' + p.label + '〕');
        (p.values.length ? p.values : ['（未回答）']).forEach(function (v) { L.push('・' + v); });
      });
      L.push('補足：' + (a.note || '記載なし'));
      L.push('');
    });
    return L.join('\n').trim() + '\n';
  }
  function copy() {
    if (!state.detail) return;
    var text = asText(state.detail);
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? '回答の全文をコピーしました。' : 'コピーできませんでした。画面の文字を選択してコピーしてください。');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('回答の全文をコピーしました。'); }, fallback);
    } else fallback();
  }
  function back() {
    if (history.state && history.state.id) history.back();
    else toList();
  }
  function toList() {
    state.seq++;
    show('listView');
    window.scrollTo(0, state.scrollY || 0);
  }

  /* ---------- 起動 ---------- */
  if (!token) { show('denied'); return; }
  show('listView');
  $('searchForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    state.guest = $('qGuest').value.trim();
    state.introducer = $('qIntro').value.trim();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    load(false);
  });
  $('clearBtn').addEventListener('click', function () {
    $('qGuest').value = ''; $('qIntro').value = '';
    state.guest = ''; state.introducer = '';
    load(false);
  });
  $('reloadBtn').addEventListener('click', function () { load(false); });
  $('moreBtn').addEventListener('click', function () { load(true); });
  $('backBtn').addEventListener('click', back);
  $('backBtn2').addEventListener('click', back);
  $('copyBtn').addEventListener('click', copy);
  window.addEventListener('popstate', function (ev) {
    if (ev.state && ev.state.id) open(ev.state.id, false); else toList();
  });
  try { history.replaceState(null, '', location.href); } catch (e) { /* 何もしない */ }
  load(false);
})();
