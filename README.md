# yalatex

My $\LaTeX$ template for math notes, homework, papers and presentations. When properly setup, every document on your machine should be able to see the package, so you only need one local copy of the preamble files. 

```latex
\documentclass[11pt]{article}
\usepackage[notes]{yalatex}

\begin{document}
\section{Groups}
\begin{defn}[Group]\label{defn:group}
  A group is a set $G$ with ...
\end{defn}
By \cref{defn:group}, $\Z$ is a group under addition.
\end{document}
```

yalatex gives you four modes (notes, homework, paper, beamer), theorem environments, over a hundred macros, and a `yalatex` terminal command that starts new documents. An optional VS Code setup makes editing feel like Overleaf, with some extras.

If you would like to try out the template without going through the steps of downloading locally, [try it on Overleaf](#overleaf-and-other-editors).

## Contents

### [Installation](#installation)
- [Quick install](#quick-install)
<!-- - [What the installer does](#what-the-installer-does)  -->
- [Manual install](#manual-install)
- [Overleaf and other editors](#overleaf-and-other-editors) 
- [VS Code setup (optional)](#vs-code-setup-optional)
- [Compiling from the terminal](#compiling-from-the-terminal)
- [Updating and uninstalling](#updating-and-uninstalling)

### [Usage](#usage)

- [Modes](#modes)
- [The yalatex command](#the-yalatex-command) 
- [Theorem-like environments](#theorem-like-environments) 
- [Labels and references](#labels-and-references)
- [Figures](#figures)
- [Bibliography](#bibliography)
- [Macros](#macros)
- [Troubleshooting](#troubleshooting)

---

# Installation

## Requirements

- **macOS or Linux.** Windows support coming eventually... (email [me](https://yuvalamit2.github.io/) if you want it).
- **A full TeX distribution:** [MacTeX](https://www.tug.org/mactex/) on a Mac (the full version, not BasicTeX), or TeX Live on Linux.
- **git**: to download and update yalatex.

## Quick install

1. Clone the repository and install:

```bash
git clone https://github.com/YuvalAmit2/yalatex.git ~/LaTeX/yalatex
~/LaTeX/yalatex/install.sh
```

2. Open a new terminal 

3. Run `yalatex check` to make sure everything is clear. You should get something like:
```
LaTeX:
  ✓ pdflatex
  ✓ latexmk
  ✓ biber
  ✓ kpsewhich
  ✓ LaTeX finds yalatex.sty: /Users/you/Library/texmf/tex/latex/yalatex/yalatex.sty
Terminal:
  ✓ yalatex command: /Users/you/LaTeX/yalatex/bin/yalatex
  ✓ author for new documents: Your Name
Updates:
  ✓ no local changes
  ✓ last update: 2026-10-24 (42d4537)
VS Code (optional):
  - snippets not linked in the default profile (yalatex vscode-link-snippets)
  - $ extension not installed (yalatex vscode-extension)
```

3. Put the yalatex folder in a place on your machine that won't be affected by things like iCould, Dropbox, OneDrive, etc. I have it in `~/LaTeX/yalatex`.

<!-- ## What the installer does

1. **Checks for TeX:** pdflatex, latexmk, biber.
2. **Makes LaTeX find yalatex from any folder.** It links the yalatex folder into your personal TeX folder (`TEXMFHOME`: `~/Library/texmf` on a Mac, `~/texmf` on Linux). LaTeX searches that folder automatically, so `\usepackage{yalatex}` works in every document, wherever it lives.
3. **Puts the `yalatex` command on your PATH and saves your name** for new documents. Both go into your shell's startup file (`~/.zshrc`, `~/.bash_profile` or `~/.bashrc`) inside a marked block:
   ```bash
   # >>> yalatex >>>
   export PATH="$HOME/LaTeX/yalatex/bin:$PATH"
   export YALATEX_AUTHOR="Your Name"
   # <<< yalatex <<<
   ```
4. **Runs `yalatex check`** to confirm everything works.

It doesn't change VS Code, `~/.latexmkrc`, or anything else. Options: `--yes` (accept every default), `--author "Name"`, `--uninstall`. -->

## Manual install

The same steps by hand:

```bash
# 1. Link yalatex into your personal TeX folder
mkdir -p "$(kpsewhich -var-value TEXMFHOME)/tex/latex"
ln -s ~/LaTeX/yalatex "$(kpsewhich -var-value TEXMFHOME)/tex/latex/yalatex"
kpsewhich yalatex.sty        # should print a path inside that folder

# 2. The yalatex command and your name
#    (zsh shown; for bash use ~/.bash_profile on a Mac, ~/.bashrc on Linux)
echo 'export PATH="$HOME/LaTeX/yalatex/bin:$PATH"' >> ~/.zshrc
echo 'export YALATEX_AUTHOR="Your Name"' >> ~/.zshrc
```

**Setting or changing your name later:** edit the `YALATEX_AUTHOR` line in that file (or rerun `install.sh`), then open a new terminal. `yalatex check` shows the name new documents will get. Without it, new documents say `\author{Author}`.

## Overleaf and other editors

I use VS Code + LaTeX Workshop, so that's the only local editor I've tested this on. In theory, nothing here depends on VS Code (except for some of the settings in the  `vscode` folder), so everything should work on other editors.

**Overleaf** to use the template on Overleaf, upload `yalatex.sty`, all `ya-*.sty` files, and `ya-macros.tex` to an Overleaf project, alongside a main `.tex` file.

## VS Code setup (optional)

VS Code with the [LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop) extension is a fast local editor with a built-in PDF viewer and math preview. If you use a different editor, then this part is optional, and nothing you've done so far has touched VS Code.

### Option A: import the yalatex profile

```bash
yalatex vscode-profile      # writes yalatex.code-profile in the current folder
```

Then in VS Code: ⌘⇧P → **Profiles: Open Profiles (UI)** → the arrow next to **New Profile** → **Import Profile...** → **Select File...** → choose the file. This creates a separate profile named "yalatex" with all the settings in [Option B](#option-b-pick-individual-settings), plus LaTeX Workshop and the [snippets](#snippets). **Your existing VS Code setup is not changed**, and you can switch profiles per window. To get later changes, run `yalatex update`, then `yalatex vscode-profile`, and import again.

### Option B: pick individual settings

Paste any of these into your settings (⌘⇧P → **Preferences: Open User Settings (JSON)**, inside the outer `{ }`). 

<details>
<summary><b>Build with ⌘↩ only, and auto-save</b> (like Overleaf's Recompile button)</summary>

```jsonc
"latex-workshop.latex.autoBuild.run": "never",
"files.autoSave": "afterDelay",
"files.autoSaveDelay": 1000,
```
And in your keybindings (⌘⇧P → **Preferences: Open Keyboard Shortcuts (JSON)**, inside the `[ ]`; use `ctrl+enter` on Linux):
```jsonc
{ "key": "cmd+enter", "command": "latex-workshop.build", "when": "editorLangId == latex" }
```
LaTeX Workshop saves all files before building, so ⌘↩ always compiles what you see. Use `"onSave"` instead of `"never"` to build on every save.
</details>

<details>
<summary><b>PDF next to the .tex file, clutter in <code>build/</code></b></summary>

```jsonc
"latex-workshop.latex.auxDir": "%DIR%/build",
"files.exclude": { "**/build": true, "**/*.synctex.gz": true },
```
The `.aux`, `.log`, `.toc`, ... files go into a `build/` folder next to each document, hidden in the file tree. The PDF stays next to the `.tex`.
</details>

<details>
<summary><b>Math hover preview that knows yalatex's macros</b></summary>

```jsonc
"latex-workshop.hover.preview.newcommand.newcommandFile": "/Users/<you>/LaTeX/yalatex/ya-macros.tex",
```
Hovering over math (and LaTeX Workshop's math preview panel) then renders `\Z`, `\Hom`, `\paren{...}` and the rest. This has to be an absolute path (no `~`). The preview panel doesn't support `$$...$$`; use `\[...\]`.
</details>

<details>
<summary><b><code>@[</code> + Enter for display math</b></summary>

```jsonc
"latex-workshop.intellisense.atSuggestion.user": { "@[": "\\[\n$0\n\\]" },
```
Typing `@[` and pressing Enter gives `\[`, an empty line with the cursor, and `\]`.
</details>

<details>
<summary><b>Errors in the Problems panel instead of pop-ups</b></summary>

```jsonc
"latex-workshop.message.error.show": false,
"latex-workshop.message.warning.show": false,
```
</details>

### Snippets

`vscode/latex.json` has a snippet for every yalatex environment. Type the prefix and press Enter or Tab:

| Prefix | Inserts |
|---|---|
| `THM` `PROP` `LEM` `COR` `CONJ` `DEFN` | theorem, proposition, lemma, corollary, conjecture, definition |
| `EXAM` `RMK` `CLM` `QUE` `EXER` | example, remark, claim, question, exercise |
| `NOTEB` `NOTET` | `notebox`, `notethm` |
| `PRF` `SOL` | `proof`, `solution` |
| `TIT` `TBF` | `\textit{}`, `\textbf{}` (around the selected text, if any) |
| `PART` `MATR` | `\partder[]{}{}` (Tab moves through the arguments), `\matr{}` |

The profile includes them. To use them in your current profile instead, and keep them up to date:

```bash
yalatex vscode-link-snippets
```

This turns VS Code's LaTeX snippets file into a link to `vscode/latex.json` (an existing snippets file is first moved to a dated backup). Snippets you add with **⌘⇧P → Snippets: Configure Snippets → latex** are then saved in the yalatex folder, and new yalatex snippets arrive with `yalatex update`.

### `$` that pairs like `{`

```bash
yalatex vscode-extension
```

installs a small extension (in `vscode/yalatex-vscode`; not part of the profile) that makes `$` behave like `{` in `.tex` files:

| You type | You get |
|---|---|
| `$` | `$\|$` |
| Backspace right after | both deleted |
| `x` then `$` | `$x$\|` (steps over the closing `$`) |
| `\$` | `\$` (a literal dollar sign) |
| `$` with text selected | `$text$` |

It needs LaTeX Workshop and the `code` command (⌘⇧P → **Shell Command: Install 'code' command in PATH**). Uninstall it from the Extensions panel.

### Pasting screenshots (optional)

The [Paste Image](https://marketplace.visualstudio.com/items?itemName=mushan.vscode-paste-image) extension saves a screenshot from the clipboard into the document's `graphics/` folder and inserts a figure. Settings:

```jsonc
"pasteImage.path": "${currentFileDir}/graphics",
"pasteImage.defaultName": "Y-MM-DD-HH-mm-ss",
"pasteImage.showFilePathConfirmInputBox": true,
"pasteImage.filePathConfirmInputBoxMode": "onlyName",
"pasteImage.insertPattern": "\\begin{figure}[h]\n\t\\centering\n\t\\includegraphics[width=0.4\\linewidth]{${imageFileNameWithoutExt}}\n\\end{figure}",
```
Its default shortcut, ⌥⌘V, is also LaTeX Workshop's "View PDF", so move it (keybindings):
```jsonc
{ "key": "ctrl+cmd+v", "command": "extension.pasteImage", "when": "editorTextFocus" },
{ "key": "alt+cmd+v", "command": "-extension.pasteImage", "when": "editorTextFocus" }
```

## Compiling from the terminal

```bash
latexmk -pdf math607.tex
```

latexmk runs pdflatex (and biber) as many times as needed. To put the auxiliary files into `build/` here too, matching the VS Code setting above, create `~/.latexmkrc` containing this line:

```perl
$aux_dir = 'build';
```

This file applies to every latexmk run on your computer, which is why the installer doesn't create it. VS Code builds ignore it, since LaTeX Workshop passes its own setting.

## Updating and uninstalling

```bash
yalatex update                         # git pull, then lists what's new
~/LaTeX/yalatex/install.sh --uninstall # removes the TeX link and the block in your startup file
```

Uninstalling leaves the yalatex folder itself; delete it afterwards if you like. VS Code pieces are removed in VS Code (the uninstall output says where).

---

# Usage

## Modes

Load yalatex right after `\documentclass`, with one mode:

| Mode | Document class | What you get |
|---|---|---|
| `\usepackage[notes]{yalatex}` | `article` | colored theorem boxes, page headers with the section name, styled table of contents |
| `\usepackage[homework]{yalatex}` | `article` | the same fonts and layout, plain (unboxed) theorems numbered 1, 2, 3, ... |
| `\usepackage[paper]{yalatex}` | `amsart` | plain theorems in the usual journal style |
| `\usepackage[beamer]{yalatex}` | `beamer` | Madrid theme with serif fonts; beamer's own `theorem`, `definition`, ... |

With no option, the mode follows the class: `beamer` → beamer, `amsart` → paper, anything else → notes. All modes share the [macros](#macros), clickable references, Palatino fonts, TikZ, tikz-cd, ytableau, tcolorbox, biblatex and listings.

## The yalatex command

```bash
yalatex newnotes math607 'Math 607: Algebraic Topology'
yalatex newhw hw03
yalatex newpaper hodge 'Hodge Theory on $\mathbb{C}$'
yalatex newbeamer jmm-talk 'My Talk'
```

Each creates `./<name>/<name>.tex` from the matching starter in `starters/`, plus an empty `graphics/` folder, fills in the title (default: the name) and author (`YALATEX_AUTHOR`), and opens it in VS Code. Names may contain letters, digits, `-`, `_` and `.`. **Use single quotes** around titles that contain `$`; inside double quotes the shell mangles `$...`.

| Command | |
|---|---|
| `yalatex help [command]` | the list of commands, or details on one |
| `yalatex check` | checks the TeX installation, that LaTeX finds yalatex, PATH, author, VS Code pieces |
| `yalatex update` | downloads the latest yalatex |
| `yalatex vscode-profile`, `vscode-link-snippets`, `vscode-extension` | [VS Code setup](#vs-code-setup-optional) |

To change what new documents start with, edit `starters/starter-<mode>.tex`.

## Theorem-like environments

| Environment | Heading | notes | homework | paper |
|---|---|:-:|:-:|:-:|
| `thm` | Theorem | box | ✓ | ✓ |
| `prop` | Proposition | box | ✓ | ✓ |
| `lem` | Lemma | box | ✓ | ✓ |
| `cor` | Corollary | box | ✓ | ✓ |
| `conj` | Conjecture | box | ✓ | ✓ |
| `defn` | Definition | box | ✓ | ✓ |
| `ex` | Example | ✓ | ✓ | ✓ |
| `rmk` | Remark | ✓ | ✓ | ✓ |
| `claim` | Claim | ✓ | ✓ | ✓ |
| `que` | Question | ✓ | ✓ | ✓ |
| `exercise` | Exercise | ✓ | ✓ | ✓ |
| `notebox` | Note, or a heading you choose | box | | |
| `notethm` | Note, or a heading you choose | ✓ | ✓ | as `note` |
| `solution` | *Solution.* … □ | ✓ | ✓ | |

"box" means a colored box, ✓ the plain theorem style. In paper mode the note environment is called `note`; it works like `notethm`. `proof` (from amsthm) works everywhere. Beamer mode uses beamer's built-in environments.

**Unnumbered:** add `*`, e.g. `\begin{thm*}`.

**Titles and options:**

```latex
\begin{thm}[Fundamental Theorem of Algebra]   % notes boxes thm/prop/lem/conj: the title replaces "Theorem"
\begin{defn}[Group]                           % everywhere else: "Definition (Group)"
\begin{notebox}[Warning]                      % notebox: "Warning" instead of "Note"
\begin{notethm}[Warning][Signs]               % notethm/note: heading word, then title
\begin{lem}[][colback=yellow!10]              % notes boxes: tcolorbox options go second
```

**Numbering:** in notes and paper mode, theorems, definitions, examples, ... share one counter that restarts each section (Theorem 2.1, Definition 2.2, Example 2.3). Homework numbers them 1, 2, 3, ... through the whole document. In notes and homework, exercises have their own count (Exercise 1, 2, ...); in paper mode they share the main one.

**Adding your own** (in the preamble):

```latex
% notes, boxed: name, heading, color, \cref name, plural
\newnamedbox{fact}{Fact}{thmcolor}{Fact}{Facts}      % a title replaces the heading, like thm
\newregbox{axiom}{Axiom}{defcolor}{Axiom}{Axioms}    % "Axiom (title)", like defn
% notes or homework, plain: name, heading, \cref name, plural, color, counter
\newthmtype{obs}{Observation}{Observation}{Observations}{black}{maincounter}
% paper, plain: name, heading, \cref name, plural
\newthmtype{obs}{Observation}{Observation}{Observations}
```

## Labels and references

Put `\label` inside any numbered environment, and refer to it with `\cref`:

```latex
\begin{thm}[Main]\label{thm:main} ... \end{thm}
\begin{equation}\label{eq:key} e^{i\pi} = -1 \end{equation}

By \cref{thm:main} and \cref{eq:key} ...   % "By Theorem 1.2 and Eq. (1) ..."
\cref{thm:main,lem:a,prop:b}                % "Theorem 1.2, Lemma 1.3, and Proposition 1.4"
```

`\cref` writes the name for you, always capitalized, and the whole phrase links to the right place. `\ref` gives just the number. Prefixes like `thm:`, `lem:`, `eq:` are a common habit, but any label works. (In notes-mode boxes, the older form `\begin{thm}[Title][label=thm:main]` also works.)

## Figures

```latex
\includegraphics[width=0.5\linewidth]{diagram}    % looks in the document's graphics/ folder
\figbox{\includegraphics{diagram}}                % centered, inside a theorem box, without a float
```

For commutative diagrams use `tikzcd` (you can draw them at [q.uiver.app](https://q.uiver.app) and paste the code); for Young tableaux, `ytableau`.

## Bibliography

```latex
\addbibresource{references.bib}   % in the preamble (commented out in the starters)
...
\cite{hartshorne}
...
\printbibliography
```

This uses biblatex with biber and alphabetic labels like [Har77]. latexmk and LaTeX Workshop run biber automatically.

## Macros

All of them are in `ya-macros.tex`. The main ones:

**Letters**

| | |
|---|---|
| `\N \Z \Q \R \C \F \A \P \H \D \T` | blackboard bold: ℕ ℤ ℚ ℝ ℂ 𝔽 𝔸 ℙ ℍ 𝔻 𝕋 |
| `\cF \cO \cU \cE \cG \cH \cM \cC \cD` | calligraphic: 𝓕 𝓞 𝓤 ... |
| `\mb{X}`, `\mc{X}`, `\mf{p}` | any letter in `\mathbb`, `\mathcal`, `\mathfrak` |
| `\veps` | ε (`\varepsilon`) |

**Delimiters that grow with their contents**

| | |
|---|---|
| `\paren{x}` `\braks{x}` `\brax{x}` | ( x )  [ x ]  { x } |
| `\abs{x}` `\norm{x}` `\floor{x}` | \|x\|  ‖x‖  ⌊x⌋ |
| `\angles{x}` `\aangles{x}` | ⟨x⟩  ⟨⟨x⟩⟩ |
| `\brax{x \in G \setbar x^2 = e}` | set-builder notation; the bar grows too |

**Arrows** (each takes an optional label on top, e.g. `\arr[f]`)

| | |
|---|---|
| `\arr` `\inj` `\surj` `\maps` | →  ↪  ↠  ↦ |

**With arguments**

| | |
|---|---|
| `\matr{a & b \\ c & d}` | matrix in parentheses |
| `\case{1 & x > 0 \\ 0 & \text{otherwise}}` | cases |
| `\leg{a}{p}` | Legendre symbol (a/p) |
| `\partder{f}{x}`, `\partder[2]{f}{x}` | ∂f/∂x, ∂²f/∂x² |

**Operator names**, upright with the right spacing: `\Hom \End \Aut \Gal \Spec \Pic \Ker \coker \img \Tr \tr \rank \Span \lcm \ord \GL \SL \PGL \PSL \Res \Ind \Frob \Ext \Tor \Ann \supp \Var` and more. For a one-off, `\w{name}` (e.g. `\w{Sym}^2 V`).

**Standard commands that yalatex changes:**

| Command | In yalatex | Normally |
|---|---|---|
| `\bar` `\hat` `\tilde` | wide versions (`\overline`, `\widehat`, `\widetilde`) | narrow accents |
| `\P` `\H` | ℙ, ℍ | ¶, a Hungarian accent |
| `\Re` `\Im` | Re, Im (upright) | ℜ, ℑ |
| `\div` | div (an operator name) | ÷ |
| `\mod{n}`, `\pmod{n}` | `a \mod{n}`, `a \pmod{n}` with wider spacing | similar |
| `\th` (also `\st`, `\nd`) | superscript: `n\th` gives nᵗʰ | þ |

## Troubleshooting

| Problem | Fix |
|---|---|
| ``File `yalatex.sty' not found`` | LaTeX can't find the template: run `install.sh`, or check with `kpsewhich yalatex.sty`. |
| `yalatex: command not found` | Open a new terminal. If that doesn't help, run `echo $SHELL`: the installer wrote to that shell's startup file, and a terminal running a different shell won't read it. |
| `$$ ... $$` doesn't show in VS Code's math preview panel | LaTeX Workshop's panel doesn't support `$$`; use `\[ ... \]`, which is also better LaTeX. |
| `\cref` prints "Section" instead of "Theorem" | The `\label` is outside the environment, or inside an unnumbered `*` one. |
| Builds in VS Code are slow | Make sure `latex-workshop.latex.autoClean.run` is `"never"` (the default); cleaning after every build forces extra passes. |
| Anything else | `yalatex check` shows what's missing. |
