/* 管理画面。URL の # 以降にある管理用トークンを API へ本文で送る（URL の # 以降はサーバーへ送られない）。
 * 詳細画面は会議で映して使う想定：左に回答、右に対応・戦略メモ（パソコンのみ入力可）と送信ボタン。 */
(function () {
  var API = window.HEARING_API;
  var PAGE = 30;
  var DRAFT = 'ssk-omiya-memo-draft-v1:';
  var $ = function (id) { return document.getElementById(id); };
  var token = (function () {
    var m = /[#&]k=([A-Za-z0-9_-]{32,200})/.exec(location.hash || '');
    return m ? m[1] : '';
  })();
  /* URL の末尾に &id=回答ID が付いていれば、そのゲストの画面を直接開く */
  var directId = (/[#&]id=([0-9a-f-]{36})/.exec(location.hash || '') || [])[1] || '';
  var state = { items: [], matched: 0, guest: '', introducer: '', meeting: '', seq: 0, detail: null, scrollY: 0,
    memoFields: [], memoMax: 2000, memoId: '', sending: false, saveTimer: 0, dirty: false,
    participants: [], picks: [] /* [{text, idx}]：idx は参加者一覧の行（一覧に無いものは -1） */ };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function post(body) {
    if (!API) return Promise.resolve({ ok: false, message: '接続先が設定されていません。' });
    body.token = token;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { ok: false, code: 'NETWORK', message: '通信できませんでした。電波の状態を確認して、もう一度お試しください。' }; });
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, 3200);
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
    post({ action: 'adminList', guest: state.guest, introducer: state.introducer, meeting: state.meeting, offset: state.items.length, limit: PAGE }).then(function (r) {
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
      meetingOptions(r.meetings || []);
      var filtered = state.guest || state.introducer || state.meeting;
      $('listInfo').textContent = (filtered ? '該当 ' + r.matched + ' 件' : '全 ' + r.total + ' 件') + '・新しい順' + (r.now ? '（' + r.now.slice(11) + ' 時点）' : '');
      $('moreBtn').hidden = state.items.length >= r.matched;
      if (!$('moreBtn').hidden) $('moreBtn').textContent = 'さらに表示する（残り ' + (r.matched - state.items.length) + ' 件）';
      $('listEmpty').hidden = state.items.length > 0;
      $('listEmpty').textContent = filtered ? '条件に合う回答はありません。' : 'まだ回答はありません。';
    });
  }
  function meetingOptions(dates) {
    var sel = $('qMeeting');
    if (state.meeting && dates.indexOf(state.meeting) < 0) dates = dates.concat([state.meeting]);
    sel.textContent = '';
    var o = el('option', '', 'すべての回答'); o.value = ''; sel.appendChild(o);
    dates.forEach(function (d) { var x = el('option', '', withDay(d) + ' の定例会'); x.value = d; sel.appendChild(x); });
    sel.value = state.meeting;
  }
  function row(it) {
    var li = el('li');
    var b = el('button', 'item');
    b.type = 'button';
    b.appendChild(el('time', '', minute(it.at)));
    b.appendChild(el('span', 'name', it.guest + ' 様'));
    b.appendChild(el('span', 'chev', '›'));
    b.appendChild(el('span', 'by', (it.meeting ? '定例会 ' + withDay(it.meeting) + '　' : '') + 'ご紹介：' + it.introducer + ' 様'));
    b.addEventListener('click', function () { open(it.id, true); });
    li.appendChild(b);
    return li;
  }

  /* ---------- 詳細（会議用の画面） ---------- */
  function open(id, push) {
    if (state.detail) saveDraft();
    if ($('listView').hidden === false) state.scrollY = window.scrollY;
    state.detail = null;
    $('detail').textContent = '';
    $('detail').scrollTop = 0;
    $('meeting').hidden = true;
    setError('detailError', '');
    $('detailLoading').hidden = false;
    $('copyBtn').disabled = true;
    show('detailView');
    nav(id);
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
      memoSetup(r);
      $('meeting').hidden = false;
      fitPanel();
    });
  }
  /* 一覧の並びで「前のゲスト」「次のゲスト」へ移る（会議で順に見ていくため） */
  function nav(id) {
    var i = -1;
    state.items.forEach(function (it, k) { if (it.id === id) i = k; });
    var prev = i > 0 ? state.items[i - 1] : null, next = i >= 0 && i < state.items.length - 1 ? state.items[i + 1] : null;
    $('prevBtn').disabled = !prev; $('nextBtn').disabled = !next;
    $('prevBtn').onclick = prev ? function () { step(prev.id); } : null;
    $('nextBtn').onclick = next ? function () { step(next.id); } : null;
    $('posInfo').textContent = i >= 0 ? (i + 1) + ' / ' + state.items.length + ' 人目' : '';
  }
  function step(id) {
    open(id, false);
    try { history.replaceState({ id: id }, '', location.href); } catch (e) { /* 何もしない */ }
  }
  function render(d) {
    var box = $('detail');
    box.textContent = '';
    var head = el('section', 'card guest-head');
    head.appendChild(el('p', 'guest-name', d.guest + ' 様'));
    var dl = el('dl', 'kv');
    [['ご紹介者様', d.introducer + ' 様'], ['参加する定例会', d.meeting ? withDay(d.meeting) : '記載なし'], ['回答登録日時', minute(d.at)]].forEach(function (p) {
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
    var grid = el('div', 'ans-grid');
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
      grid.appendChild(sec);
    });
    box.appendChild(grid);
  }

  /* ---------- 当日の参加者（つなぐ相手の候補） ---------- */
  /* 記載欄とメールに出す形：番号・氏名・所属エリアを空白で区切る */
  function pickText(p) { return [p.no, p.name, p.area].filter(Boolean).join(' '); }
  function renderParticipants() {
    var old = $('partsCard');
    if (old) old.parentNode.removeChild(old);
    var sec = el('section', 'card parts');
    sec.id = 'partsCard';
    sec.appendChild(el('span', 'qno', 'PARTICIPANTS'));
    sec.appendChild(el('h2', '', '当日の参加者（つなぐ相手の候補）'));
    if (!state.participants.length) {
      sec.appendChild(el('p', 'memo none', '参加者リストはまだ読み込まれていません。'));
    } else {
      sec.appendChild(el('p', 'hint-line top pc-only', 'つなぎたい参加者の行をクリックしてチェックすると、右の記載欄の下に番号・氏名・所属エリアが表示されます。（' + state.participants.length + ' 件）'));
      var t = el('div', 'ptable');
      var h = el('div', 'pr ph');
      [['k-no', '番号'], ['k-nm', '氏名'], ['k-ar', '所属エリア'], ['k-bz', '業種'], ['k-p1', 'PR①'], ['k-p2', 'PR②'], ['k-p3', 'PR③'], ['k-ck', 'つなぐ']].forEach(function (x) { h.appendChild(el('span', x[0], x[1])); });
      t.appendChild(h);
      state.participants.forEach(function (p, i) {
        var r = el('label', 'pr');
        r.appendChild(el('span', 'k-no', p.no));
        r.appendChild(el('span', 'k-nm', p.name));
        r.appendChild(el('span', 'k-ar', p.area));
        r.appendChild(el('span', 'k-bz' + (p.biz ? '' : ' none'), p.biz || '—'));
        [0, 1, 2].forEach(function (k) { r.appendChild(el('span', 'k-p' + (k + 1) + (p.pr[k] ? '' : ' none'), p.pr[k] || '—')); });
        var c = el('span', 'k-ck');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = 'pick-' + i;
        cb.setAttribute('aria-label', pickText(p) + ' をつなぐ相手に選ぶ');
        cb.addEventListener('change', function () { togglePick(i, cb.checked); });
        c.appendChild(cb);
        r.appendChild(c);
        t.appendChild(r);
      });
      sec.appendChild(t);
    }
    /* 定例会ごとの名簿（CSV）の読み込み。パソコンのみ */
    var up = el('div', 'parts-tools pc-only');
    var b = el('button', 'btn ghost small', state.participants.length ? '参加者リスト（CSV）を入れ替える' : '参加者リスト（CSV）を読み込む');
    b.type = 'button';
    var f = document.createElement('input');
    f.type = 'file'; f.accept = '.csv,text/csv'; f.hidden = true;
    b.addEventListener('click', function () { f.value = ''; f.click(); });
    f.addEventListener('change', function () { if (f.files && f.files[0]) importCsv(f.files[0]); });
    up.appendChild(b); up.appendChild(f);
    up.appendChild(el('span', 'hint', '名簿のうち、番号・氏名・所属エリア・業種・PR3件だけを取り込みます（所属エリアが空のゲストの行は除きます）。'));
    sec.appendChild(up);
    $('detail').appendChild(sec);
    syncChecks();
  }
  function syncChecks() {
    state.participants.forEach(function (p, i) {
      var cb = $('pick-' + i);
      if (!cb) return;
      var on = state.picks.some(function (x) { return x.idx === i; });
      cb.checked = on;
      cb.parentNode.parentNode.classList.toggle('on', on);
    });
  }
  /* 保存されていた文字列（会社名（エリア））を、今の参加者一覧の行に結びつける */
  function setPicks(texts) {
    var used = {};
    state.picks = (texts || []).map(function (t) {
      var idx = -1;
      state.participants.some(function (p, i) { if (!used[i] && pickText(p) === t) { idx = i; used[i] = 1; return true; } return false; });
      return { text: String(t), idx: idx };
    });
  }
  function togglePick(i, on) {
    state.picks = state.picks.filter(function (x) { return x.idx !== i; });
    if (on) state.picks.push({ text: pickText(state.participants[i]), idx: i });
    pickChanged();
  }
  function pickChanged() {
    state.dirty = true;
    setError('memoError', '');
    memoStatus('入力途中のメモがあります（未送信）。', true);
    renderPicks();
    syncChecks();
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveDraft, 400);
  }
  function renderPicks() {
    var ul = $('pickList');
    ul.textContent = '';
    $('pickCount').textContent = state.picks.length ? state.picks.length + ' 件' : '';
    if (!state.picks.length) { ul.appendChild(el('li', 'none', '左の参加者一覧でチェックした方が、ここに表示されます。')); return; }
    state.picks.forEach(function (x, k) {
      var li = el('li', '', x.text);
      var rm = el('button', 'pick-x', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', x.text + ' を外す');
      rm.addEventListener('click', function () { state.picks.splice(k, 1); pickChanged(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }
  function importCsv(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var buf = reader.result, text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch (e) { try { text = new TextDecoder('shift_jis').decode(buf); } catch (e2) { text = ''; } }
      var rows = pickParticipantColumns(parseCsv(text));
      if (!rows.length) { toast('参加者を読み取れませんでした。定例会の名簿のCSVか確認してください。'); return; }
      if (!window.confirm(rows.length + ' 件の参加者を読み込みます。現在の参加者リストは置き換えられます。よろしいですか？')) return;
      post({ action: 'adminSetParticipants', rows: rows }).then(function (r) {
        if (!r.ok) { if (r.code === 'AUTH') return show('denied'); toast(r.message || '読み込めませんでした。'); return; }
        var texts = state.picks.map(function (x) { return x.text; });
        state.participants = r.participants || [];
        setPicks(texts);
        renderParticipants();
        renderPicks();
        toast(r.count + ' 件の参加者を読み込みました。');
      });
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------- 対応・戦略メモ ---------- */
  function memoRead() {
    var v = {};
    state.memoFields.forEach(function (f) { var t = $('memo-' + f.key); v[f.key] = t ? t.value : ''; });
    return v;
  }
  function memoHasText(v) { return state.memoFields.some(function (f) { return (v[f.key] || '').trim(); }); }
  function saveDraft() {
    clearTimeout(state.saveTimer);
    /* 手を加えていないメモ（読み込んだまま・送信済み）は下書きにしない */
    if (!state.detail || !state.memoFields.length || !state.dirty) return;
    var v = memoRead();
    try {
      if (memoHasText(v) || state.picks.length) localStorage.setItem(DRAFT + state.detail.id, JSON.stringify({ t: Date.now(), memoId: state.memoId, values: v, picks: state.picks.map(function (x) { return x.text; }) }));
      else localStorage.removeItem(DRAFT + state.detail.id);
    } catch (e) { /* 保存できなくても入力は続けられる */ }
  }
  function loadDraft(id) {
    try {
      var s = JSON.parse(localStorage.getItem(DRAFT + id) || 'null');
      if (s && s.values && Date.now() - s.t < 30 * 864e5) return s;
    } catch (e) { /* 壊れていたら使わない */ }
    return null;
  }
  function memoSetup(r) {
    state.memoFields = r.memoFields || [];
    state.memoMax = r.memoMax || 2000;
    state.participants = r.participants || [];
    var panel = $('memoPanel');
    panel.hidden = !state.memoFields.length;
    if (panel.hidden) return;
    var draft = loadDraft(r.detail.id);
    var last = r.memo || null;
    var values = draft ? draft.values : (last ? last.values : {});
    state.memoId = draft && /^[0-9a-f-]{36}$/.test(draft.memoId || '') ? draft.memoId : newId();
    state.dirty = !!draft;
    setError('memoError', '');
    setPicks(draft ? draft.picks : (last ? last.picks : []));
    renderParticipants();
    renderPicks();

    var box = $('memoFields');
    box.textContent = '';
    state.memoFields.forEach(function (f) {
      var w = el('div', 'field');
      var lab = el('label', 'field-label', f.label);
      lab.htmlFor = 'memo-' + f.key;
      w.appendChild(lab);
      var ta = document.createElement('textarea');
      ta.id = 'memo-' + f.key; ta.rows = f.key === 'policy' ? 3 : 2; ta.maxLength = state.memoMax;
      if (f.hint) ta.placeholder = f.hint;
      ta.value = values[f.key] || '';
      w.appendChild(ta);
      box.appendChild(w);
    });

    /* スマホ用：送信済みのメモを読むだけの表示 */
    var read = $('memoRead');
    read.textContent = '';
    if (last) {
      state.memoFields.forEach(function (f) {
        read.appendChild(el('p', 'sub-label', f.label));
        read.appendChild(el('p', last.values[f.key] ? 'memo' : 'memo none', last.values[f.key] || '記載なし'));
      });
      read.appendChild(el('p', 'sub-label', 'つなぐ参加者'));
      read.appendChild(el('p', (last.picks || []).length ? 'memo' : 'memo none', (last.picks || []).length ? last.picks.join('\n') : '選択なし'));
    } else read.appendChild(el('p', 'memo none', 'まだ送信された対応メモはありません。'));

    memoStatus(draft ? '入力途中のメモがあります（未送信）。' : last ? '前回 ' + minute(last.at) + ' に' + (last.mailed ? '送信済み' : '記録済み（メールは未送信）') + 'の内容を表示しています。' : 'まだ送信されていません。', !!draft);
  }
  function memoStatus(text, warn) {
    var s = $('memoStatus');
    s.textContent = text;
    s.classList.toggle('warn', !!warn);
  }
  function memoSending(on) {
    state.sending = on;
    var b = $('memoSend');
    b.disabled = on;
    b.textContent = '';
    if (on) b.appendChild(el('span', 'spin'));
    b.appendChild(document.createTextNode(on ? '送信しています…' : 'まとめをメールで送信する'));
  }
  function memoSend(ev) {
    ev.preventDefault();
    if (state.sending || !state.detail) return;
    var v = memoRead();
    var picks = state.picks.map(function (x) { return x.text; });
    if (!memoHasText(v) && !picks.length) { setError('memoError', '対応メモを入力するか、つなぐ参加者を選んでから送信してください。'); return; }
    setError('memoError', '');
    saveDraft();
    var id = state.detail.id, guest = state.detail.guest;
    memoSending(true);
    post({ action: 'adminSendMemo', id: id, memoId: state.memoId, memo: v, picks: picks }).then(function (r) {
      memoSending(false);
      if (!r.ok) {
        if (r.code === 'AUTH') return show('denied');
        /* メモは残してあるので、そのまま送り直せる */
        return setError('memoError', r.message || '送信できませんでした。もう一度お試しください。');
      }
      try { localStorage.removeItem(DRAFT + id); } catch (e) { /* 何もしない */ }
      if (state.detail && state.detail.id === id) state.dirty = false;
      toast(guest + ' 様の対応メモをメールで送信しました。');
      if (state.detail && state.detail.id === id) {
        state.memoId = newId(); /* 書き直して送るときは別の記録になる */
        memoStatus(minute(r.at) + ' に送信しました。', false);
        var read = $('memoRead');
        read.textContent = '';
        state.memoFields.forEach(function (f) {
          read.appendChild(el('p', 'sub-label', f.label));
          read.appendChild(el('p', v[f.key].trim() ? 'memo' : 'memo none', v[f.key].trim() || '記載なし'));
        });
        read.appendChild(el('p', 'sub-label', 'つなぐ参加者'));
        read.appendChild(el('p', picks.length ? 'memo' : 'memo none', picks.length ? picks.join('\n') : '選択なし'));
      }
    });
  }

  /* パソコン表示では、メモ欄が画面の高さに収まるようにして、下端の送信ボタンを常に見せる */
  var fitQueued = false;
  function fitPanel() {
    fitQueued = false;
    var p = $('memoPanel'), d = $('detail');
    if (window.innerWidth < 1000 || $('detailView').hidden) { p.style.maxHeight = ''; d.style.height = ''; return; }
    /* 左（回答と参加者一覧）と右（記載欄）をそれぞれ画面の高さに収める。左だけを動かしても右は動かない */
    var h = Math.max(320, window.innerHeight - Math.max(14, $('meeting').getBoundingClientRect().top) - 14) + 'px';
    p.style.maxHeight = h; d.style.height = h;
  }
  function fitSoon() { if (!fitQueued) { fitQueued = true; requestAnimationFrame(fitPanel); } }

  /* ---------- 全文コピー（回答＋入力中のメモ） ---------- */
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
    var v = memoRead();
    if (memoHasText(v)) {
      L.push('━━ 会議での対応メモ ━━');
      state.memoFields.forEach(function (f) { L.push('【' + f.label + '】'); L.push((v[f.key] || '').trim() || '（記載なし）'); L.push(''); });
    }
    if (state.picks.length) {
      L.push('━━ つなぐ参加者（番号 氏名 所属エリア） ━━');
      state.picks.forEach(function (x) { L.push('・' + x.text); });
    }
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
      toast(ok ? '全文をコピーしました。' : 'コピーできませんでした。画面の文字を選択してコピーしてください。');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('全文をコピーしました。'); }, fallback);
    } else fallback();
  }
  function back() {
    if (history.state && history.state.id) history.back();
    else toList();
  }
  function toList() {
    saveDraft();
    state.detail = null;
    state.seq++;
    show('listView');
    window.scrollTo(0, state.scrollY || 0);
    if (!state.items.length) load(false); /* ゲストの画面を直接開いた場合は、ここで一覧を読む */
  }

  /* ---------- 起動 ---------- */
  if (!token) { show('denied'); return; }
  show('listView');
  function applySearch() {
    state.guest = $('qGuest').value.trim();
    state.introducer = $('qIntro').value.trim();
    state.meeting = $('qMeeting').value;
    load(false);
  }
  $('searchForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    applySearch();
  });
  $('qMeeting').addEventListener('change', applySearch);
  $('clearBtn').addEventListener('click', function () {
    $('qGuest').value = ''; $('qIntro').value = ''; $('qMeeting').value = '';
    applySearch();
  });
  $('reloadBtn').addEventListener('click', function () { load(false); });
  $('moreBtn').addEventListener('click', function () { load(true); });
  $('backBtn').addEventListener('click', back);
  $('backBtn2').addEventListener('click', back);
  $('copyBtn').addEventListener('click', copy);
  $('memoForm').addEventListener('submit', memoSend);
  $('memoForm').addEventListener('input', function () {
    state.dirty = true;
    setError('memoError', '');
    memoStatus('入力途中のメモがあります（未送信）。', true);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveDraft, 400);
  });
  window.addEventListener('pagehide', saveDraft);
  window.addEventListener('scroll', fitSoon, { passive: true });
  window.addEventListener('resize', fitSoon);
  window.addEventListener('popstate', function (ev) {
    if (ev.state && ev.state.id) open(ev.state.id, false); else toList();
  });
  try { history.replaceState(null, '', location.href); } catch (e) { /* 何もしない */ }
  load(false);
  if (directId) open(directId, true);
})();
