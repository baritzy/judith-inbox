(function () {
  'use strict';

  var SHEET_ID = '13givpcblrthEprpyU_3kpeEYU863muzmCltBbJmBiV8';
  var CLIENT_ID = '692989718499-pgn3j8462jljnocgvt0r8vq5agq6vij3.apps.googleusercontent.com';
  var SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  var API = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID;
  var WAIT = '⏳ ממתין', PUB = '✅ פרסם', SKIP = '⏭ דלג', HIDE = '🙈 הסתר', REDO = '🔄 נסח מחדש';
  var NETS = ['יוטיוב', 'אינסטגרם', 'פייסבוק', 'טיקטוק', 'X'];
  var MANUAL_NETS = ['טיקטוק', 'X'];
  var DEMO = new URLSearchParams(location.search).get('demo') === '1';

  var state = { token: null, tokenClient: null, title: null, rows: [], net: 'הכול', pendingOnly: true };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- DOM helper (textContent only, never innerHTML) ----------
  function h(tag, props) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'on') Object.keys(props.on).forEach(function (ev) { e.addEventListener(ev, props.on[ev]); });
      else if (k === 'attrs') Object.keys(props.attrs).forEach(function (a) { e.setAttribute(a, props.attrs[a]); });
      else e[k] = props[k];
    });
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
    return e;
  }

  function safeUrl(s) {
    try {
      var u = new URL(String(s || '').trim());
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (e) { return null; }
  }

  function banner(msg, info) {
    var b = $('banner');
    if (!msg) { b.hidden = true; return; }
    b.textContent = msg;
    b.className = 'banner' + (info ? ' info' : '');
    b.hidden = false;
  }

  // ---------- Demo data ----------
  var demoRows = [
    ['c101', 'יוטיוב', 'פרק 3: הלילה שבו הכול התחיל', 'דנה כהן', 'איזה פרק מדהים, מחכה להמשך!', 'https://example.com/yt/1', '', 'תודה דנה! ההמשך בדרך 🙏', WAIT, '', '26.10 08:10', ''],
    ['c102', 'אינסטגרם', 'ריל: מאחורי הקלעים', 'noam_levi', 'מתי יוצא הפרק הבא? ואיפה אפשר לראות בלי פרסומות', 'https://example.com/ig/2', '', 'הפרק הבא בקרוב, עקבו אחרינו כדי לא לפספס.', WAIT, '', '26.10 08:10', ''],
    ['c103', 'פייסבוק', 'פוסט: הטריילר החדש', 'Moshe Mizrahi', 'זה זבל, תעשו משהו אחר. כנסו לקישור הזה להרוויח כסף מהר', 'https://example.com/fb/3', '⚠️ חשוד: ספאם וקישור לא ידוע', 'תודה על התגובה.', WAIT, '', '26.10 08:11', ''],
    ['c104', 'פייסבוק', 'פוסט: הטריילר החדש', 'יעל ברק', '[GIF, מדבקה או תמונה, בלי טקסט]', 'https://example.com/fb/4', '', '', WAIT, '', '26.10 08:11', ''],
    ['', 'טיקטוק', 'סרטון הקוף', 'user8812', 'חחח הכי טוב ברשת, תמשיכו', '', '', 'תודה רבה! 🐒', WAIT, '', '25.10 21:00', ''],
    ['', 'X', 'שרשור על הסדרה', 'shira_t', 'מישהו יודע מי הקול של הדמות הראשית?', '', '', 'הקול הוא של השחקנית שלנו, פרטים בקרוב.', WAIT, '', '25.10 21:00', ''],
    ['c099', 'יוטיוב', 'פרק 2', 'אבי', 'אהבתי את המוזיקה', 'https://example.com/yt/0', '', 'תודה אבי!', PUB, 'פורסם', '24.10 10:00', '24.10 12:03']
  ];

  // ---------- Row parsing ----------
  function parseRow(vals, rowNum) {
    var v = []; for (var i = 0; i < 12; i++) v.push(vals && vals[i] != null ? String(vals[i]) : '');
    return { n: rowNum, id: v[0], net: v[1], post: v[2], user: v[3], text: v[4], link: v[5],
      susp: v[6], draft: v[7], act: v[8], status: v[9], got: v[10], done: v[11] };
  }
  function fp(r) { return r.id ? 'id:' + r.id : 'm:' + r.net + '|' + r.user + '|' + r.text; }
  function isPending(r) { return r.act.trim() === '' || r.act.trim() === WAIT; }
  function isBlank(r) { return !r.net && !r.text && !r.id; }

  // ---------- Auth ----------
  function loadGsi() {
    return new Promise(function (res, rej) {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('טעינת Google נכשלה')); };
      document.head.appendChild(s);
    });
  }
  var pendingToken = null;
  function requestToken(prompt) {
    return new Promise(function (res, rej) {
      pendingToken = { res: res, rej: rej };
      state.tokenClient.requestAccessToken(prompt === undefined ? {} : { prompt: prompt });
    });
  }
  function initAuth() {
    return loadGsi().then(function () {
      state.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPE,
        callback: function (resp) {
          if (!pendingToken) return;
          var p = pendingToken; pendingToken = null;
          if (resp && resp.access_token) p.res(resp.access_token);
          else p.rej(new Error('ההתחברות נכשלה'));
        },
        error_callback: function () {
          if (!pendingToken) return;
          var p = pendingToken; pendingToken = null;
          p.rej(new Error('ההתחברות בוטלה'));
        }
      });
    });
  }

  function api(path, opts, retried) {
    opts = opts || {};
    var headers = { 'Authorization': 'Bearer ' + state.token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.body }).then(function (r) {
      if (r.status === 401 && !retried) {
        return requestToken('').then(function (t) { state.token = t; return api(path, opts, true); });
      }
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var m = (j && j.error && j.error.message) || ('שגיאה ' + r.status);
          throw new Error(r.status === 403 ? 'אין הרשאה לגיליון (' + m + ')' : m);
        });
      }
      return r.json();
    });
  }
  function q(a1) { return encodeURIComponent("'" + state.title.replace(/'/g, "''") + "'!" + a1); }

  function signIn() {
    banner('');
    initAuth().then(function () { return requestToken(); }).then(function (t) {
      state.token = t;
      showSignedIn(true);
      return loadAll();
    }).catch(function (e) { banner(e.message || 'ההתחברות נכשלה'); });
  }
  function signOut(ev) {
    ev.preventDefault();
    var t = state.token;
    state.token = null; state.rows = [];
    try { if (t && window.google) google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
    showSignedIn(false);
  }
  function showSignedIn(on) {
    $('auth').hidden = on || DEMO;
    $('userbar').hidden = !on;
    $('inbox').hidden = !on;
    $('addsec').hidden = !on;
    $('refresh').hidden = !on;
    if (!on) $('list').replaceChildren();
  }

  // ---------- Load ----------
  function loadAll() {
    if (DEMO) { state.rows = demoRows.map(function (v, i) { return parseRow(v, i + 2); }); render(); return Promise.resolve(); }
    banner('טוען...', true);
    var p = state.title ? Promise.resolve() :
      api('?fields=sheets.properties').then(function (j) { state.title = j.sheets[0].properties.title; });
    return p.then(function () { return api('/values/' + q('A1:L')); }).then(function (j) {
      var vals = j.values || [];
      state.rows = [];
      for (var i = 1; i < vals.length; i++) {
        var r = parseRow(vals[i], i + 1);
        if (!isBlank(r)) state.rows.push(r);
      }
      banner('');
      render();
    }).catch(function (e) { banner('שגיאה בטעינה: ' + e.message); });
  }

  // ---------- Render ----------
  function render() {
    var shown = state.rows.filter(function (r) { return !state.pendingOnly || isPending(r); });
    // chips with pending counts
    var chips = $('chips'); chips.replaceChildren();
    ['הכול'].concat(NETS).forEach(function (n) {
      var cnt = state.rows.filter(function (r) { return isPending(r) && (n === 'הכול' || r.net === n); }).length;
      chips.appendChild(h('button', { type: 'button', className: 'chip' + (state.net === n ? ' on' : ''),
        on: { click: function () { state.net = n; render(); } } },
        h('span', { text: n }), h('span', { className: 'n', text: String(cnt) })));
    });
    $('t-pending').className = state.pendingOnly ? 'on' : '';
    $('t-all').className = state.pendingOnly ? '' : 'on';

    shown = shown.filter(function (r) { return state.net === 'הכול' || r.net === state.net; }).slice().reverse();
    var list = $('list'); list.replaceChildren();
    shown.forEach(function (r) { list.appendChild(card(r)); });
    $('empty').hidden = shown.length > 0;
  }

  function autoGrow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }

  function card(r) {
    var c = h('div', { className: 'card' });
    var meta = h('div', { className: 'meta' },
      h('span', { className: 'badge', text: r.net || '?', attrs: { 'data-net': r.net } }),
      h('span', { className: 'post', text: r.post }));
    c.appendChild(meta);
    c.appendChild(h('div', { className: 'who', text: 'מגיב/ה: ' + r.user }));
    c.appendChild(h('div', { className: 'comment', text: r.text }));
    var url = safeUrl(r.link);
    if (url) c.appendChild(h('a', { text: 'לתגובה', href: url, target: '_blank', rel: 'noopener noreferrer' }));
    if (r.susp.trim()) c.appendChild(h('div', { className: 'warnblock', text: r.susp.indexOf('⚠') >= 0 ? r.susp : '⚠️ ' + r.susp }));
    if (r.status || r.done) {
      c.appendChild(h('div', { className: 'status', text: 'סטטוס: ' + [r.status, r.done ? 'טופלה ' + r.done : ''].filter(Boolean).join(' | ') }));
    }
    var ta = h('textarea', { value: r.draft, rows: 3, placeholder: 'התשובה המוצעת (אפשר לערוך)' });
    ta.setAttribute('aria-label', 'התשובה');
    c.appendChild(ta);
    var result = h('div');
    var btns = {};
    function mk(label, action, cls) {
      var b = h('button', { type: 'button', text: label, className: cls || '',
        on: { click: function () { run(r, ta, action, c, result, btns); } } });
      btns[action] = b; return b;
    }
    var actions = h('div', { className: 'actions' }, mk(PUB, PUB, 'pub'), mk(SKIP, SKIP), mk(HIDE, HIDE), mk(REDO, REDO));
    c.appendChild(actions);
    c.appendChild(result);
    function sync() { btns[PUB].disabled = ta.value.trim() === ''; }
    ta.addEventListener('input', function () { autoGrow(ta); sync(); });
    sync();
    setTimeout(function () { autoGrow(ta); }, 0);
    return c;
  }

  // ---------- Save flow ----------
  function setBusy(btns, on) { Object.keys(btns).forEach(function (k) { btns[k].disabled = on; }); }

  function run(r, ta, action, cardEl, result, btns) {
    var text = ta.value;
    if (action === PUB && text.trim() === '') return;
    result.replaceChildren();
    setBusy(btns, true);
    var job = DEMO ? demoSave(r, text, action) : realSave(r, text, action);
    job.then(function () {
      r.draft = text; r.act = action;
      var manual = MANUAL_NETS.indexOf(r.net) >= 0;
      result.appendChild(h('p', { className: 'ok', text: 'נשמר. יבוצע בריצה הבאה של הבוט (עד 3 שעות)' }));
      if (manual && action === PUB) {
        result.appendChild(h('p', { className: 'ok', text: 'הבוט יסמן להעתקה ידנית. העתיקו את התשובה לרשת' }));
        var msg = h('span', { className: 'status' });
        result.appendChild(h('div', { className: 'copyrow' },
          h('button', { type: 'button', text: '📋 העתק', on: { click: function () {
            copyText(text).then(function () { msg.textContent = 'הועתק'; }, function () { msg.textContent = 'ההעתקה נכשלה, סמנו ידנית'; });
          } } }), msg));
      }
      cardEl.classList.add('done');
      Object.keys(btns).forEach(function (k) { btns[k].disabled = true; });
      ta.readOnly = true;
      // refresh chips counts only (leave the card in place)
    }).catch(function (e) {
      if (e && e.reload) {
        result.appendChild(h('p', { className: 'err', text: 'הגיליון השתנה. טוען מחדש, נסו שוב.' }));
        setTimeout(loadAll, 800);
        return;
      }
      setBusy(btns, false);
      ta.dispatchEvent(new Event('input'));
      result.appendChild(h('p', { className: 'err', text: 'השמירה נכשלה: ' + (e && e.message || e) }));
    });
  }

  function demoSave(r, text, action) {
    return new Promise(function (res) { setTimeout(res, 300); });
  }

  function realSave(r, text, action) {
    var rng = 'A' + r.n + ':L' + r.n;
    return api('/values/' + q(rng)).then(function (j) {
      var cur = parseRow((j.values || [[]])[0], r.n);
      if (fp(cur) !== fp(r)) { var e = new Error('rows shifted'); e.reload = true; throw e; }
      return api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [{ range: "'" + state.title.replace(/'/g, "''") + "'!H" + r.n + ':I' + r.n, values: [[text, action]] }]
      }) });
    }).then(function () {
      return api('/values/' + q('H' + r.n + ':I' + r.n));
    }).then(function (j) {
      var row = (j.values || [[]])[0] || [];
      if ((row[0] || '') !== text || (row[1] || '') !== action) throw new Error('האימות אחרי השמירה נכשל, בדקו בגיליון');
    });
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); }
      ta.remove();
    });
  }

  // ---------- Add manual row ----------
  function addRow(ev) {
    ev.preventDefault();
    var msg = $('a-msg'); msg.hidden = true; msg.className = 'ok';
    var net = $('a-net').value, post = $('a-post').value.trim(), user = $('a-user').value.trim(), text = $('a-text').value.trim();
    if (!post || !user || !text) return;
    var btn = $('a-submit'); btn.disabled = true;
    var row = ['', net, post, user, text, '', '', '', WAIT, '', '', ''];
    var job = DEMO ? new Promise(function (res) { setTimeout(res, 300); }) :
      api('/values/' + q('A:L') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: [row] }) });
    job.then(function () {
      msg.textContent = 'נוסף. הבוט ינסח תשובה בריצה הבאה';
      msg.hidden = false;
      $('a-post').value = ''; $('a-user').value = ''; $('a-text').value = '';
      if (DEMO) { demoRows.push(row); }
      return loadAll();
    }).catch(function (e) {
      msg.className = 'err'; msg.textContent = 'ההוספה נכשלה: ' + e.message; msg.hidden = false;
    }).then(function () { btn.disabled = false; });
  }

  // ---------- Init ----------
  $('signin').addEventListener('click', signIn);
  $('signout').addEventListener('click', signOut);
  $('refresh').addEventListener('click', function () { loadAll(); });
  $('t-pending').addEventListener('click', function () { state.pendingOnly = true; render(); });
  $('t-all').addEventListener('click', function () { state.pendingOnly = false; render(); });
  $('addform').addEventListener('submit', addRow);

  if (DEMO) {
    banner('מצב הדגמה: נתוני דמה, שום דבר לא נשלח', true);
    showSignedIn(true);
    $('userbar').firstElementChild.textContent = 'מצב הדגמה';
    $('signout').hidden = true;
    loadAll();
  }
})();
