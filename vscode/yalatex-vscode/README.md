# yalatex VS Code extension

Makes `$` in `.tex` files behave like `{`:

| You type | You get |
|---|---|
| `$` | `$\|$` (cursor in the middle) |
| Backspace right after | both `$` deleted |
| `x` then `$` | `$x$\|` (the closing `$` is stepped over, not doubled) |
| `\$` | `\$` (a literal dollar sign; nothing added) |
| `$` with text selected | `$text$` |

It adds `$` to the pairs LaTeX Workshop closes automatically, reading LaTeX
Workshop's own list when VS Code starts. Requires LaTeX Workshop.

Install with `yalatex vscode-extension`; uninstall from the Extensions panel.
After changing `extension.js` or `package.json`, raise `version` in
`package.json` so `yalatex check` and `yalatex update` notice.
