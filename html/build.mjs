#!/usr/bin/env node
// build.mjs -- HTML version of one course of yalatex notes (tex4ht + MathJax).
//
//   node build.mjs <course folder> [--out DIR] [--home URL] [--skip-tex]
//
// 1. Copies the course to <cache>/work/<course>/ and runs tex4ht on it
//    (make4ht with LuaLaTeX and ya.cfg). tex4ht runs the real template, so
//    every package and macro works as in the PDF; diagrams (tikz-cd, TikZ,
//    ytableau) become SVG files drawn by TeX itself; formulas stay TeX source.
// 2. Rebuilds tex4ht's flat HTML into a clean page: <section>s, notes
//    environments with a head and body, plain bold/italic instead of font
//    classes, equation numbers as in the PDF.
// 3. Renders every formula with MathJax 4 (TeX's layout rules, New Computer
//    Modern), here at build time, so the page needs no script to show math.
// 4. Writes the page to --out (default <cache>/out/<course>/): index.html,
//    notes.css, notes.js, mathjax.css, fonts and figures. --home is where the
//    bar's "All notes" button goes (default ../); the PDF button links to the
//    course's PDF, at ../<file>.pdf (the page sits in <course>/html/).
//    --skip-tex reuses the tex4ht output of the last build.
//
// Everything installed or generated lives in the cache folder, $YA_HTML_CACHE
// or ~/.cache/yalatex-html (see setup.sh), not here: this folder is inside
// the template, which TeX searches.
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.YA_HTML_CACHE || path.join(os.homedir(), '.cache', 'yalatex-html');
const require = createRequire(path.join(CACHE, 'package.json'));
let JSDOM, MathJax;
try {
  ({JSDOM} = require('jsdom'));
  MathJax = require('@mathjax/src');
} catch (e) {
  console.error(`The build's libraries aren't installed in ${CACHE}: run ${path.join(HERE, 'setup.sh')}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const skipTex = args.includes('--skip-tex');
const positional = args.filter((a, i) => !a.startsWith('--') && !['--out', '--home'].includes(args[i - 1]));
const courseDir = path.resolve(positional[0] || '');
if (!positional[0] || !fs.existsSync(courseDir)) {
  console.error('usage: node build.mjs <course folder> [--out DIR] [--home URL] [--skip-tex]');
  process.exit(2);
}
const course = path.basename(courseDir);
const work = path.join(CACHE, 'work', course);
const out = path.resolve(option('--out') || path.join(CACHE, 'out', course));
const home = option('--home') || '../';
const MARK = '.yalatex-html';   // marks an output folder as this build's (so it may be cleared)

// Names of the notes environments (data-env), for headings and previews.
const ENV_NAMES = {
  thm: 'Theorem', defn: 'Definition', lem: 'Lemma', cor: 'Corollary',
  prop: 'Proposition', conj: 'Conjecture', notebox: 'Note', ex: 'Example',
  que: 'Question', rmk: 'Remark', claim: 'Claim', exercise: 'Exercise',
  notethm: 'Note',
};

const problems = [];   // reported at the end
function problem(msg) { problems.push(msg); }

// ------------------------------------------------------------ 1. tex4ht
function runTex() {
  fs.rmSync(work, {recursive: true, force: true});
  fs.cpSync(courseDir, work, {
    recursive: true,
    filter: src => !/(^|\/)(build|\.git)$|\.(pdf|synctex\.gz)$/.test(src) || src === courseDir,
  });
  const main = findMain();
  console.log(`tex4ht: ${course}/${main} ...`);
  const log = path.join(work, 'make4ht.log');
  try {
    execFileSync('make4ht', ['-l', '-c', path.join(HERE, 'ya.cfg'), '-d', 'html', main, 'mathjax'],
      {cwd: work, stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(log, 'a')]});
  } catch (e) { /* make4ht exits 1 on any TeX error; read them from the log */ }
  const errors = new Set(fs.readFileSync(log, 'utf8').split('\n')
    .filter(l => l.includes('[ERROR]') && !/Compilation errors|Filename\tLine/.test(l))
    .map(l => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\[ERROR\]\s*/, '')));
  // Expected: tex4ht replaces align before ya-base patches it, so the patch
  // fails. Harmless here (MathJax lays out align; numberEquations does the
  // patch's numbering), and yalatex stays free of HTML-only code.
  const EXPECTED = /Package ya-base Error: align patch failed/;
  for (const e of errors) {
    if (EXPECTED.test(e)) console.log('(expected: ya-base\'s align patch fails under tex4ht)');
    else problem(`TeX: ${e}`);
  }
}

function findMain() {
  const own = `${course}.tex`;
  if (fs.existsSync(path.join(work, own))) return own;
  const tex = fs.readdirSync(work).filter(f => f.endsWith('.tex') &&
    fs.readFileSync(path.join(work, f), 'utf8').includes('\\documentclass'));
  if (tex.length !== 1) throw new Error(`can't tell the main .tex file in ${courseDir}`);
  return tex[0];
}

// ------------------------------------------------------------ 2. structure
function cleanUp(doc) {
  // tex4ht's line-number comments and reference comments
  const walker = doc.createTreeWalker(doc.body, 128 /* comments */);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach(c => c.remove());
  // tex4ht's font classes (rm-lmbx-10x-x-109, ...) -> plain <b>, <i>
  for (const span of doc.querySelectorAll('span[class]')) {
    const m = span.className.match(/^(?:rm|tcrm)-lm([a-z]+?)-?\d/);
    if (!m) continue;
    const code = m[1];
    let node = span;
    const wrap = tag => { const e = doc.createElement(tag); node.replaceWith(e); e.append(node); node = e; };
    if (/^tt/.test(code)) wrap('code');
    if (/bx|^b/.test(code)) wrap('b');
    if (/(r|bx|b)i$|ti|sl|it/.test(code)) wrap('i');
    if (/csc/.test(code)) span.className = 'ya-sc'; else unwrap(span);
  }
  // empty paragraphs tex4ht leaves around blocks
  for (const p of doc.querySelectorAll('p')) {
    if (!p.textContent.trim() && !p.querySelector('img, a[id], span[class^="mathjax"], svg')) p.remove();
  }
}

function unwrap(node) { node.replaceWith(...node.childNodes); }

function titleBlock(doc) {
  const mt = doc.querySelector('.maketitle');
  const title = mt?.querySelector('.titleHead')?.textContent.trim() || course;
  if (mt) {
    const header = doc.createElement('header');
    header.className = 'ya-title';
    const add = (cls, sel) => {
      const src = mt.querySelector(sel);
      if (!src) return;
      const e = doc.createElement(cls === 'ya-title-main' ? 'h1' : 'p');
      e.className = cls;
      e.innerHTML = src.innerHTML.replace(/<br\s*\/?>/g, ' · ');
      header.append(e);
    };
    add('ya-title-main', '.titleHead');
    add('ya-title-author', '.author');
    add('ya-title-date', '.date');
    mt.replaceWith(header);
  }
  // The printed contents list: the page script builds its own.
  const toc = doc.querySelector('.tableofcontents');
  if (toc) {
    const h = toc.previousElementSibling;
    if (h && /^like\w*Head$/.test(h.className) && /^\s*contents\s*$/i.test(h.textContent)) h.remove();   // its heading, in any class
    toc.remove();
  }
  return title;
}

// Every notes environment: <div class="ya-env ya-box|ya-plain ya-env-NAME"
// data-name="Theorem" data-num="2.1.6"> with a .ya-head and (boxes) a .ya-body.
function environments(doc) {
  for (const env of [...doc.querySelectorAll('div.ya-env[data-env]')]) {
    const name = env.getAttribute('data-env');
    const base = name.replace(/\*$/, '');
    env.removeAttribute('data-env');
    if (base === 'proof') { proof(doc, env); continue; }
    env.dataset.name = ENV_NAMES[base] || base;
    const tc = [...env.children].find(c => c.classList.contains('tcolorbox'));
    if (tc) box(doc, env, tc, base);
    else plain(doc, env, base);
  }
}

function box(doc, env, tc, base) {
  env.className = `ya-env ya-box ya-env-${base}`;
  const title = tc.querySelector(':scope > .tcolorbox-title');
  const content = tc.querySelector(':scope > .tcolorbox-content');
  const head = doc.createElement('div');
  head.className = 'ya-head';
  const titleHtml = doc.createElement('span');
  titleHtml.className = 'ya-head-title';
  titleHtml.innerHTML = (title?.querySelector('p') || title)?.innerHTML.trim() || '';
  const num = takeTrailingNumber(titleHtml);
  head.append(titleHtml);
  if (num) {
    env.dataset.num = num;
    const n = doc.createElement('span');
    n.className = 'ya-head-num';
    n.textContent = num;
    head.append(n);
  }
  const body = doc.createElement('div');
  body.className = 'ya-body';
  if (content) body.append(...content.childNodes);
  // label targets tex4ht put at the top of the box
  const anchors = [...tc.querySelectorAll(':scope > a[id]')];
  env.replaceChildren(...anchors, head, body);
}

// The number at the end of a box title ("Definition 1.1.1", "<i>Name</i> 2.1.6").
function takeTrailingNumber(node) {
  const texts = [];
  const w = node.ownerDocument.createTreeWalker(node, 4 /* text */);
  while (w.nextNode()) texts.push(w.currentNode);
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (!t.data.trim()) continue;
    const m = t.data.match(/\s*(\d+(?:\.\d+)*)\s*$/);
    if (!m) return null;
    t.data = t.data.slice(0, m.index);
    return m[1];
  }
  return null;
}

function plain(doc, env, base) {
  env.className = `ya-env ya-plain ya-env-${base}`;
  const nt = env.querySelector(':scope > .newtheorem');
  if (nt) unwrap(nt);
  const head = env.querySelector('span.head');
  if (head) {
    head.className = 'ya-head';
    const m = head.textContent.match(/\d+(?:\.\d+)+/);
    if (m) env.dataset.num = m[0];
  }
}

function proof(doc, env) {
  env.className = 'ya-proof';
  const inner = env.querySelector(':scope > .proof');
  if (inner) unwrap(inner);
  const head = env.querySelector('span.head');
  if (head) head.className = 'ya-proof-head';
  // the end-of-proof square: flush right, as amsthm sets it
  const w = doc.createTreeWalker(env, 4);
  let last = null;
  while (w.nextNode()) if (w.currentNode.data.trim()) last = w.currentNode;
  if (last && /□\s*$/.test(last.data) && !last.parentElement.closest('.ya-env, .ya-proof .ya-proof')) {
    last.data = last.data.replace(/\s*□\s*$/, '');
    const q = doc.createElement('span');
    q.className = 'ya-qed';
    q.setAttribute('aria-label', 'end of proof');
    last.after(q);
  }
}

// Wrap each heading and what follows it in a <section>.
const LEVELS = {chapterHead: 1, likechapterHead: 1, sectionHead: 2, likesectionHead: 2,
  subsectionHead: 3, likesubsectionHead: 3, subsubsectionHead: 4, likesubsubsectionHead: 4};
function sections(doc) {
  const body = doc.body;
  const root = doc.createElement('div');
  const stack = [];
  for (const node of [...body.childNodes]) {
    const level = node.nodeType === 1 && /^H[1-6]$/.test(node.tagName) && LEVELS[node.className];
    if (level) {
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      const sec = doc.createElement('section');
      sec.className = `ya-sec ya-sec-${level}`;
      if (node.id) { sec.id = node.id; node.removeAttribute('id'); }
      const mark = node.querySelector('.titlemark');
      if (mark) {
        const num = mark.textContent.replace(/^\s*Chapter\s*/, '').replace(/\.\s*$/, '').trim();
        sec.dataset.num = num;
        mark.className = 'ya-secnum';
        mark.textContent = num;
        mark.nextElementSibling?.tagName === 'BR' && mark.nextElementSibling.remove();
      }
      node.removeAttribute('class');
      (stack.at(-1)?.sec || root).append(sec);
      sec.append(node);
      stack.push({level, sec});
    } else {
      (stack.at(-1)?.sec || root).append(node);
    }
  }
  const article = doc.createElement('article');
  article.className = 'ya-article';
  article.append(...root.childNodes);
  body.replaceChildren(article);
}

// tex4ht's SVG pictures: sized in em (pt / 10.95, the document's font size),
// so they scale with the text like the PDF.
function pictures(doc, htmlDir) {
  const files = [];
  for (const img of doc.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (/^[a-z]+:/i.test(src)) continue;   // http:, data:
    // tex4ht's own pictures are in its output folder; an included image
    // (\includegraphics{graphics/x.png}) stays where it is in the course
    const file = [path.join(htmlDir, src), path.join(work, src)].find(f => !src.includes('..') && fs.existsSync(f));
    if (!file) { problem(`missing picture ${src}`); continue; }
    // what the file is, by its first bytes: tex4ht converts an included .eps
    // to a PNG but names it .svg, which browsers refuse
    const head = fs.readFileSync(file).subarray(0, 8);
    let name = src;
    if (head.toString('latin1', 1, 4) === 'PNG' && !/\.png$/i.test(src)) name = src.replace(/\.[^./]*$/, '') + '.png';
    if (name !== src) img.setAttribute('src', name);
    files.push([name, file]);
    if (!/\.svg$/i.test(name)) {
      // a photo or scan: its own shape, at most the text width (tex4ht's
      // width/height are a guess, often square)
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.className = 'ya-img';
      const p = img.parentElement;
      if (p?.tagName === 'P' && p.textContent.trim() === '') p.className = 'ya-pic-row';
      continue;
    }
    const svg = fs.readFileSync(file, 'utf8').slice(0, 600);
    const w = svg.match(/<svg[^>]*\swidth='([\d.]+)pt'/) || svg.match(/<svg[^>]*\swidth="([\d.]+)pt"/);
    if (w) img.style.width = `${(parseFloat(w[1]) / 10.95).toFixed(3)}em`;
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.className = 'ya-pic';
    img.setAttribute('alt', 'diagram');
    // a diagram or tableau that was in a formula (see ya.cfg): the formula
    // became the picture, so the picture replaces the math span
    const inline = img.closest('.mathjax-inline');
    if (inline) { inline.replaceWith(img); continue; }
    const span = img.closest('.mathjax-block, .mathjax-env');
    if (span) {
      const row = doc.createElement('div');
      row.className = 'ya-pic-row ya-block';
      row.append(img);
      span.replaceWith(row);
      continue;
    }
    const p = img.parentElement;
    if (p?.tagName === 'P' && p.textContent.trim() === '') p.className = 'ya-pic-row';
  }
  return files;
}

// ------------------------------------------------------------ equations
// tex4ht hands numbered environments (align, equation, ...) to MathJax as
// text, and numbers them badly itself: one number per environment, none for
// a labeled line of align*. So the build numbers them, by the template's
// rules: equations are numbered within sections (\numberwithin{equation}
// {section}); a line of align, equation, gather, multline gets a number
// unless \nonumber/\notag; a line of align* gets one exactly when it has a
// \label (ya-base's align patch). Each numbered line gets its number as a
// \tag for MathJax, and each \label an anchor of that name after the display;
// references to equations (marked by ya.cfg) take their number from here.
// (tex4ht writes TeX back with a space after control words: "\label {x}".)
const NUMBERED = /^(equation|align|alignat|flalign|gather|multline)$/;
const LABEL_STAR = /^(align|alignat|flalign)\*$/;
const EQ = new Map();   // label -> {num, node}

function numberEquations(doc) {
  let secNum = '0', count = 0;
  for (const node of doc.querySelectorAll('section.ya-sec, .mathjax-env')) {
    if (node.tagName === 'SECTION') {
      if (node.classList.contains('ya-sec-2') || node.classList.contains('ya-sec-1')) {
        if (node.dataset.num) { secNum = node.dataset.num; count = 0; }
      }
      continue;
    }
    const tex = node.textContent.trim();
    const m = tex.match(/^\\begin\s*\{([a-z]+\*?)\}(\{[^}]*\})?([\s\S]*)\\end\s*\{\1\}$/);
    if (!m) { problem(`can't read environment: ${tex.slice(0, 60)}`); continue; }
    const [, env, arg = '', inner] = m;
    const starred = env.endsWith('*');
    const plainName = env.replace(/\*$/, '');
    if (!NUMBERED.test(plainName)) continue;
    const lines = plainName === 'equation' ? [inner] : splitLines(inner);
    const labels = [];
    const outLines = lines.map(line => {
      const explicit = line.match(/\\tag\*?\s*\{([^}]*)\}/);
      const label = line.match(/\\label\s*\{([^}]*)\}/)?.[1].trim();
      const noNum = /\\(nonumber|notag)(?![a-zA-Z])/.test(line);
      let tag = null;
      if (explicit) tag = explicit[1];
      else if (!noNum && (!starred || (LABEL_STAR.test(env) && label))) tag = `${secNum}.${++count}`;
      if (label) {
        if (tag) { EQ.set(label, {num: tag, node}); labels.push(label); }
        else problem(`\\label{${label}} on an equation line without a number`);
      }
      line = line.replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(nonumber|notag)(?![a-zA-Z])/g, '');
      if (tag && !explicit) line = line.replace(/\s*$/, `\\tag{${tag}}`);
      return line;
    });
    const sep = plainName === 'equation' ? '' : '\\\\';
    node.textContent = `\\begin{${plainName}*}${arg}${outLines.join(sep)}\\end{${plainName}*}`;
    // anchors right after the display, as tex4ht places its own
    let at = node;
    for (const label of labels) {
      const a = doc.createElement('a');
      a.id = label.replace(/\s+/g, '-');
      at.after(a);
      at = a;
    }
  }
  // The PDF's own numbers, when its .aux is at hand (the course's build/ folder)
  const pdfAux = [path.join(courseDir, 'build', `${course}.aux`), path.join(courseDir, `${course}.aux`)].find(f => fs.existsSync(f));
  if (pdfAux) {
    let checked = 0;
    for (const m of fs.readFileSync(pdfAux, 'utf8').matchAll(/\\newlabel\{([^}@]+)\}\{\{([^}]*)\}/g)) {
      const e = EQ.get(m[1]);
      if (!e) continue;
      checked++;
      if (e.num !== m[2]) problem(`equation ${m[1]}: the PDF numbers it ${m[2]}, the page ${e.num}`);
    }
    console.log(`equation numbers: ${EQ.size} labeled, ${checked} checked against the PDF`);
  }
}

// References to equations (\eqref, \ref; ya.cfg wraps them in
// span.ya-ref[data-label]) show the build's number and link to its anchor.
// Other references keep tex4ht's text and link.
function resolveRefs(doc) {
  for (const span of [...doc.querySelectorAll('span.ya-ref[data-label]')]) {
    const label = span.dataset.label.trim();
    const e = EQ.get(label);
    if (e) {
      const eqref = /^\s*\(/.test(span.textContent);
      const a = doc.createElement('a');
      a.href = '#' + label.replace(/\s+/g, '-');
      a.textContent = e.num;
      span.replaceChildren(...(eqref ? ['(', a, ')'] : [a]));
    } else if (/\?\?/.test(span.textContent)) problem(`reference to an unknown label: ${label}`);
    unwrap(span);
  }
}

function CSS_escape(s) { return s.replace(/["\\]/g, '\\$&'); }

// Split an environment's body at its top-level \\ (not inside braces or
// nested environments).
function splitLines(s) {
  const lines = [];
  let depth = 0, envDepth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (/^\\begin\s*\{/.test(s.slice(i, i + 12))) envDepth++;
      else if (/^\\end\s*\{/.test(s.slice(i, i + 10))) envDepth--;
      else if (s[i + 1] === '\\' && depth === 0 && envDepth === 0) {
        lines.push(s.slice(start, i));
        i++;
        // \\[2pt] spacing argument
        const sp = s.slice(i + 1).match(/^\s*\[[^\]]*\]/);
        if (sp) i += sp[0].length;
        start = i + 1;
        continue;
      }
      i++;   // skip the escaped character
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  lines.push(s.slice(start));
  // a trailing \\ leaves an empty last line: drop it
  if (lines.length > 1 && !lines.at(-1).trim()) lines.pop();
  return lines;
}

// ------------------------------------------------------------ 3. MathJax
async function startMathJax() {
  await MathJax.init({
    loader: {
      load: ['input/tex', 'output/chtml', 'adaptors/liteDOM',
        '[tex]/mathtools', '[tex]/boldsymbol', '[tex]/color', '[tex]/cancel',
        '[tex]/textmacros', '[tex]/centernot', '[tex]/braket'],
    },
    tex: {
      packages: {'[+]': ['mathtools', 'boldsymbol', 'color', 'cancel',
        'textmacros', 'centernot', 'braket']},
      tags: 'ams',
      formatError: (jax, err) => jax.formatError(err),
    },
    chtml: {fontURL: 'fonts/mathjax', adaptiveCSS: true},
  });
  // TeX breaks a formula in a paragraph after a relation or binary operator;
  // MathJax's operators default to breaking before.
  MathJax.startup.input[0].postFilters.add(({data}) => {
    data.root.walkTree(node => {
      if (node.isKind('mo') && !node.attributes.hasExplicit('linebreakstyle')) node.attributes.set('linebreakstyle', 'after');
    });
  });
  defineMacros();
}

// The template's math macros, read from ya-macros.tex and given to MathJax
// as the same \newcommand lines.
const MACROS = {};   // for the page's search: name -> {n, opt, body}
function defineMacros() {
  const file = execFileSync('kpsewhich', ['ya-macros.tex'], {encoding: 'utf8'}).trim();
  const skip = /\\(term|termnt|intertext)\b/;
  const replace = {'\\mathchardef\\dash="2D': '\\newcommand{\\dash}{\\text{-}}'};
  for (let line of fs.readFileSync(file, 'utf8').split('\n')) {
    line = line.replace(/(^|[^\\])%.*$/, '$1').trim();
    if (!line || skip.test(line)) continue;
    line = replace[line] || line;
    const node = MathJax.startup.adaptor.outerHTML(MathJax.tex2chtml(line));
    if (/merror/.test(node)) problem(`macro MathJax can't read: ${line}`);
    const m = line.match(/^\\(?:re)?newcommand\*?\s*\{?(\\[a-zA-Z]+)\}?\s*(?:\[(\d)\])?\s*(?:\[([^\]]*)\])?\s*\{(.*)\}\s*$/);
    if (m && !/\\(text|operatorname)/.test(m[1])) MACROS[m[1]] = {n: +(m[2] || 0), ...(m[3] !== undefined ? {opt: m[3]} : {}), body: m[4]};
  }
}
function macroTable() { return MACROS; }

async function renderMath(doc) {
  const adaptor = MathJax.startup.adaptor;
  const spans = [...doc.querySelectorAll('.mathjax-inline, .mathjax-block, .mathjax-env')];
  let n = 0;
  for (const span of spans) {
    let tex = span.textContent.trim();
    const display = !span.classList.contains('mathjax-inline');
    if (span.classList.contains('mathjax-inline')) tex = tex.replace(/^\\\(/, '').replace(/\\\)$/, '');
    else if (span.classList.contains('mathjax-block')) tex = tex.replace(/^\\\[/, '').replace(/\\\]$/, '');
    const source = tex.trim();
    // \term makes its formulas bold (\boldmath in the PDF)
    if (span.closest('.ya-term, .ya-termnt')) tex = `\\boldsymbol{${tex}}`;
    // \eqref and \ref in a formula: MathJax doesn't know the notes' labels
    tex = tex.replace(/\\(eq)?ref\s*\{([^}]*)\}/g, (all, eq, label) => {
      const e = EQ.get(label.trim());
      const l = e ? {id: label.trim().replace(/\s+/g, '-'), num: e.num} : LABELS.get(label.trim());
      if (!l) { problem(`unknown label in a formula: ${label}`); return all; }
      return `\\href{#${l.id}}{\\text{${eq ? `(${l.num})` : l.num}}}`;
    });
    const node = await MathJax.tex2chtmlPromise(tex, {display});
    // the TeX is kept once, on the wrapper (data-tex), not on every node
    const html = adaptor.outerHTML(node).replace(/ data-latex="[^"]*"/g, '');
    if (html.includes('<mjx-merror')) {
      const msg = html.match(/data-mjx-error="([^"]*)"/)?.[1] || 'error';
      problem(`MathJax: ${msg}: ${tex.slice(0, 80)}`);
    }
    const wrap = doc.createElement(display ? 'div' : 'span');
    wrap.className = display ? 'ya-math ya-display ya-block' : 'ya-math';
    wrap.dataset.tex = source;
    wrap.innerHTML = html;
    span.replaceWith(wrap);
    if (++n % 1000 === 0) console.log(`  ${n} of ${spans.length} formulas`);
  }
  return adaptor.textContent(MathJax.chtmlStylesheet());
}

// Display formulas and diagrams are <div class="ya-block">s now; a <p> can't
// hold them, so split the paragraph around each one (the text after a display
// continues the paragraph).
function liftDisplays(doc) {
  for (const p of [...doc.querySelectorAll('p')]) {
    if (!p.querySelector(':scope > .ya-block')) continue;
    const parts = [];
    let cur = doc.createElement('p');
    for (const child of [...p.childNodes]) {
      if (child.nodeType === 1 && child.classList.contains('ya-block')) {
        parts.push(cur, child);
        cur = doc.createElement('p');
        cur.className = 'ya-cont';
      } else cur.append(child);
    }
    parts.push(cur);
    const keep = parts.filter(x => x.tagName !== 'P' || x.textContent.trim() || x.querySelector('img, .ya-math, a[id]'));
    if (keep[0]?.tagName === 'P' && p.className && !keep[0].className) keep[0].className = p.className;
    p.replaceWith(...keep);
  }
}

// ------------------------------------------------------------ ids
// tex4ht names link targets x1-14002r1, which change whenever the notes do.
// Name each one after its \label instead (from the .aux file), so links into
// the notes keep working; a numbered environment without a label gets
// <env>-<number>.
const LABELS = new Map();   // label -> {id, num}
function labelIds(doc) {
  const aux = path.join(work, `${path.basename(findMain(), '.tex')}.aux`);
  const byAnchor = new Map();
  for (const m of fs.readFileSync(aux, 'utf8').matchAll(/\\newlabel\{([^}@]+)\}\{\{\\rEfLiNK\{([^}]+)\}\{(?:\\csname :autoref\\endcsname\{[^}]*\})?([^}]*)\}/g)) {
    if (!byAnchor.has(m[2])) byAnchor.set(m[2], m[1]);
    if (!LABELS.has(m[1])) LABELS.set(m[1], {id: m[2], num: m[3]});
  }
  const rename = new Map();
  const used = new Set([...doc.querySelectorAll('[id]')].map(e => e.id));
  for (const [anchor, label] of byAnchor) {
    const el = doc.getElementById(anchor);
    const id = label.trim().replace(/\s+/g, '-');
    if (!el || used.has(id)) continue;
    el.id = id;
    used.add(id);
    rename.set(anchor, id);
    LABELS.get(label).id = id;
  }
  for (const a of doc.querySelectorAll('a[href^="#"]')) {
    const id = rename.get(a.getAttribute('href').slice(1));
    if (id) a.setAttribute('href', '#' + id);
  }
}

function envIds(doc) {
  const used = new Set([...doc.querySelectorAll('[id]')].map(e => e.id));
  for (const env of doc.querySelectorAll('.ya-env')) {
    // a labeled anchor at the top of the environment names it
    const top = [...env.querySelectorAll('a[id]')].find(a => !a.textContent.trim() && !/^x\d+-/.test(a.id) && !a.closest('.ya-body p, .ya-math') &&
      (a.parentElement === env || a.closest('.ya-head')));
    let id = top?.id;
    if (top) top.removeAttribute('id');
    else if (env.dataset.num) {
      id = `${env.className.match(/ya-env-(\w+)/)[1]}-${env.dataset.num}`;
      if (used.has(id)) id = null;
    }
    if (id) { env.id = id; used.add(id); }
  }
  // what is left of tex4ht's own anchors: targets nothing links to
  const linked = new Set([...doc.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)));
  for (const a of doc.querySelectorAll('a[id]')) {
    if (/^(x\d+-|QQ)/.test(a.id) && !linked.has(a.id) && !a.textContent.trim()) a.remove();
  }
  for (const p of doc.querySelectorAll('p[id^="listswap"]')) p.removeAttribute('id');
}

// ------------------------------------------------------------ terms
// \term[forms]{body} defines a term; its uses later in the course link to the
// definition (the first use in each paragraph or list item). The forms are
// the bracket entries, split at commas: words ("$k$-algebra" style entries,
// with $...$, ^ or _, or a single command, are notation and linked in
// formulas by notes.js). Without brackets, a body of words is its own form and
// a body that is one formula is notation.
function readTermForms() {
  const file = path.join(work, `${path.basename(findMain(), '.tex')}.terms`);
  const forms = {};
  if (!fs.existsSync(file)) return forms;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^(\d+) ?(.*)$/);
    if (m) forms[m[1]] = m[2].trim();
  }
  return forms;
}

// split at commas outside $...$, braces and parentheses
function splitForms(s) {
  const out = [];
  let depth = 0, math = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if (c === '$') math = !math;
    else if (c === '{' || c === '(') depth++;
    else if (c === '}' || c === ')') depth--;
    if (c === ',' && !depth && !math) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

const ACCENTS = {'\\v': {C: 'Č', c: 'č', S: 'Š', s: 'š', Z: 'Ž', z: 'ž', e: 'ě', r: 'ř'}, "\\'": {e: 'é', a: 'á', E: 'É', o: 'ó', i: 'í'},
  '\\`': {e: 'è', a: 'à'}, '\\"': {o: 'ö', u: 'ü', a: 'ä', O: 'Ö', U: 'Ü'}, '\\^': {e: 'ê', o: 'ô'}, '\\c': {c: 'ç'}};
function untex(s) {
  return s.replace(/\\([v'`"^c])\s*\{?([A-Za-z])\}?/g, (m, a, l) => ACCENTS['\\' + a]?.[l] || l)
    .replace(/\\(textbf|textit|emph|text)\{([^}]*)\}/g, '$2').replace(/[{}~]/g, ' ').replace(/``|''/g, '"');
}
const PREPOSITIONS = /\s+(of|in|on|for|to|at|by|with|from|over)$/i;

// the forms of a word entry: "(x) y" is "x y" and "y"; trailing prepositions dropped
function wordForms(entry) {
  entry = untex(entry).replace(/[.:;]+$/, '').replace(/\s+/g, ' ').trim();
  const out = new Set();
  const opt = entry.match(/^\(([^)]*)\)\s*(.*)$/);
  for (let f of opt ? [`${opt[1]} ${opt[2]}`, opt[2]] : [entry]) {
    f = f.replace(PREPOSITIONS, '').trim();
    if (f) out.add(f);
  }
  return [...out];
}

// Singular and plural of a word, for the last word of a term: regular
// English rules, plus irregular plurals common in math.
const IRREGULAR = {sheaf: 'sheaves', presheaf: 'presheaves', basis: 'bases', matrix: 'matrices',
  vertex: 'vertices', index: 'indices', spectrum: 'spectra', locus: 'loci', radius: 'radii',
  criterion: 'criteria', analysis: 'analyses', hypothesis: 'hypotheses', axis: 'axes',
  simplex: 'simplices', torus: 'tori', modulus: 'moduli', annulus: 'annuli', formula: 'formulas'};
const SINGULAR = Object.fromEntries(Object.entries(IRREGULAR).map(([a, b]) => [b, a]));
function singularWord(w) {
  const l = w.toLowerCase();
  if (IRREGULAR[l]) return l;
  if (SINGULAR[l]) return SINGULAR[l];
  if (/[^aeiou]ies$/.test(l)) return l.slice(0, -3) + 'y';
  if (/(ss|x|z|ch|sh)es$/.test(l)) return l.slice(0, -2);
  if (/[^s]s$/.test(l)) return l.slice(0, -1);
  return l;
}
function pluralWord(sing) {
  if (IRREGULAR[sing]) return IRREGULAR[sing];
  if (/[^aeiou]y$/.test(sing)) return sing.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(sing)) return sing + 'es';
  return sing + 's';
}

// a regular expression source for a word form: any case, hyphen or space
// between words, singular or plural last word
function formPattern(form) {
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = form.split(/[\s-]+/);
  const last = words.pop();
  const sing = singularWord(last);
  const alts = [...new Set([last.toLowerCase(), sing, pluralWord(sing)])].sort((a, b) => b.length - a.length);
  return [...words.map(esc), `(?:${alts.map(esc).join('|')})`].join('[\\s\\u00a0-]+');
}

// One key for the forms of a word entry, so that "Weierstrass point" and
// "Weierstrass points" are one term (all their definitions previewed
// together): lower case, hyphens as spaces, last word singular.
function wordKey(form) {
  const words = form.toLowerCase().split(/[\s-]+/);
  const last = words.pop();
  return [...words, singularWord(last)].join(' ');
}

function linkTerms(doc) {
  const forms = readTermForms();
  const article = doc.querySelector('.ya-article');
  const groups = new Map();   // word form (lower case) or notation TeX -> group index
  const defsOf = [];          // group index -> [definition ids]
  const patterns = [];        // {re source, group}
  const notation = [];        // [TeX, group]
  let n = 0;
  const groupFor = key => {
    if (!groups.has(key)) { groups.set(key, defsOf.length); defsOf.push([]); }
    return groups.get(key);
  };
  for (const span of article.querySelectorAll('.ya-term[data-term]')) {
    const num = span.dataset.term;
    span.removeAttribute('data-term');
    const env = span.closest('.ya-env');
    let defId = env?.id;
    if (!defId) { defId = span.id || `def-${++n}`; span.id = defId; }
    const entries = forms[num] ? splitForms(forms[num]) : null;
    const words = [], notes = [];
    if (entries) {
      for (const e of entries) {
        if (/\$|\^|_/.test(e) || /^\\[a-zA-Z]+$/.test(e)) notes.push(e.replace(/^\$|\$$/g, '').trim());
        else words.push(...wordForms(e));
      }
    } else {
      const maths = span.querySelectorAll('.ya-math');
      const text = span.textContent.replace(/\s+/g, ' ').trim();
      if (!maths.length) words.push(...wordForms(text));
      else if (maths.length === 1 && !span.textContent.replace(maths[0].textContent, '').trim()) notes.push(maths[0].dataset.tex);
    }
    const mine = new Set();
    for (const w of words) {
      const g = groupFor('w:' + wordKey(w));
      if (!mine.has(g)) { defsOf[g].push(defId); mine.add(g); }
      if (!patterns.some(p => p.group === g && p.form === wordKey(w))) patterns.push({form: wordKey(w), src: formPattern(w), group: g});
    }
    for (const t of notes) {
      const g = groupFor('n:' + t);
      if (!mine.has(g)) { defsOf[g].push(defId); mine.add(g); }
      if (!notation.some(x => x[0] === t)) notation.push([t, g]);
    }
  }
  if (!patterns.length) return {terms: defsOf, notation};
  // longest forms first, so "complex manifold" wins over "manifold"
  patterns.sort((a, b) => b.form.length - a.form.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.map(p => `(${p.src})`).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const SKIP = 'h1, h2, h3, h4, h5, .ya-head, .ya-proof-head, a, .ya-math, .ya-term, .ya-termnt, figure, .ya-title, code';
  const seen = new Map();   // paragraph -> groups linked there
  const w = doc.createTreeWalker(article, 4);
  const texts = [];
  while (w.nextNode()) texts.push(w.currentNode);
  for (const t of texts) {
    const parent = t.parentElement;
    if (!t.data.trim() || parent.closest(SKIP)) continue;
    const unit = parent.closest('p, dd, li, dt') || parent;
    if (!seen.has(unit)) seen.set(unit, new Set());
    const done = seen.get(unit);
    const box = parent.closest('.ya-env');
    let node = t;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(node.data))) {
      const k = m.slice(1).findIndex(x => x !== undefined);
      const g = patterns[k].group;
      const defs = defsOf[g];
      if (done.has(g) || (box && defs.includes(box.id)) || defs.includes(parent.closest('[id^="def-"]')?.id)) continue;
      done.add(g);
      // the nearest definition before this use, else the first one
      let target = defs[0];
      for (const id of defs) {
        const d = doc.getElementById(id);
        if (d && (d.compareDocumentPosition(node) & 4 /* following */)) target = id;
      }
      const rest = node.splitText(m.index);
      const after = rest.splitText(m[0].length);
      const a = doc.createElement('a');
      a.className = 'ya-tl';
      a.href = '#' + target;
      a.dataset.yaTerm = String(g);
      rest.replaceWith(a);
      a.append(rest);
      node = after;
      re.lastIndex = 0;
    }
  }
  return {terms: defsOf, notation};
}

// ------------------------------------------------------------ 4. output
function collapseWhitespace(doc) {
  const w = doc.createTreeWalker(doc.body, 4);
  const texts = [];
  while (w.nextNode()) texts.push(w.currentNode);
  for (const t of texts) {
    if (t.parentElement.closest('pre, code, mjx-container')) continue;
    t.data = t.data.replace(/[ \t]*\n[\s]*/g, '\n').replace(/[ \t]{2,}/g, ' ');
  }
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
}

function writeOut(doc, title, css, pics, termForms) {
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, MARK))) {
    throw new Error(`${out} has files this build didn't make; not clearing it`);
  }
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(path.join(out, 'fonts', 'mathjax'), {recursive: true});
  fs.writeFileSync(path.join(out, MARK), 'Made by yalatex/html/build.mjs; cleared on each build.\n');
  const htmlDir = path.join(work, 'html');
  for (const [src, file] of pics) {
    fs.mkdirSync(path.dirname(path.join(out, src)), {recursive: true});
    fs.copyFileSync(file, path.join(out, src));
  }
  // MathJax's fonts: only the files its stylesheet uses
  const fontDir = path.join(CACHE, 'node_modules/@mathjax/mathjax-newcm-font/chtml/woff2');
  for (const f of new Set([...css.matchAll(/fonts\/mathjax\/([\w.-]+\.woff2)/g)].map(m => m[1]))) {
    fs.copyFileSync(path.join(fontDir, f), path.join(out, 'fonts', 'mathjax', f));
  }
  // Text font: New Computer Modern from TeX Live, cut down (fontTools) to the
  // characters the page uses and converted to woff2. (Browsers reject the
  // .otf files as they are: their font check fails on the CFF data.)
  const chars = new Set(doc.body.textContent);
  for (let c = 0x20; c < 0x17f; c++) chars.add(String.fromCodePoint(c));
  for (const c of '‘’“”–—…•·′″§¶†‡ﬀﬁﬂﬃﬄ') chars.add(c);
  const textFile = path.join(work, 'font-chars.txt');
  fs.writeFileSync(textFile, [...chars].join(''));
  const subset = path.join(CACHE, '.venv', 'bin', 'pyftsubset');
  for (const [src, dest] of [['NewCM10-Regular.otf', 'newcm-regular'], ['NewCM10-Italic.otf', 'newcm-italic'],
    ['NewCM10-Bold.otf', 'newcm-bold'], ['NewCM10-BoldItalic.otf', 'newcm-bolditalic']]) {
    const file = execFileSync('kpsewhich', [src], {encoding: 'utf8'}).trim();
    execFileSync(subset, [file, `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*',
      `--output-file=${path.join(out, 'fonts', dest + '.woff2')}`]);
  }
  fs.writeFileSync(path.join(out, 'mathjax.css'), css);
  for (const f of ['notes.css', 'notes.js']) fs.copyFileSync(path.join(HERE, 'web', f), path.join(out, f));
  const v = f => `${f}?v=${hash(path.join(out, f))}`;

  const head = doc.head;
  head.replaceChildren();
  head.innerHTML = `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title></title>
<link rel="stylesheet" href="${v('mathjax.css')}">
<link rel="stylesheet" href="${v('notes.css')}">
<script>try{var t=localStorage.getItem('ya:theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="${v('notes.js')}" defer></script>
`;
  head.querySelector('title').textContent = title;
  const data = doc.createElement('script');
  data.type = 'application/json';
  data.id = 'ya-data';
  // the course's PDF, next to the folder the page goes in (<course>/html/)
  const pdf = fs.readdirSync(courseDir).find(f => /\.pdf$/i.test(f));
  data.textContent = JSON.stringify({title, home, pdf: pdf ? '../' + pdf : null, macros: macroTable(), ...termForms}).replace(/</g, '\\u003c');
  doc.body.append(data);
  doc.documentElement.setAttribute('lang', 'en');
  fs.writeFileSync(path.join(out, 'index.html'), '<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
}

// ------------------------------------------------------------ main
if (!skipTex) runTex();
const htmlDir = path.join(work, 'html');
const htmlFile = path.join(htmlDir, `${path.basename(findMain(), '.tex')}.html`);
const dom = new JSDOM(fs.readFileSync(htmlFile, 'utf8'));
const doc = dom.window.document;

cleanUp(doc);
const title = titleBlock(doc);
environments(doc);
sections(doc);
const pics = pictures(doc, htmlDir);
numberEquations(doc);
labelIds(doc);
resolveRefs(doc);
collapseWhitespace(doc);
console.log('MathJax ...');
await startMathJax();
const css = await renderMath(doc);
liftDisplays(doc);
envIds(doc);
const termData = linkTerms(doc);
writeOut(doc, title, css, pics, termData);

const size = fs.statSync(path.join(out, 'index.html')).size;
console.log(`wrote ${out}/index.html (${(size / 1e6).toFixed(1)} MB)`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ' + p);
}
