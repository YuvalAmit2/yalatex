// yalatex VS Code extension: makes $ in LaTeX files behave like {, and
// Ctrl+F opens a TikZ Editor figure for the current line (see the end).
//
// LaTeX Workshop lists the pairs VS Code closes automatically ({ }, [ ], ( ),
// \left( ... ) in its language configuration, but not $ $. This adds two
// pairs to LaTeX Workshop's own list:
//   ["$", "$"]   typing $ gives $|$; Backspace right after deletes both;
//                typing the closing $ steps over it
//   ["\\$", ""]  \$ (a literal dollar sign) closes with nothing, the same way
//                LaTeX Workshop keeps \{ from closing
// The list is read from the installed LaTeX Workshop each time VS Code starts,
// so its future changes still come through.
//
// VS Code only skips auto-closing for quote characters typed after a word, so
// a $ that *ends* inline math (e.g. the second $ in "$x" + "$" when the first
// one wasn't auto-closed) would get a partner too. When that happens, and the
// line already has an odd number of unescaped $ before it, the extra $ is
// removed again as part of the same undo step.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const LANGUAGE = 'latex';
const LATEX_WORKSHOP = 'James-Yu.latex-workshop';
const DOLLAR_PAIRS = [
  { open: '$', close: '$' },
  { open: '\\$', close: '' },
];

// Remove // and /* */ comments and trailing commas from JSON with comments,
// leaving string contents alone.
function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; }
      else if (c === '"') { inString = false; }
    } else if (c === '"') {
      inString = true; out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[\]}])/g, '$1'));
}

// LaTeX Workshop's auto-closing pairs, as {open, close, notIn} objects.
function latexWorkshopPairs(extensionPath, packageJson) {
  const langs = (packageJson.contributes && packageJson.contributes.languages) || [];
  const lang = langs.find(l => l.id === LANGUAGE && l.configuration);
  if (!lang) throw new Error('LaTeX Workshop declares no configuration for "latex"');
  const config = parseJsonc(fs.readFileSync(path.join(extensionPath, lang.configuration), 'utf8'));
  return (config.autoClosingPairs || []).map(p => Array.isArray(p)
    ? { open: p[0], close: p[1] }
    : { open: p.open, close: p.close, ...(p.notIn ? { notIn: p.notIn } : {}) });
}

// The full list: LaTeX Workshop's pairs plus the two $ pairs (without
// duplicating a $ pair if LaTeX Workshop ever adds one itself).
function combinedPairs(lwPairs) {
  const have = new Set(lwPairs.map(p => p.open));
  return lwPairs.concat(DOLLAR_PAIRS.filter(p => !have.has(p.open)));
}

// Is the text before a newly typed $ already inside inline math, i.e. does it
// contain an odd number of unescaped $ (ignoring anything after a % comment)?
function insideMath(textBefore) {
  let count = 0;
  for (let i = 0; i < textBefore.length; i++) {
    const c = textBefore[i];
    if (c === '\\') { i++; continue; }      // skip the escaped character
    if (c === '%') break;                    // rest of the line is a comment
    if (c === '$') count++;
  }
  return count % 2 === 1;
}

// ----- TikZ Editor figures -----
// Ctrl+F on a line: the line's text names a figure. The line becomes
// \tikzfig{name} and TikZ Editor opens graphics/name.tikz (next to the .tex
// file; a new figure if it doesn't exist yet). On a line that already has
// \tikzfig{name}, Ctrl+F opens that figure again. In TikZ Editor, Cmd+Enter
// saves and comes back here.

function figureSlug(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function expandHome(p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

let checkedSty = false;
function checkTikzfigSty() {
  if (checkedSty) return;
  checkedSty = true;
  cp.execFile('kpsewhich', ['tikzfig.sty'], (err, out) => {
    if (err && err.code === 'ENOENT') return; // no TeX on this PATH: can't tell
    if (!String(out).trim()) {
      vscode.window.showWarningMessage("yalatex: LaTeX can't find tikzfig.sty yet, so \\tikzfig won't work. In the tikz-editor folder, run: npm run install-sty");
    }
  });
}

async function tikzFigure() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  if (doc.isUntitled) {
    vscode.window.showErrorMessage('yalatex: save the .tex file first, so the figure has a folder to go in.');
    return;
  }
  const line = doc.lineAt(editor.selection.active.line);
  const existing = line.text.match(/\\tikzfig(?:\[[^\]]*\])?\{([^}]+)\}/);
  let name;
  if (existing) {
    name = existing[1].trim();
  } else {
    let text = line.text.trim();
    if (!text) text = (await vscode.window.showInputBox({ prompt: 'Figure name', placeHolder: 'e.g. torus' })) || '';
    name = figureSlug(text);
    if (!name) return;
    const indent = line.text.match(/^\s*/)[0];
    await editor.edit(b => b.replace(line.range, `${indent}\\tikzfig{${name}}`));
  }
  const file = path.join(path.dirname(doc.uri.fsPath), 'graphics', name + '.tikz');
  const cmd = expandHome(vscode.workspace.getConfiguration('yalatex').get('tikzEditor') || '~/latex/tikz-editor/bin/tikz-editor');
  if (!fs.existsSync(cmd)) {
    vscode.window.showErrorMessage(`yalatex: TikZ Editor isn't at ${cmd}. Set "yalatex.tikzEditor" to its bin/tikz-editor.`);
    return;
  }
  const child = cp.spawn(cmd, [file], { cwd: path.dirname(doc.uri.fsPath), detached: true, stdio: 'ignore' });
  child.on('error', err => vscode.window.showErrorMessage(`yalatex: couldn't start TikZ Editor (${err.message}).`));
  child.unref();
  checkTikzfigSty();
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('yalatex.tikzFigure', tikzFigure));

  const lw = vscode.extensions.getExtension(LATEX_WORKSHOP);
  if (!lw) {
    vscode.window.showWarningMessage('yalatex: the $ pairing needs the LaTeX Workshop extension, which is not installed.');
    return;
  }
  let pairs;
  try {
    pairs = combinedPairs(latexWorkshopPairs(lw.extensionPath, lw.packageJSON));
  } catch (err) {
    // Without LaTeX Workshop's list we'd replace its pairs with only ours, so do nothing.
    vscode.window.showWarningMessage(`yalatex: couldn't read LaTeX Workshop's settings, so $ pairing is off (${err.message}).`);
    return;
  }
  context.subscriptions.push(vscode.languages.setLanguageConfiguration(LANGUAGE, { autoClosingPairs: pairs }));

  // Undo the automatic partner of a $ that closes inline math.
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    const doc = event.document;
    if (doc.languageId !== LANGUAGE || event.reason !== undefined) return;   // skip undo/redo
    if (event.contentChanges.length !== 1) return;                           // one cursor only
    const change = event.contentChanges[0];
    if (change.text !== '$$' || change.rangeLength !== 0) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== doc || editor.selections.length !== 1) return;
    const start = change.range.start;
    // VS Code reports the text change before it moves the cursor, so the cursor
    // may still be in front of the typed $ or already between the two.
    const cursor = editor.selection.active;
    if (!editor.selection.isEmpty || cursor.line !== start.line ||
        (cursor.character !== start.character && cursor.character !== start.character + 1)) return;
    const before = doc.lineAt(start.line).text.slice(0, start.character);
    if (!insideMath(before)) return;
    const extra = new vscode.Range(start.translate(0, 1), start.translate(0, 2));
    editor.edit(b => b.delete(extra), { undoStopBefore: false, undoStopAfter: false });
  }));
}

function deactivate() {}

module.exports = { activate, deactivate, _test: { parseJsonc, latexWorkshopPairs, combinedPairs, insideMath, figureSlug } };
