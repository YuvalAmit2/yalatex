/* web/notes.js -- interactive features of the HTML notes (tex4ht + MathJax build).
 *
 * Works on the page build.mjs makes:
 *   - article.ya-article > section.ya-sec.ya-sec-N, headings h2..h5 first
 *   - statements: .ya-env.ya-box (.ya-head + .ya-body) or .ya-env.ya-plain
 *     (run-in span.ya-head in its first paragraph); proofs .ya-proof
 *   - formulas: .ya-math[data-tex] > mjx-container (MathJax CHTML, rendered
 *     at build time; characters are mjx-c elements whose class names the
 *     code point, e.g. mjx-c1D465)
 *   - defined words: a.ya-tl[data-ya-term=N]; data.terms[N] = definition ids
 *
 * Features: top bar, sidebar contents (hideable), Show menu (fold or unfold
 * all proofs, boxes, extras, sections), foldable statements, proofs and
 * sections, hover previews of references and defined words, notation linked
 * in formulas, find-in-page that understands TeX, permalinks, dark mode.
 * The page reads normally with JavaScript off.
 */
(function () {
  'use strict';
  var D = document;

  // ---------------------------------------------------------------- settings
  var PREVIEW_DELAY = 180;        // ms of hovering before a preview opens
  var PREVIEW_HIDE_DELAY = 250;   // ms after leaving before it closes
  var SEARCH_DELAY = 150;         // ms after the last keystroke before searching
  var MAX_HITS = 5000;            // matches highlighted at most

  var GROUPS = [
    { key: 'chapters', label: 'Chapters', sel: 'section.ya-sec-1' },
    { key: 'sections', label: 'Sections', sel: 'section.ya-sec-2, section.ya-sec-3' },
    { key: 'boxes', label: 'Boxes', sel: '.ya-box' },
    { key: 'extras', label: 'Statements', sel: '.ya-plain' },            // examples, remarks, exercises, ...
    { key: 'proofs', label: 'Proofs', sel: 'details.ya-proof-fold' }
  ];

  // ---------------------------------------------------------------- utilities
  var store = {
    get: function (k) { try { return localStorage.getItem('ya:' + k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem('ya:' + k); else localStorage.setItem('ya:' + k, v); } catch (e) { } }
  };
  var data = {}, macros = {};
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  function el(tag, attrs, html) {
    var e = D.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function byId(id) { try { return D.getElementById(decodeURIComponent(id)); } catch (e) { return D.getElementById(id); } }
  function clean(s) { return s.replace(/\s+/g, ' ').trim(); }
  function barHeight() { var b = D.querySelector('.ya-bar'); return b ? b.offsetHeight : 0; }
  function stripIds(node) {
    if (node.removeAttribute) node.removeAttribute('id');
    node.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    return node;
  }
  // the heading of a section or statement
  function titleOf(node) {
    if (!node || !node.querySelector) return null;
    if (node.tagName === 'SECTION') return node.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > h5');
    if (node.classList.contains('ya-box')) return node.querySelector(':scope > .ya-head');
    if (node.classList.contains('ya-plain')) return node.querySelector('.ya-head');
    return null;
  }
  // a formula: the mjx-container, its TeX on the .ya-math wrapper
  var MATH = 'mjx-container';
  function isMathEl(n) { return n.nodeType === 1 && n.localName === 'mjx-container'; }
  function texOfEl(n) { var w = n.closest('.ya-math'); return w ? w.getAttribute('data-tex') || '' : ''; }
  // the characters of a piece of CHTML (each mjx-c names its code point)
  function chText(e) {
    var s = '';
    e.querySelectorAll('mjx-c').forEach(function (c) {
      var m = /\bmjx-c([0-9A-F]+)\b/.exec(c.className);
      if (m) s += String.fromCodePoint(parseInt(m[1], 16));
    });
    return s;
  }

  var ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>',
    hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 4.5h18M10 9.5h11M10 14.5h11M3 19.5h18"/><path d="M3 12l4.5-3.5v7z" fill="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4v16A8 8 0 0 0 12 4z" fill="currentColor"/></svg>'
  };

  // ---------------------------------------------------------------- theme
  function applyTheme(t) {
    if (t === 'dark' || t === 'light') D.documentElement.setAttribute('data-theme', t);
    else D.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store.get('theme'));

  var article;
  function init() {
    try { data = JSON.parse(D.getElementById('ya-data').textContent) || {}; } catch (e) { data = {}; }
    macros = data.macros || {};
    article = D.querySelector('.ya-article');
    if (!article) return;
    setupFolding();
    setupProofs();
    buildBar();
    buildToc();
    setupShowMenu();
    setupPreviews();
    setupSearch();
    linkNotation();
    setupLinks();
    D.body.classList.add('ya-ready');
    if (location.hash) setTimeout(function () { reveal(byId(location.hash.slice(1)), false); }, 50);
  }

  // ---------------------------------------------------------------- folding
  // Click the heading of a statement, section or subsection to fold it. The
  // arrow sits in the left margin.
  function setupFolding() {
    article.querySelectorAll('.ya-env, section.ya-sec-1, section.ya-sec-2, section.ya-sec-3').forEach(function (box) {
      var t = titleOf(box);
      if (!t) return;
      if (box.classList.contains('ya-plain')) {
        // a run-in heading: the rest of its paragraph folds with the statement
        var rest = el('span', { 'class': 'ya-runin-rest' });
        while (t.nextSibling) rest.appendChild(t.nextSibling);
        t.parentNode.appendChild(rest);
        t.parentNode.classList.add('ya-runin-p');
      }
      t.insertBefore(el('span', { 'class': 'ya-chev ya-ui', 'aria-hidden': 'true' }, '▾'), t.firstChild);
      t.classList.add('ya-foldable');
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'button');
      t.setAttribute('aria-expanded', 'true');
      t.addEventListener('click', function (e) {
        if (e.target.closest('a') || (window.getSelection && String(window.getSelection()).length)) return;
        fold(box);
      });
      t.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); fold(box); }
      });
    });
  }
  // fold(node) toggles; fold(node, true/false) folds/unfolds.
  function fold(node, collapse) {
    if (node.tagName === 'DETAILS') {
      if (collapse === undefined) collapse = node.open;
      node.open = !collapse;
    } else {
      if (collapse === undefined) collapse = !node.classList.contains('ya-collapsed');
      node.classList.toggle('ya-collapsed', collapse);
      var t = titleOf(node);
      if (t) t.setAttribute('aria-expanded', String(!collapse));
    }
    refreshShowMenu();
  }
  function isFolded(node) { return node.tagName === 'DETAILS' ? !node.open : node.classList.contains('ya-collapsed'); }

  // ---------------------------------------------------------------- proofs
  // Each proof becomes a <details>: click "Proof." to fold it.
  function setupProofs() {
    article.querySelectorAll('div.ya-proof').forEach(function (p) {
      var head = p.querySelector('.ya-proof-head');
      var d = el('details', { 'class': 'ya-proof-fold' });
      var s = el('summary');
      s.textContent = head ? clean(head.textContent) : 'Proof.';
      p.replaceWith(d);
      d.appendChild(s);
      d.appendChild(p);
      d.open = true;
      d.addEventListener('toggle', refreshShowMenu);
      var prev = d.previousElementSibling;
      if (prev && prev.classList.contains('ya-env')) d.yaOf = prev;
    });
  }

  // ---------------------------------------------------------------- top bar
  function buildBar() {
    var bar = el('div', { 'class': 'ya-bar', role: 'toolbar', 'aria-label': 'Notes tools' });
    var findKey = isMac ? '⌘F' : 'Ctrl+F';
    bar.innerHTML =
      '<button id="ya-toc-btn" class="ya-btn ya-icon-only" type="button" aria-label="Contents" title="Show or hide the contents">' + ICON.menu + '</button>' +
      '<span class="ya-course"></span><span class="ya-spacer"></span>' +
      '<div class="ya-search" role="search">' +
        '<label class="ya-find-icon" for="ya-find" title="Find (' + findKey + ')">' + ICON.find + '</label>' +
        '<input id="ya-find" type="search" aria-label="Find in these notes" autocomplete="off" spellcheck="false">' +
        '<span class="ya-count" aria-live="polite"></span>' +
        '<button class="ya-btn ya-icon-only ya-sbtn" id="ya-prev" type="button" title="Previous match (Shift+Enter)" aria-label="Previous match">' + ICON.up + '</button>' +
        '<button class="ya-btn ya-icon-only ya-sbtn" id="ya-next" type="button" title="Next match (Enter)" aria-label="Next match">' + ICON.down + '</button>' +
      '</div>' +
      '<div class="ya-menu-wrap">' +
        '<button id="ya-show-btn" class="ya-btn" type="button" aria-haspopup="true" aria-expanded="false" title="Fold away all chapters, sections, boxes, statements or proofs">' +
          ICON.hide + '<span class="ya-label">Hide</span></button>' +
        '<div class="ya-menu" role="menu" aria-label="Hide" hidden></div>' +
      '</div>' +
      (data.pdf ? '<a class="ya-btn" href="' + esc(data.pdf) + '" title="PDF version">' + ICON.pdf + '<span class="ya-label">PDF</span></a>' : '') +
      '<button id="ya-theme-btn" class="ya-btn ya-icon-only" type="button">' + ICON.theme + '</button>';
    bar.querySelector('.ya-course').textContent = data.title || D.title;
    D.body.insertBefore(bar, D.body.firstChild);

    // One click switches between light and dark. The choice is remembered,
    // unless it is what the system shows anyway: then the page follows the
    // system again.
    var themeBtn = bar.querySelector('#ya-theme-btn');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    function shown() { return D.documentElement.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light'); }
    function label() {
      var next = shown() === 'dark' ? 'light' : 'dark';
      themeBtn.title = 'Switch to ' + next + ' mode';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    label();
    themeBtn.addEventListener('click', function () {
      var next = shown() === 'dark' ? 'light' : 'dark';
      var system = systemDark.matches ? 'dark' : 'light';
      store.set('theme', next === system ? null : next);
      applyTheme(next === system ? null : next);
      label();
    });
    if (systemDark.addEventListener) systemDark.addEventListener('change', label);
  }

  // ---------------------------------------------------------------- Show menu
  // One checkbox per group: checked = all folded, empty = all unfolded, a dash
  // = some of each. Which groups are folded is remembered.
  var menuReady = false;
  function setupShowMenu() {
    var btn = D.getElementById('ya-show-btn'), menu = D.querySelector('.ya-menu');
    menu.innerHTML = GROUPS.map(function (g) {
      return '<button class="ya-mi" type="button" role="menuitemcheckbox" data-key="' + g.key + '" aria-checked="true">' +
        '<span class="ya-check"></span><span class="ya-mi-label">' + esc(g.label) + '</span></button>';
    }).join('');
    var items = Array.prototype.slice.call(menu.querySelectorAll('.ya-mi'));
    function open(on, focusFirst) {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on && focusFirst) items[0].focus();
    }
    btn.addEventListener('click', function () { open(menu.hidden, false); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true, true); } });
    items.forEach(function (it, i) {
      it.addEventListener('click', function () {
        var g = GROUPS.filter(function (x) { return x.key === it.dataset.key; })[0];
        foldGroup(g, it.getAttribute('aria-checked') !== 'true');
      });
      it.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i + items.length - 1) % items.length].focus(); }
        else if (e.key === 'Escape') { open(false); btn.focus(); }
      });
    });
    D.addEventListener('click', function (e) { if (!menu.hidden && !e.target.closest('.ya-menu-wrap')) open(false); });
    var saved = {};
    try { saved = JSON.parse(store.get('folded') || '{}') || {}; } catch (e) { }
    menuReady = true;
    GROUPS.forEach(function (g) { if (saved[g.key]) foldGroup(g, true); });
    refreshNow();
  }
  function foldGroup(g, collapse) {
    var was = menuReady;
    menuReady = false;
    article.querySelectorAll(g.sel).forEach(function (n) { fold(n, collapse); });
    menuReady = was;
    var saved = {};
    try { saved = JSON.parse(store.get('folded') || '{}') || {}; } catch (e) { }
    saved[g.key] = collapse;
    store.set('folded', JSON.stringify(saved));
    refreshShowMenu();
  }
  var refreshQueued = false;
  function refreshShowMenu() {
    if (!menuReady || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () { refreshQueued = false; refreshNow(); });
  }
  function refreshNow() {
    D.querySelectorAll('.ya-mi').forEach(function (it) {
      var g = GROUPS.filter(function (x) { return x.key === it.dataset.key; })[0];
      var nodes = article.querySelectorAll(g.sel), folded = 0;
      nodes.forEach(function (n) { if (isFolded(n)) folded++; });
      it.setAttribute('aria-checked', folded === 0 ? 'false' : folded === nodes.length ? 'true' : 'mixed');
    });
  }

  // ---------------------------------------------------------------- contents
  function buildToc() {
    var btn = D.getElementById('ya-toc-btn');
    var secs = article.querySelectorAll('section.ya-sec-1, section.ya-sec-2, section.ya-sec-3');
    if (!secs.length) { btn.remove(); return; }
    var nav = el('nav', { 'class': 'ya-toc', 'aria-label': 'Contents', id: 'ya-toc' });
    var ol = el('ol');
    var links = [];
    secs.forEach(function (sec) {
      var t = titleOf(sec);
      if (!t || !sec.id) return;
      var level = sec.classList.contains('ya-sec-1') ? 1 : sec.classList.contains('ya-sec-2') ? 2 : 3;
      var num = sec.getAttribute('data-num') || '';
      var copy = stripIds(t.cloneNode(true));
      copy.querySelectorAll('.ya-secnum, .ya-ui').forEach(function (n) { n.remove(); });
      copy.querySelectorAll('a').forEach(function (n) { n.replaceWith.apply(n, Array.from(n.childNodes)); });
      var li = el('li', { 'class': 'ya-toc-' + level });
      var a = el('a', { href: '#' + sec.id });
      a.innerHTML = (num && level > 1 ? '<span class="ya-toc-num">' + esc(num) + '</span>' : (num ? esc(num) + '. ' : '')) + copy.innerHTML.trim();
      li.appendChild(a);
      ol.appendChild(li);
      links.push({ a: a, h: t });
    });
    nav.appendChild(ol);
    D.body.appendChild(nav);
    btn.setAttribute('aria-controls', 'ya-toc');

    var wide = window.matchMedia('(min-width: 72rem)');
    if (store.get('toc') === 'hidden') D.body.classList.add('ya-toc-hidden');
    function sync() {
      var visible = wide.matches ? !D.body.classList.contains('ya-toc-hidden') : D.body.classList.contains('ya-toc-open');
      btn.setAttribute('aria-expanded', String(visible));
    }
    btn.addEventListener('click', function () {
      if (wide.matches) {
        var hide = !D.body.classList.contains('ya-toc-hidden');
        D.body.classList.toggle('ya-toc-hidden', hide);
        store.set('toc', hide ? 'hidden' : null);
      } else D.body.classList.toggle('ya-toc-open');
      sync();
    });
    if (wide.addEventListener) wide.addEventListener('change', sync);
    sync();
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      // the clicked entry is the current one; the sidebar stays put while the page scrolls there
      jumping = true;
      setCurrent(links.filter(function (l) { return l.a === a; })[0] || null, false);
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(endJump, 1500);
      if (!wide.matches) { D.body.classList.remove('ya-toc-open'); sync(); }
    });
    function endJump() { jumping = false; clearTimeout(jumpTimer); }
    setupTocResize(nav, wide, sync);
    D.addEventListener('click', function (e) {
      if (D.body.classList.contains('ya-toc-open') && !e.target.closest('.ya-toc, #ya-toc-btn')) { D.body.classList.remove('ya-toc-open'); sync(); }
    });

    // highlight the section being read
    var current = null, pending = false, jumping = false, jumpTimer = 0;
    function setCurrent(best, follow) {
      if (best === current) return;
      if (current) current.a.classList.remove('ya-current');
      if (best) {
        best.a.classList.add('ya-current');
        var ar = best.a.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (follow && (ar.top < nr.top + 40 || ar.bottom > nr.bottom - 20)) nav.scrollTop += ar.top - nr.top - nr.height / 3;
      }
      current = best;
    }
    function update() {
      pending = false;
      if (jumping) return;
      var top = barHeight() + 40, best = null;
      for (var i = 0; i < links.length; i++) {
        var r = links[i].h.getBoundingClientRect();
        if (!r.height && !r.width) continue;           // in a folded section
        if (r.top <= top) best = links[i]; else break;
      }
      setCurrent(best, true);
    }
    window.addEventListener('scroll', function () { if (!pending) { pending = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('scrollend', function () { if (jumping) { endJump(); } });
    update();
  }

  // Drag the sidebar's right edge to widen or narrow it (the width is
  // remembered); dragging it far enough left closes it, as the menu button does.
  var TOC_MIN = 180, TOC_CLOSE = 110;
  function setupTocResize(nav, wide, sync) {
    var root = D.documentElement;
    var saved = parseFloat(store.get('tocw'));
    if (saved >= TOC_MIN) root.style.setProperty('--toc-w', saved + 'px');
    var grip = el('div', { 'class': 'ya-toc-grip ya-ui', role: 'separator', 'aria-orientation': 'vertical',
      'aria-label': 'Resize the contents', title: 'Drag to resize; drag to the left to close' });
    D.body.appendChild(grip);
    var dragging = false, closing = false;
    function maxW() { return Math.min(600, window.innerWidth * 0.5); }
    grip.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true; closing = false;
      grip.setPointerCapture(e.pointerId);
      D.body.classList.add('ya-toc-resizing');
    });
    // While dragging, only the sidebar moves (it is cheap to redraw); the text
    // beside it is laid out again once, on letting go.
    var x = 0, frame = 0;
    function draw() {
      frame = 0;
      closing = x < TOC_CLOSE;
      D.body.classList.toggle('ya-toc-closing', closing);
      var w = Math.round(Math.min(maxW(), Math.max(TOC_MIN, x))) + 'px';
      nav.style.width = w;
      grip.style.left = 'calc(' + w + ' - 4px)';
    }
    grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      x = e.clientX;
      if (!frame) frame = requestAnimationFrame(draw);
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (frame) { cancelAnimationFrame(frame); draw(); }
      var w = nav.style.width;
      nav.style.width = grip.style.left = '';
      D.body.classList.remove('ya-toc-resizing', 'ya-toc-closing');
      if (!closing && w) root.style.setProperty('--toc-w', w);
      if (closing) {
        // closed: reopening brings back the last width before the drag
        var w = parseFloat(store.get('tocw'));
        if (w >= TOC_MIN) root.style.setProperty('--toc-w', w + 'px'); else root.style.removeProperty('--toc-w');
        if (wide.matches) { D.body.classList.add('ya-toc-hidden'); store.set('toc', 'hidden'); }
        else D.body.classList.remove('ya-toc-open');
        sync();
      } else store.set('tocw', String(parseFloat(getComputedStyle(root).getPropertyValue('--toc-w'))));
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    // double-click: back to the standard width
    grip.addEventListener('dblclick', function () { root.style.removeProperty('--toc-w'); store.set('tocw', null); });
  }

  // ---------------------------------------------------------------- going to a target
  function unhide(node) {
    for (var n = node; n && n !== article; n = n.parentElement) {
      if (n.tagName === 'DETAILS' && !n.open) fold(n, false);
      if (n.classList && n.classList.contains('ya-collapsed') && !(node !== n && titleOf(n) && titleOf(n).contains(node))) fold(n, false);
    }
  }
  // what a link target shows: an equation's display, a statement, a section...
  function targetBlock(t) {
    var eq = equationOf(t);
    if (eq) return eq;
    if (t.tagName === 'SECTION' || t.closest('h2, h3, h4, h5')) return t.closest('section') || t;
    return t.closest('.ya-env') || t.closest('dd, li') || t.closest('p') || t;
  }
  // tex4ht puts an equation's anchor right after the display
  function equationOf(t) {
    if (t.tagName !== 'A' || t.textContent.trim()) return null;
    var prev = t.previousSibling;
    while (prev && prev.nodeType === 3 && !prev.data.trim()) prev = prev.previousSibling;
    if (!prev && t.parentElement.tagName === 'P') prev = t.parentElement.previousElementSibling;
    return prev && prev.nodeType === 1 && prev.classList.contains('ya-display') ? prev : null;
  }
  function reveal(target, smooth) {
    if (!target) return;
    unhide(target);
    var focus = targetBlock(target);
    if (focus.tagName === 'SECTION') focus = titleOf(focus) || focus;
    focus.scrollIntoView({ behavior: smooth === false ? 'auto' : 'smooth', block: 'start' });
    focus.classList.remove('ya-flash');
    void focus.offsetWidth;
    focus.classList.add('ya-flash');
  }

  function setupLinks() {
    D.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var id = a.getAttribute('href').slice(1);
      var t = byId(id);
      if (!t) return;
      e.preventDefault();
      closePops(0);
      history.pushState(null, '', '#' + id);
      reveal(t);
    });
    window.addEventListener('popstate', function () { if (location.hash) reveal(byId(location.hash.slice(1)), false); });
  }

  // ---------------------------------------------------------------- previews
  // Hovering a reference shows what it points to; previews can nest. On touch
  // screens, the first tap previews and the preview has a link to go there.
  var touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
  var pops = [];            // open previews, innermost last: {el, link}
  var showTimer = null, hideTimer = null, hoverNode = null;
  var LINK = 'a, [data-ya-term]';

  function previewTarget(a) {
    if (a && a.hasAttribute && a.hasAttribute('data-ya-term')) return previewTargets(a)[0] || null;
    if (!a || !a.matches('a[href^="#"]') || a.closest('.ya-toc, .ya-bar')) return null;
    var t = byId(a.getAttribute('href').slice(1));
    if (!t || t.closest('.ya-pop')) return null;
    return t;
  }
  function previewContent(t) {
    var frag = D.createDocumentFragment();
    var block = targetBlock(t);
    if (block.tagName === 'SECTION') {
      var h = titleOf(block);
      var title = h ? stripIds(h.cloneNode(true)) : null;
      if (title) title.querySelectorAll('.ya-ui').forEach(function (n) { n.remove(); });
      frag.appendChild(el('div', { 'class': 'ya-pop-title' }, title ? title.innerHTML : ''));
      var first = block.querySelector(':scope > p, :scope > .ya-env, :scope > details');
      if (first) frag.appendChild(stripIds(first.cloneNode(true)));
    } else if (block.tagName === 'P') {
      // a whole TeX paragraph: the build splits one around its displays
      paragraphRun(block).forEach(function (n) { frag.appendChild(stripIds(n.cloneNode(true))); });
    } else {
      var c = stripIds(block.cloneNode(true));
      c.classList.remove('ya-collapsed', 'ya-flash');
      c.querySelectorAll('.ya-collapsed').forEach(function (d) { d.classList.remove('ya-collapsed'); });
      c.querySelectorAll('details').forEach(function (d) { d.open = true; });
      if (block.tagName === 'DD' || block.tagName === 'LI') { var w = el('div', { 'class': 'ya-pop-item' }); w.appendChild(c); c = w; }
      frag.appendChild(c);
    }
    return frag;
  }
  // The pieces of the TeX paragraph p is in: p.ya-cont continues a paragraph
  // after a display (div.ya-block), see build.mjs.
  function paragraphRun(p) {
    var start = p;
    while (start.classList.contains('ya-cont') && start.previousElementSibling && start.previousElementSibling.classList.contains('ya-block')) {
      var before = start.previousElementSibling.previousElementSibling;
      if (!before || before.tagName !== 'P') break;
      start = before;
    }
    var run = [start], n = start.nextElementSibling;
    while (n && n.classList.contains('ya-block')) {
      var after = n.nextElementSibling;
      run.push(n);
      if (!after || !after.classList.contains('ya-cont')) break;
      run.push(after);
      n = after.nextElementSibling;
    }
    return run;
  }

  // a defined word previews all its definitions: the nearest one before it
  // first, then the rest in order
  function previewTargets(a) {
    var n = a.getAttribute('data-ya-term');
    var ids = n != null && data.terms && data.terms[+n];
    if (!ids) return a.matches('a') ? [previewTarget(a)] : [];
    var defs = ids.map(byId).filter(Boolean);
    var before = defs.filter(function (d) { return d.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING; });
    var after = defs.filter(function (d) { return before.indexOf(d) < 0; });
    return before.reverse().concat(after);
  }
  function openPop(a) {
    var t = previewTarget(a);
    if (!t) return;
    var level = levelOf(a);
    if (pops[level] && pops[level].link === a) return;
    closePops(level);
    var pop = el('div', { 'class': 'ya-pop', role: 'dialog' });
    var all = a.hasAttribute('data-ya-term') ? previewTargets(a) : [t];
    all.forEach(function (d) { pop.appendChild(previewContent(d)); });
    if (touch) {
      var go = el('a', { 'class': 'ya-pop-go', href: a.getAttribute('href') || '#' + all[0].id });
      go.textContent = 'Go there →';
      pop.appendChild(go);
    }
    D.body.appendChild(pop);
    place(pop, a);
    pop.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', scheduleHide);
    pops.push({ el: pop, link: a });
  }
  function place(pop, a) {
    var r = a.getClientRects()[0] || a.getBoundingClientRect();
    var sx = window.scrollX, sy = window.scrollY, vw = D.documentElement.clientWidth, vh = window.innerHeight;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left), vw - w - 8);
    var bar = barHeight();
    var below = vh - r.bottom, above = r.top - bar;
    var top = (below >= h + 10 || below >= above) ? r.bottom + 6 : r.top - h - 6;
    top = Math.max(top, bar + 6);
    pop.style.left = (left + sx) + 'px';
    pop.style.top = (top + sy) + 'px';
  }
  function levelOf(node) {
    for (var i = pops.length - 1; i >= 0; i--) if (pops[i].el.contains(node)) return i + 1;
    return 0;
  }
  function closePops(level) { while (pops.length > level) pops.pop().el.remove(); }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      var keep = levelOf(hoverNode);
      var a = hoverNode && hoverNode.closest && hoverNode.closest(LINK);
      if (a && pops[keep] && pops[keep].link === a) keep++;
      closePops(keep);
    }, PREVIEW_HIDE_DELAY);
  }
  function setupPreviews() {
    if (!touch) {
      D.addEventListener('mouseover', function (e) {
        hoverNode = e.target;
        var a = e.target.closest && e.target.closest(LINK);
        clearTimeout(showTimer);
        if (a && previewTarget(a)) {
          clearTimeout(hideTimer);
          showTimer = setTimeout(function () { if (hoverNode && a.contains(hoverNode)) openPop(a); }, PREVIEW_DELAY);
        } else if (pops.length) scheduleHide();
      });
      D.addEventListener('mouseleave', function () { hoverNode = null; scheduleHide(); });
    } else {
      D.addEventListener('click', function (e) {
        var a = e.target.closest(LINK);
        if (a && !a.classList.contains('ya-pop-go') && previewTarget(a)) {
          var level = levelOf(a);
          if (!(pops[level] && pops[level].link === a)) { e.preventDefault(); e.stopPropagation(); openPop(a); return; }
        }
        if (!e.target.closest('.ya-pop')) closePops(0);
      }, true);
    }
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(0); });
    window.addEventListener('resize', function () { closePops(0); });
  }

  // ================================================================ TeX matching
  // Formulas are compared by structure, not by spelling (see the old LaTeXML
  // version for the full description): macros from ya-macros.tex expanded,
  // spaces, sizes, spacing and styles ignored, braces around one item removed,
  // common commands read with their arguments, scripts in one order, primes
  // as ^\prime, spellings of one symbol merged. Scripts the query leaves out
  // are not checked, so x^2 matches x_n^2.
  var TEX_DROP = {}, TEX_DROP_ARG = {}, TEX_SAME = {
    '\\to': '\\rightarrow', '\\gets': '\\leftarrow', '\\le': '\\leq', '\\ge': '\\geq', '\\ne': '\\neq',
    '\\leqslant': '\\leq', '\\geqslant': '\\geq', '\\lt': '<', '\\gt': '>',
    '\\lbrace': '\\{', '\\rbrace': '\\}', '\\vert': '|', '\\lvert': '|', '\\rvert': '|', '\\mid': '|',
    '\\Vert': '\\|', '\\lVert': '\\|', '\\rVert': '\\|', '\\colon': ':',
    '\\ldots': '\\dots', '\\cdots': '\\dots', '\\dotsc': '\\dots', '\\dotsb': '\\dots', '\\dotsm': '\\dots',
    '\\dotsi': '\\dots', '\\dotso': '\\dots', '\\land': '\\wedge', '\\lor': '\\vee', '\\lnot': '\\neg',
    '\\varnothing': '\\emptyset', '\\varepsilon': '\\epsilon', '\\varphi': '\\phi', '\\vartheta': '\\theta',
    '\\dfrac': '\\frac', '\\tfrac': '\\frac', '\\bar': '\\overline', '\\hat': '\\widehat', '\\tilde': '\\widetilde',
    '\\mathrm': '\\operatorname', '\\textrm': '\\text', '\\mbox': '\\text', '\\textnormal': '\\text',
    '\\implies': '\\Longrightarrow', '\\impliedby': '\\Longleftarrow', '\\iff': '\\Longleftrightarrow',
    '\\smallsetminus': '\\setminus', '\\owns': '\\ni', '\\notin': '\\not\\in'
  };
  ('\\left \\right \\middle \\big \\Big \\bigg \\Bigg \\bigl \\bigr \\Bigl \\Bigr \\biggl \\biggr \\Biggl \\Biggr ' +
   '\\bigm \\Bigm \\biggm \\Biggm \\displaystyle \\textstyle \\scriptstyle \\scriptscriptstyle \\limits \\nolimits ' +
   '\\, \\; \\: \\! \\> \\quad \\qquad \\enspace \\thinspace \\medspace \\thickspace \\negthinspace \\nonumber \\notag ' +
   '\\allowbreak \\relax \\nobreak \\mathstrut \\strut \\hfill \\hfil \\centering ' +
   '\\mathrel \\mathbin \\mathord \\mathop \\mathpunct \\mathopen \\mathclose \\mathinner & \\\\ ~').split(' ')
    .forEach(function (t) { TEX_DROP[t] = 1; });
  TEX_DROP['\\ '] = 1;
  '\\label \\tag \\hspace \\vspace \\phantom \\hphantom \\vphantom'.split(' ').forEach(function (t) { TEX_DROP_ARG[t] = 1; });
  var TEX_ARGS = {};
  ('\\overline \\underline \\widetilde \\widehat \\overrightarrow \\overleftarrow \\underbrace \\overbrace ' +
   '\\vec \\dot \\ddot \\check \\breve \\acute \\grave \\mathring \\sqrt \\boxed \\cancel ' +
   '\\mathbb \\mathcal \\mathfrak \\mathscr \\mathbf \\mathit \\mathsf \\mathtt \\boldsymbol \\bm ' +
   '\\operatorname \\text \\textbf \\textit \\textsf \\texttt \\emph ' +
   '\\xrightarrow \\xleftarrow \\xhookrightarrow \\xhookleftarrow \\xmapsto \\xLeftarrow \\xRightarrow \\xleftrightarrow')
    .split(' ').forEach(function (t) { TEX_ARGS[t] = 1; });
  '\\frac \\binom \\overset \\underset \\stackrel \\href'.split(' ').forEach(function (t) { TEX_ARGS[t] = 2; });

  function texTokens(s) {
    var out = [], i = 0, n = s.length, m;
    while (i < n) {
      var c = s.charAt(i), t;
      if (c === '%') { while (i < n && s.charAt(i) !== '\n') i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '\\') {
        t = /^\\(?:[a-zA-Z]+|[^a-zA-Z]?)/.exec(s.slice(i, i + 64))[0];
        i += t.length;
        if (t === '\\') continue;
        if (/^\\(mkern|kern|mskip|hskip)$/.test(t)) {
          m = /^\s*[-+]?\s*[\d.]*\s*(mu|pt|em|ex|bp|mm|cm|in)?/.exec(s.slice(i));
          i += m[0].length;
          continue;
        }
      } else { t = c; i++; }
      t = TEX_SAME[t] || t;
      if (!TEX_DROP[t]) out.push(t);
    }
    for (var k = 0; k + 1 < out.length; k++) {
      if (out[k] === ':' && out[k + 1] === '=') out.splice(k, 2, ':=');
      if (out[k] !== '\\not') continue;
      var both = out[k] + out[k + 1];
      out.splice(k, 2, both === '\\not=' ? '\\neq' : both);
    }
    return out;
  }
  function texParse(toks) {
    var pos = 0;
    function seq(inGroup) {
      var out = [];
      while (pos < toks.length) {
        var t = toks[pos];
        if (t === '}') { pos++; if (inGroup) return out; continue; }
        if (t === '_' || t === '^' || t === "'") { script(out); continue; }
        var a = item();
        if (a) out.push(a);
      }
      return out;
    }
    function item() {
      var t = toks[pos++];
      if (t === '{') return group(seq(true));
      if (TEX_DROP_ARG[t]) { arg(); return null; }
      var n = TEX_ARGS[t];
      if (!n) return { k: t };
      var a = { k: t, args: [] }, opt = '';
      if (toks[pos] === '[') {
        var o = [];
        pos++;
        while (pos < toks.length && toks[pos] !== ']') o.push(toks[pos++]);
        pos++;
        opt = '[' + o.join(' ') + ']';
      }
      for (var i = 0; i < n; i++) a.args.push(arg());
      if (/^\\x(right|left)arrow$/.test(t) && !opt && !a.args[0].length)
        return { k: t === '\\xrightarrow' ? '\\rightarrow' : '\\leftarrow' };
      a.k = t + opt + a.args.map(function (x) { return '{' + canon(x) + '}'; }).join('');
      return a;
    }
    function group(inner) {
      if (!inner.length) return null;
      if (inner.length === 1) { inner[0].wrapped = true; return inner[0]; }
      return { k: '{' + canon(inner) + '}', inner: inner };
    }
    function arg() {
      if (pos >= toks.length) return [];
      var t = toks[pos];
      if (t === '{') { pos++; return seq(true); }
      if (t === '}' || t === '_' || t === '^') return [];
      var a = item();
      return a ? [a] : [];
    }
    function script(out) {
      var t = toks[pos++], base = out[out.length - 1];
      if (!base) { base = { k: '{}', any: true }; out.push(base); }
      var key = t === '_' ? 'sb' : 'sp';
      if (base.wrapped && base[key]) {
        base = { k: '{' + atomStr(base) + '}', inner: [base] };
        out[out.length - 1] = base;
      }
      var add = t === "'" ? [{ k: '\\prime' }] : arg();
      base[key] = (base[key] || []).concat(add);
    }
    var atoms = seq(false);
    finish(atoms);
    return atoms;
  }
  function atomStr(a) {
    return a.k + (a.sb && a.sb.length ? '_{' + canon(a.sb) + '}' : '') + (a.sp && a.sp.length ? '^{' + canon(a.sp) + '}' : '');
  }
  function canon(atoms) { return atoms.map(atomStr).join(' '); }
  function finish(atoms) {
    atoms.forEach(function (a) {
      a.sub = a.sb && a.sb.length ? canon(a.sb) : null;
      a.sup = a.sp && a.sp.length ? canon(a.sp) : null;
      if (a.inner) finish(a.inner);
      if (a.args) a.args.forEach(finish);
      if (a.sb) finish(a.sb);
      if (a.sp) finish(a.sp);
    });
  }
  function texRows(atoms, out) {
    out.push(atoms);
    atoms.forEach(function (a) {
      if (a.inner) texRows(a.inner, out);
      if (a.args) a.args.forEach(function (x) { if (x.length) texRows(x, out); });
      if (a.sb && a.sb.length) texRows(a.sb, out);
      if (a.sp && a.sp.length) texRows(a.sp, out);
    });
    return out;
  }
  function atomMatch(q, d) {
    return (q.any || q.k === d.k) && (q.sub == null || q.sub === d.sub) && (q.sup == null || q.sup === d.sup);
  }
  function matchAt(q, d, i) {
    if (i < 0 || i + q.length > d.length) return false;
    for (var j = 0; j < q.length; j++) if (!atomMatch(q[j], d[i + j])) return false;
    return true;
  }
  function texFind(f, q, how) {
    var rows = rowsOf(f), found = [];
    if (!rows.length) return found;
    var top = rows[0];
    if (how === 'all') return top.length === q.length && matchAt(q, top, 0) ? [[0, 0]] : found;
    if (how === 'start') return matchAt(q, top, 0) ? [[0, 0]] : found;
    if (how === 'end') return matchAt(q, top, top.length - q.length) ? [[0, top.length - q.length]] : found;
    for (var r = 0; r < rows.length; r++) {
      for (var i = 0; i + q.length <= rows[r].length; i++) {
        if (!matchAt(q, rows[r], i)) continue;
        if (r > 0) return found.length ? found : [[r, i]];
        found.push([0, i]);
        i += q.length - 1;
      }
    }
    return found;
  }
  function rowsOf(f) {
    if (!f.rows) { try { f.rows = texRows(texAtoms(texTokens(expandMacros(f.tex))), []); } catch (e) { f.rows = []; } }
    return f.rows;
  }
  function texAtoms(toks) {
    var atoms = texParse(toks);
    while (atoms.length === 1 && atoms[0].inner && !atoms[0].sb && !atoms[0].sp) atoms = atoms[0].inner;
    return atoms;
  }
  function readArg(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') {
      var depth = 0;
      for (var j = i; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
      }
      return [s.slice(i + 1), s.length];
    }
    if (s[i] === '\\') { var m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)); return [m[0], i + m[0].length]; }
    return i < s.length ? [s[i], i + 1] : ['', i];
  }
  // expand the macros from ya-macros.tex (data.macros)
  function expandMacros(s) {
    for (var pass = 0; pass < 6; pass++) {
      var changed = false, out = '', i = 0;
      while (i < s.length) {
        var m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
        var def = m && macros['\\' + m[1]];
        if (!def) { out += m ? m[0] : s[i]; i += m ? m[0].length : 1; continue; }
        i += m[0].length;
        var args = [], k = 0;
        if (def.opt != null) {
          if (s[i] === '[') { var e = s.indexOf(']', i); args.push(s.slice(i + 1, e < 0 ? s.length : e)); i = e < 0 ? s.length : e + 1; }
          else args.push(def.opt);
          k = 1;
        }
        for (; k < def.n; k++) { var r = readArg(s, i); args.push(r[0]); i = r[1]; }
        out += def.body.replace(/#(\d)/g, function (_, d) { return args[d - 1] != null ? args[d - 1] : ''; }) + ' ';
        changed = true;
      }
      s = out;
      if (!changed) break;
    }
    return s;
  }
  function texQuery(s) { return texAtoms(texTokens(expandMacros(s))); }

  // The formula's atoms (as the TeX matcher counts them) as elements of
  // MathJax's output, when the two can be lined up; otherwise null (then the
  // whole formula is highlighted).
  function mathAtoms(f) {
    if (f.atoms === undefined) {
      var rows = rowsOf(f), out = mathAtomList(f.math);
      f.atoms = rows.length && rows[0].length === out.length ? out : null;
    }
    return f.atoms;
  }
  var CONTAINERS = /^mjx-(math|mrow|inferredmrow|mstyle|mpadded|menclose|texatom|semantics)$/;
  var SCRIPTED = /^mjx-(msub|msup|msubsup)$/;
  function mathAtomList(container) {
    var out = [];
    function kids(e) { return Array.prototype.filter.call(e.children, function (k) { return /^mjx-/.test(k.localName) && k.localName !== 'mjx-assistive-mml'; }); }
    function walk(e) {
      var tag = e.localName;
      if (CONTAINERS.test(tag) || tag === 'mjx-container') { kids(e).forEach(walk); return; }
      if (tag === 'mjx-mspace' || tag === 'mjx-c' || tag === 'mjx-break') return;   // spacing, line-break points
      if (/^mjx-(mi|mo|mn|mtext)$/.test(tag) && /^[⁡-⁤̸]?$/.test(chText(e))) return;   // empty, invisible
      if (SCRIPTED.test(tag)) {
        var base = kids(e).filter(function (k) { return k.localName !== 'mjx-script'; })[0];
        if (base && CONTAINERS.test(base.localName)) {   // (a+b)^2: TeX puts the 2 on the ")"
          walk(base);
          if (out.length) out[out.length - 1] = e;
          return;
        }
      }
      if (tag === 'mjx-mn') { for (var i = 0; i < chText(e).length; i++) out.push(e); return; }
      out.push(e);
    }
    walk(container);
    return out;
  }

  // ---------------------------------------------------------------- notation
  // Notation from \term[..., $\cO$]{...} (data.notation: [TeX, N]) is linked in
  // formulas: its first use in each paragraph, with the same scripts (primes
  // aside), not inside its own definition.
  function notationKey(a) {
    var sp = (a.sp || []).filter(function (x) { return x.k !== '\\prime'; });
    return atomStr({ k: a.k, sb: a.sb, sp: sp });
  }
  function linkNotation() {
    var pats = (data.notation || []).map(function (p) {
      var atoms = [];
      try { atoms = texAtoms(texTokens(expandMacros(p[0]))).map(notationKey); } catch (e) {}
      return { atoms: atoms, n: p[1], key: p[0] };
    }).filter(function (p) { return p.atoms.length; });
    if (!pats.length) return;
    pats.sort(function (a, b) { return b.atoms.length - a.atoms.length; });
    var done = new Map();
    article.querySelectorAll(MATH).forEach(function (math) {
      if (math.closest('h2, h3, h4, h5, .ya-head, .ya-term, .ya-termnt, a')) return;
      var tex = texOfEl(math);
      if (!tex) return;
      var f = { math: math, tex: tex, rows: null };
      var els = mathAtoms(f), rows = rowsOf(f);
      if (!els || !rows.length) return;
      var strs = rows[0].map(notationKey);
      var unit = math.closest('li, dd, p') || math.parentElement, box = math.closest('.ya-env');
      if (!done.has(unit)) done.set(unit, {});
      var seen = done.get(unit);
      for (var i = 0; i < strs.length; i++) {
        for (var k = 0; k < pats.length; k++) {
          var p = pats[k], ok = i + p.atoms.length <= strs.length;
          for (var j = 0; ok && j < p.atoms.length; j++) ok = strs[i + j] === p.atoms[j];
          if (!ok) continue;
          var own = box && data.terms[p.n] && data.terms[p.n].indexOf(box.id) >= 0;
          if (!seen[p.key] && !own) {
            seen[p.key] = true;
            for (j = 0; j < p.atoms.length; j++) {
              els[i + j].classList.add('ya-ntl');
              els[i + j].setAttribute('data-ya-term', p.n);
            }
          }
          i += p.atoms.length - 1;
          break;
        }
      }
    });
  }

  // ================================================================ find in page
  // The notes are searched as if they were their TeX source: the query is a
  // piece of a paragraph, $ signs included, found in reading order. Words
  // match ignoring case and runs of spaces; formulas match by TeX structure.
  var flows = null;
  var PLAIN = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ' };
  function plainText(s) { return s.replace(/[‘’“”–— ]/g, function (c) { return PLAIN[c]; }); }
  var BLOCK = /^(p|div|td|th|li|ul|ol|dl|dt|dd|h1|h2|h3|h4|h5|h6|table|tbody|tr|section|article|nav|details|figure|figcaption|blockquote|header|footer|pre)$/;

  function buildFlows() {
    flows = [];
    var cur = null;
    function text() { var t = { s: '', nodes: [], offs: [] }; cur.push(t); return t; }
    function start() { if (!cur) { cur = []; text(); } }
    function end() {
      if (cur && (cur.length > 1 || cur[0].s.trim())) flows.push(cur);
      cur = null;
    }
    function addText(node) {
      start();
      var last = cur[cur.length - 1], v = node.nodeValue;
      for (var i = 0; i < v.length; i++) {
        var c = v.charAt(i);
        if (/\s/.test(c)) { if (!last.s || last.s.slice(-1) === ' ') continue; c = ' '; }
        else { var l = c.toLowerCase(); c = PLAIN[c] || (l.length === 1 ? l : c); }
        last.s += c; last.nodes.push(node); last.offs.push(i);
      }
    }
    function addMath(n) {
      start();
      cur.push({ math: n, tex: texOfEl(n), rows: null });
      text();
    }
    function walk(n) {
      if (n.nodeType === 3) { addText(n); return; }
      if (n.nodeType !== 1) return;
      if (isMathEl(n)) { addMath(n); return; }
      var tag = n.localName;
      if (tag === 'summary' || tag === 'script' || tag === 'style' || tag === 'nav' || n.classList.contains('ya-ui')) return;
      var block = BLOCK.test(tag);
      if (block) end();
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (block) end();
    }
    walk(article);
    end();
  }
  function normText(s) { return plainText(s.toLowerCase()).replace(/\s+/g, ' '); }
  function parseQuery(query) {
    var parts = query.replace(/\\[()[\]]|\$\$/g, '$').split('$'), out = [];
    [false, true].forEach(function (startsInMath) {
      var reading = [];
      for (var i = 0; i < parts.length; i++) {
        var math = (i % 2 === 1) !== startsInMath;
        if (math) {
          var q = parts[i].trim() ? texQuery(parts[i]) : [];
          if (parts[i].trim() && !q.length) return;
          reading.push({ q: q });
        } else reading.push({ t: normText(parts[i]) });
      }
      out.push(reading);
    });
    return out;
  }
  function textFind(p, t, how) {
    var s = p.s, a = 0, b = s.length;
    while (a < b && s.charAt(a) === ' ') a++;
    while (b > a && s.charAt(b - 1) === ' ') b--;
    var tt = t.trim(), found = [];
    if (!tt) {
      if (how === 'all' && a < b) return found;
      return [[how === 'start' ? a : b, how === 'start' ? a : b]];
    }
    if (how === 'all') return s.slice(a, b) === tt ? [[a, b]] : found;
    if (how === 'start') return s.slice(a, a + tt.length) === tt ? [[a, a + tt.length]] : found;
    if (how === 'end') return s.slice(b - tt.length, b) === tt && b - tt.length >= a ? [[b - tt.length, b]] : found;
    for (var at = s.indexOf(tt, a); at >= 0 && at + tt.length <= b; at = s.indexOf(tt, at + tt.length)) found.push([at, at + tt.length]);
    return found;
  }
  function matchFlow(flow, reading, out) {
    var n = reading.length;
    function finds(p, r, how) {
      if (r.q) {
        if (!p.math) return [];
        if (!r.q.length) return [[0, how === 'start' ? 0 : -1, 0]];
        return texFind(p, r.q, how).map(function (f) { return [f[0], f[1], r.q.length]; });
      }
      return p.math ? [] : textFind(p, r.t, how);
    }
    function part(p, f) { return p.math ? { p: p, row: f[0], at: f[1], len: f[2] } : { p: p, from: f[0], to: f[1] }; }
    for (var i = 0; i + n <= flow.length; i++) {
      var first = finds(flow[i], reading[0], n === 1 ? 'any' : 'end');
      first.forEach(function (f) {
        var parts = [part(flow[i], f)];
        for (var k = 1; k < n; k++) {
          var g = finds(flow[i + k], reading[k], k === n - 1 ? 'start' : 'all');
          if (!g.length) return;
          parts.push(part(flow[i + k], g[0]));
        }
        out.push(parts);
      });
    }
  }
  function partRange(part) {
    var r = D.createRange(), p = part.p;
    if (p.math) {
      var atoms = part.row === 0 && part.len ? mathAtoms(p) : null;
      if (atoms) { r.setStartBefore(atoms[part.at]); r.setEndAfter(atoms[part.at + part.len - 1]); }
      else r.selectNode(p.math);
      return r;
    }
    r.setStart(p.nodes[part.from], p.offs[part.from]);
    r.setEnd(p.nodes[part.to - 1], p.offs[part.to - 1] + 1);
    return r;
  }
  function partElements(part) {
    var atoms = part.row === 0 && part.len ? mathAtoms(part.p) : null;
    if (!atoms) return [part.p.math];
    var els = [];
    for (var i = part.at; i < part.at + part.len; i++) if (els.indexOf(atoms[i]) < 0) els.push(atoms[i]);
    return els;
  }
  function find(query) {
    if (!flows) buildFlows();
    var readings = parseQuery(query), found = [];
    flows.forEach(function (flow) {
      var here = [];
      readings.forEach(function (r) { matchFlow(flow, r, here); });
      here.forEach(function (parts) {
        parts = parts.filter(function (x) { return x.p.math ? x.len : x.to > x.from; });
        if (!parts.length) return;
        var m = { parts: parts, flow: flow, ranges: parts.map(partRange) };
        m.maths = [];
        parts.forEach(function (x) { if (x.p.math) m.maths = m.maths.concat(partElements(x)); });
        found.push(m);
      });
    });
    found.sort(function (a, b) { return a.ranges[0].compareBoundaryPoints(Range.START_TO_START, b.ranges[0]) || b.ranges.length - a.ranges.length; });
    var res = [];
    found.forEach(function (m) {
      var prev = res[res.length - 1];
      if (prev && prev.ranges[0].compareBoundaryPoints(Range.START_TO_START, m.ranges[0]) === 0 &&
          prev.ranges[prev.ranges.length - 1].compareBoundaryPoints(Range.END_TO_END, m.ranges[m.ranges.length - 1]) === 0) return;
      if (res.length < MAX_HITS) res.push(m);
    });
    return res;
  }

  // ---------------------------------------------------------------- find UI
  var HL = window.CSS && CSS.highlights && typeof window.Highlight === 'function';
  var S = { q: null, hits: [], cur: -1 };
  function paint() {
    D.querySelectorAll('.ya-hit, .ya-now').forEach(function (m) { m.classList.remove('ya-hit', 'ya-now'); });
    if (HL) { CSS.highlights.delete('ya-hit'); CSS.highlights.delete('ya-now'); }
    var text = [];
    S.hits.forEach(function (h) {
      h.maths.forEach(function (m) { m.classList.add('ya-hit'); });
      h.ranges.forEach(function (r, i) { if (!h.parts[i].p.math) text.push(r); });
    });
    if (HL && text.length) CSS.highlights.set('ya-hit', new Highlight(...text));
    paintCurrent();
  }
  function paintCurrent() {
    D.querySelectorAll('.ya-now').forEach(function (m) { m.classList.remove('ya-now'); });
    if (HL) CSS.highlights.delete('ya-now');
    var h = S.hits[S.cur];
    if (!h) return;
    h.maths.forEach(function (m) { m.classList.add('ya-now'); });
    var text = h.ranges.filter(function (r, i) { return !h.parts[i].p.math; });
    if (HL && text.length) CSS.highlights.set('ya-now', new Highlight(...text));
  }
  function clearFind() { S.q = null; S.hits = []; S.cur = -1; paint(); }
  function scrollToHit(h) {
    var r0 = h.ranges[0];
    var node = r0.startContainer.nodeType === 1 ? r0.startContainer.childNodes[r0.startOffset] || r0.startContainer : r0.startContainer;
    var e = node.nodeType === 1 ? node : node.parentElement;
    unhide(e);
    var rect = r0.getBoundingClientRect();
    if (!rect.width && !rect.height) { e.scrollIntoView({ block: 'center' }); return; }
    var bar = barHeight();
    if (rect.top < bar + 16 || rect.bottom > window.innerHeight - 16) {
      window.scrollTo({ top: window.scrollY + rect.top - bar - (window.innerHeight - bar) / 2 + rect.height / 2 });
    }
  }
  function setupSearch() {
    var input = D.getElementById('ya-find'), count = D.querySelector('.ya-count');
    var prev = D.getElementById('ya-prev'), next = D.getElementById('ya-next');
    var timer;
    function updateCount() {
      var n = S.hits.length, q = input.value.trim();
      count.textContent = q ? (n ? (S.cur + 1) + '/' + n + (n >= MAX_HITS ? '+' : '') : '0/0') : '';
      count.classList.toggle('ya-none', !n && !!q);
      prev.disabled = next.disabled = !n;
    }
    function go(i) {
      var n = S.hits.length;
      if (!n) return;
      S.cur = ((i % n) + n) % n;
      paintCurrent();
      scrollToHit(S.hits[S.cur]);
      updateCount();
    }
    function firstOnScreen() {
      var top = barHeight();
      for (var i = 0; i < S.hits.length; i++) {
        var r = S.hits[i].ranges[0].getBoundingClientRect();
        if ((r.width || r.height) && r.bottom >= top) return i;
      }
      return 0;
    }
    function run(jump) {
      var q = input.value.trim();
      if (!q) { clearFind(); updateCount(); return; }
      if (q !== S.q) {
        S.q = q;
        S.hits = find(q);
        S.cur = -1;
        paint();
        if (S.hits.length) { if (jump) go(firstOnScreen()); else S.cur = firstOnScreen(); }
      }
      paintCurrent();
      updateCount();
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { run(true); }, SEARCH_DELAY); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        if (input.value.trim() !== S.q) { run(true); return; }
        go(S.cur + (e.shiftKey ? -1 : 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearFind(); input.blur(); updateCount();
      }
    });
    prev.addEventListener('click', function () { go(S.cur - 1); });
    next.addEventListener('click', function () { go(S.cur + 1); });
    D.addEventListener('keydown', function (e) {
      var mod = isMac ? e.metaKey : e.ctrlKey;
      var k = (e.key || '').toLowerCase();
      if (mod && !e.altKey && !e.shiftKey && k === 'f') { e.preventDefault(); input.focus(); input.select(); }
      else if ((mod && !e.altKey && k === 'g') || e.key === 'F3') {
        if (!S.hits.length) return;
        e.preventDefault();
        go(S.cur + (e.shiftKey ? -1 : 1));
      }
    });
    updateCount();
  }

  // ---------------------------------------------------------------- start
  // (last, so everything above is defined: with defer, init can run at once)
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();

  // for testing from the browser console
  window.yaNotes = {
    find: find, reveal: reveal, fold: fold,
    tex: function (s) { return canon(texQuery(s)); },
    atoms: function (container) {
      var rows = rowsOf({ tex: texOfEl(container), rows: null });
      return { tex: (rows[0] || []).map(atomStr), chtml: mathAtomList(container).map(function (e) { return chText(e); }) };
    }
  };
})();
