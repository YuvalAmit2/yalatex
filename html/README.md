# HTML version of yalatex notes (tex4ht + MathJax)

Builds the interactive HTML version of one course of notes. Optional: nothing
in the template loads these files, and the PDF doesn't need them. tex4ht runs
the **real** template, TeX itself draws diagrams, and MathJax 4 lays out
formulas with TeX's rules in New Computer Modern.

```bash
~/latex/yalatex/html/setup.sh        # once: libraries into ~/.cache/yalatex-html
cd ~/latex/yalatex/html
node build.mjs ../../notes/math606-notes              # ~1.5 min; page in ~/.cache/yalatex-html/out/math606-notes/
node build.mjs ../../notes/math606-notes --skip-tex   # reuse the last tex4ht run (~5 s)
open ~/.cache/yalatex-html/out/math606-notes/index.html
```
Options: `--out DIR` (where the page goes), `--home URL` (the bar's "All
notes" button, default `../`). The bar's PDF button links to `../<the course's
PDF>`, i.e. the page is meant to sit in `<course>/html/` next to the PDF.

Needs TeX Live (`make4ht`, LuaLaTeX), Node 24 and Python 3. Everything
installed or generated (node_modules, a fontTools venv, tex4ht's work files,
built pages) lives in the cache folder, `$YA_HTML_CACHE` or
`~/.cache/yalatex-html`, never here: this folder is inside the template, which
TeX searches on every compile.

## Publishing
yuvals-notes' `.github/workflows/publish.yml` runs on every push to `main`:
it fetches this repo, rebuilds the HTML of each course whose files (or this
template) changed, and publishes the committed files (PDFs, `index.html`)
plus `<course>/html/`. Unchanged courses come from the cache; a course that
fails keeps its last HTML. A change to the template alone takes effect at the
next push to the notes (or "Run workflow" on the Actions tab).

## Files
- `ya.cfg` — tex4ht configuration. Only marks things up; everything it does is
  explained in its comments:
  - section numbers (titlesec's `\thetitle` vs titling's),
  - `<div class="ya-env" data-env="thm">` around every notes environment,
  - `\term` → `<span class="ya-term" data-term="N">`, forms written to `<job>.terms`,
  - quiver's `\[\begin{tikzcd}…\]` and every Young tableau (text or formula)
    drawn by TeX as SVG instead of being handed to MathJax,
  - anchors for `\label`s in a box's body (ya-notes-thms' "label in body"),
  - `\incfig` → placeholder (Inkscape figures aren't used any more).
- `build.mjs` — runs tex4ht, then rebuilds its HTML: sections, environments
  (head/body, `data-name`, `data-num`, id = `\label` name or `thm-2.1.6`),
  label ids from the `.aux`, equation numbers as in the PDF (`\tag`s for
  MathJax), MathJax rendering at build time (CHTML, TeX in `data-tex`),
  defined-word links, text fonts subset to woff2.
- `web/notes.css`, `web/notes.js` — the page: bar, contents sidebar, Show menu
  and folding, hover previews (references, equations, defined words), notation
  links in formulas, TeX-aware find. Ported from the LaTeXML version.
- `setup.sh` — installs the libraries into the cache folder.
- `tools/shot.mjs` — screenshots and checks in Chrome (needs playwright-core,
  see the file).

## Equation numbers
tex4ht numbers equations badly under the mathjax option (one number per
`align`, none for a labeled `align*` line), so `build.mjs` numbers them by the
template's rules (ya-base's align patch: an `align*` line is numbered exactly
when it has a `\label`) and fills in every `\eqref` (ya.cfg marks them). When
the PDF's `.aux` is in the course's `build/` folder, every labeled equation is
checked against it (MATH606: 32/32, MATH601: 11/11). If the rules in
`ya-base.sty` change, `numberEquations` in `build.mjs` must follow.

## Known gaps
- Only `\eqref` is fixed up: a `\ref`/`\cref` to an equation would show
  tex4ht's own (possibly wrong) number. The notes use `\eqref` only.
- `ya-base`'s align patch fails under tex4ht. Expected and left alone (the
  build lists it as such): yalatex gets no HTML-only code, MathJax lays out
  `align`, and `numberEquations` does the patch's numbering.
- Fonts (decided): the page uses New Computer Modern, the PDF XCharter;
  diagrams come out in Latin Modern (tex4ht's DVI pass).
- Formulas that contain a tableau or diagram are pictures, so find can't see
  inside them.
