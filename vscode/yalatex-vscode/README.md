# yalatex VS Code extension

Makes `$` in `.tex` files behave like `{`:

| You type | You get |
|---|---|
| `$` | `$\|$` (cursor in the middle) |
| Backspace right after | both `$` deleted |
| `x` then `$` | `$x$\|` (the closing `$` is stepped over, not doubled) |
| `\$` | `\$` (a literal dollar sign; nothing added) |
| `$` with text selected | `$text$` |

## TikZ figures (Ctrl+F)

Type a figure name on its own line and press **Ctrl+F**. The line becomes
`\tikzfig{name}` and [TikZ Editor](https://github.com/YuvalAmit2/tikz-editor)
opens `graphics/name.tikz` next to your `.tex` file. Draw, then press
**Cmd+Enter** in TikZ Editor to save and come back. Ctrl+F on a line that
already has `\tikzfig{name}` opens that figure again.

The editor is found at `~/latex/tikz-editor/bin/tikz-editor`; change the
`yalatex.tikzEditor` setting if yours is elsewhere. `\tikzfig` needs
`tikzfig.sty` (run `npm run install-sty` in the tikz-editor folder once;
yalatex loads it automatically).

## How the $ pairing works

It adds `$` to the pairs LaTeX Workshop closes automatically, reading LaTeX
Workshop's own list when VS Code starts. Requires LaTeX Workshop.

Install with `yalatex vscode-extension`; uninstall from the Extensions panel.
After changing `extension.js` or `package.json`, raise `version` in
`package.json` so `yalatex check` and `yalatex update` notice.
