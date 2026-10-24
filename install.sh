#!/usr/bin/env bash
# install.sh -- set up yalatex on this computer (macOS or Linux).
#
#   ./install.sh               interactive setup
#   ./install.sh --yes         accept every default without asking
#   ./install.sh --author "Your Name"
#   ./install.sh --uninstall   undo everything this script did
#
# What it does (each step asks first, and running it again is safe):
#   1. Checks that a TeX distribution is installed.
#   2. Makes LaTeX find yalatex from any folder, by linking this folder into
#      your personal TeX folder (TEXMFHOME, e.g. ~/Library/texmf on a Mac).
#   3. Puts the `yalatex` command on your PATH and saves your name for new
#      documents (YALATEX_AUTHOR), in a marked block in your shell's startup
#      file (~/.zshrc, ~/.bash_profile or ~/.bashrc).
#   4. Runs `yalatex check`.
# It does not touch VS Code, ~/.latexmkrc, or anything outside the files above.

set -eu

yalatex_dir=$(cd -P "$(dirname "$0")" && pwd)
block_start="# >>> yalatex >>>"
block_end="# <<< yalatex <<<"

if [ -t 1 ]; then
  bold=$'\e[1m'; green=$'\e[32m'; yellow=$'\e[33m'; red=$'\e[31m'; reset=$'\e[0m'
else
  bold=; green=; yellow=; red=; reset=
fi
step() { printf '\n%s%s%s\n' "$bold" "$*" "$reset"; }
ok()   { printf '  %s✓%s %s\n' "$green" "$reset" "$*"; }
warn() { printf '  %s!%s %s\n' "$yellow" "$reset" "$*"; }
fail() { printf '  %s✗%s %s\n' "$red" "$reset" "$*"; }

assume_yes=0
author_arg=
author_given=0
mode=install
while [ $# -gt 0 ]; do
  case $1 in
    -y|--yes) assume_yes=1 ;;
    --author) [ $# -ge 2 ] || { echo "install.sh: --author needs a name" >&2; exit 1; }
              author_arg=$2; author_given=1; shift ;;
    --uninstall) mode=uninstall ;;
    -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "install.sh: unknown option '$1' (see ./install.sh --help)" >&2; exit 1 ;;
  esac
  shift
done

# ask "Question" [default y|n] -> returns 0 for yes
ask() {
  local default=${2:-y} reply
  if [ "$assume_yes" = 1 ] || [ ! -t 0 ]; then [ "$default" = y ]; return; fi
  if [ "$default" = y ]; then printf '  %s [Y/n] ' "$1"; else printf '  %s [y/N] ' "$1"; fi
  read -r reply || reply=
  [ -z "$reply" ] && reply=$default
  case $reply in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# The startup file of the user's login shell.
shell_rc() {
  case $(basename "${SHELL:-}") in
    zsh)  echo "$HOME/.zshrc" ;;
    bash) if [ "$(uname)" = Darwin ]; then echo "$HOME/.bash_profile"; else echo "$HOME/.bashrc"; fi ;;
    *)    return 1 ;;
  esac
}

# Print a file without the yalatex block.
without_block() {
  awk -v s="$block_start" -v e="$block_end" '$0 == s {skip = 1; next} $0 == e {skip = 0; next} !skip' "$1"
}

# Replace (or remove, if $2 is empty) the yalatex block in file $1. Writes
# through the existing file, so a startup file that is itself a symlink
# (e.g. managed by a dotfiles repo) stays a symlink.
write_block() {
  local file=$1 content=$2 tmp
  tmp=$(mktemp)
  if [ -f "$file" ]; then without_block "$file" > "$tmp"; fi
  if [ -n "$content" ]; then
    printf '%s\n%s\n%s\n' "$block_start" "$content" "$block_end" >> "$tmp"
  fi
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# The value of YALATEX_AUTHOR saved in an existing block, if any.
saved_author() {
  [ -f "$1" ] || return 0
  awk -v s="$block_start" -v e="$block_end" '
    $0 == s {inb = 1; next} $0 == e {inb = 0}
    inb && /^export YALATEX_AUTHOR=/ { sub(/^export YALATEX_AUTHOR="/, ""); sub(/"$/, ""); print }' "$1" |
    sed 's/\\\(.\)/\1/g'
}

# Quote a value for use inside "..." in a shell startup file.
shell_quote() { printf '%s' "$1" | sed 's/[\\"$`]/\\&/g'; }

# Show a path with $HOME instead of the home folder, as it would be written in a startup file.
home_path() { case $1 in "$HOME"/*) printf '$HOME%s' "${1#"$HOME"}" ;; *) printf '%s' "$1" ;; esac; }

# ---------------------------------------------------------------------------
if [ "$mode" = uninstall ]; then
  echo "${bold}Uninstalling yalatex${reset} (the folder $yalatex_dir itself is left alone)"
  step "LaTeX link"
  if command -v kpsewhich >/dev/null 2>&1; then
    link="$(kpsewhich -var-value TEXMFHOME)/tex/latex/yalatex"
    if [ -L "$link" ] && [ "$(cd -P "$link" && pwd)" = "$yalatex_dir" ]; then
      rm "$link"; ok "removed $link"
    elif [ -e "$link" ] || [ -L "$link" ]; then
      warn "$link is not a link to this folder; left alone"
    else
      ok "no link found"
    fi
  else
    warn "kpsewhich not found; can't look up the TeX folder"
  fi
  step "Shell startup files"
  for rc in "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc"; do
    if [ -f "$rc" ] && grep -qxF "$block_start" "$rc"; then
      write_block "$rc" ""; ok "removed the yalatex block from $rc"
    fi
  done
  echo
  echo "Done. Open a new terminal for the PATH change to take effect."
  echo "VS Code pieces, if you set them up, are separate:"
  echo "  - the \$ extension: uninstall it from VS Code's Extensions panel (search \"yalatex\")"
  echo "  - linked snippets: delete the latex.json link in VS Code's snippets folder"
  echo "    (a backup of your earlier snippets, if any, is next to it)"
  echo "  - the yalatex profile: VS Code -> Settings -> Profiles -> delete \"yalatex\""
  exit 0
fi

# ---------------------------------------------------------------------------
echo "${bold}Setting up yalatex${reset} from $yalatex_dir"
case $yalatex_dir in
  *"/Library/Mobile Documents/"*|*/Dropbox/*|*/OneDrive*)
    warn "This folder is synced by iCloud/Dropbox/OneDrive. Syncing can damage git"
    warn "repositories; a folder like ~/LaTeX/yalatex is safer. (Continuing anyway.)" ;;
esac

step "1. TeX installation"
# MacTeX puts its programs in /Library/TeX/texbin; a terminal opened before
# installing it doesn't have that on PATH yet.
if ! command -v kpsewhich >/dev/null 2>&1 && [ -x /Library/TeX/texbin/kpsewhich ]; then
  PATH="/Library/TeX/texbin:$PATH"
  warn "MacTeX is installed but not on this terminal's PATH; open a new terminal after this"
fi
if ! command -v kpsewhich >/dev/null 2>&1; then
  fail "No TeX installation found (kpsewhich is missing)."
  echo "    Install one first, then run this script again:"
  echo "      macOS: MacTeX, https://www.tug.org/mactex/ (the full version, not BasicTeX)"
  echo "      Linux: TeX Live, e.g. sudo apt install texlive-full"
  exit 1
fi
missing=
for tool in pdflatex latexmk biber; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else fail "$tool not found"; missing="$missing $tool"; fi
done
if [ -n "$missing" ]; then
  warn "Missing:$missing. yalatex needs a full TeX installation (MacTeX or texlive-full)."
  ask "Continue anyway?" n || exit 1
fi

step "2. Make yalatex findable by LaTeX from any folder"
texmfhome=$(kpsewhich -var-value TEXMFHOME)
link="$texmfhome/tex/latex/yalatex"
echo "  Link: $link -> $yalatex_dir"
if [ -L "$link" ] && [ "$(cd -P "$link" 2>/dev/null && pwd)" = "$yalatex_dir" ]; then
  ok "already linked"
elif [ -e "$link" ] && [ ! -L "$link" ]; then
  fail "$link already exists and is a real folder, not a link. Move it away and run this again."
  exit 1
elif ask "Create this link?" y; then
  mkdir -p "$(dirname "$link")"
  if [ -L "$link" ]; then
    warn "replacing the old link, which pointed to $(readlink "$link")"
    rm "$link"
  fi
  ln -s "$yalatex_dir" "$link"
  ok "linked"
else
  warn "skipped; LaTeX won't find yalatex.sty outside this folder"
fi
found=$(cd / && kpsewhich yalatex.sty 2>/dev/null || true)
if [ -n "$found" ] && [ "$(cd -P "$(dirname "$found")" && pwd)" = "$yalatex_dir" ]; then
  ok "LaTeX finds $found"
elif [ -n "$found" ]; then
  warn "LaTeX finds a different yalatex.sty: $found"
fi

step "3. The yalatex command and your name"
if rc=$(shell_rc); then
  echo "  Your shell reads $rc at startup; the settings go there in a block marked"
  echo "  \"$block_start\"."
  author=$(saved_author "$rc")
  [ -n "$author" ] || author=${YALATEX_AUTHOR:-}
  if [ "$author_given" = 1 ]; then
    author=$author_arg
  elif [ "$assume_yes" = 0 ] && [ -t 0 ]; then
    printf '  Your name, for \\author{...} in new documents%s: ' "${author:+ [$author]}"
    read -r reply || reply=
    [ -n "$reply" ] && author=$reply
  fi
  content="export PATH=\"$(home_path "$yalatex_dir/bin"):\$PATH\""
  if [ -n "$author" ]; then
    content="$content
export YALATEX_AUTHOR=\"$(shell_quote "$author")\""
  fi
  echo "  The block will read:"
  printf '%s\n' "$content" | sed 's/^/      /'
  if ask "Write it to $rc?" y; then
    write_block "$rc" "$content"
    ok "saved; it applies to terminals opened from now on"
  else
    warn "skipped"
  fi
  export PATH="$yalatex_dir/bin:$PATH"
  [ -z "$author" ] || export YALATEX_AUTHOR="$author"
else
  warn "Your shell (${SHELL:-unknown}) isn't zsh or bash, so add these to its startup file yourself:"
  echo "      PATH: $yalatex_dir/bin"
  echo "      YALATEX_AUTHOR: your name"
  export PATH="$yalatex_dir/bin:$PATH"
fi

step "4. Check"
"$yalatex_dir/bin/yalatex" check || true

echo
echo "${bold}Done.${reset} Open a new terminal, then try:  yalatex help"
echo "Optional VS Code setup (nothing was changed in VS Code): see the README, or"
echo "  yalatex help vscode-profile"
