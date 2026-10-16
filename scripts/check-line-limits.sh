#!/usr/bin/env bash
# Fails when any source file is longer than the 500-line limit (project.md §2
# rule 7; standard §4.1). Adapted from Vairiot CI.
#
#   bash scripts/check-line-limits.sh            check every tracked source file
#   bash scripts/check-line-limits.sh --staged   check only files staged for commit
#
# Files that were already over the limit when the standard was adopted (stage
# 0.10) are listed in scripts/line-limit-baseline.txt with their length then.
# They may shrink but never grow; split them, largest first, and delete the
# line once a file is within the limit. The list only ever gets shorter.
set -euo pipefail

LIMIT="${LINE_LIMIT:-500}"
EXTENSIONS='\.(ts|tsx|js|mjs|cjs|jsx|kt|kts|swift|py|sql|css|sh)$'
EXCLUDE='(^|/)(node_modules|dist|build|coverage|generated|\.husky)/|package-lock\.json|/migrations/.*\.sql$'
BASELINE="scripts/line-limit-baseline.txt"

cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--staged" ]]; then
  files=$(git diff --cached --name-only --diff-filter=ACM || true)
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  files=$(git ls-files --cached --others --exclude-standard)
else
  files=$(find . -type f | sed 's|^\./||')
fi

# Recorded length of a baseline file, or empty.
baseline_for() {
  [[ -f "$BASELINE" ]] || return 0
  awk -v f="$1" '$1 !~ /^#/ && $2 == f { print $1 }' "$BASELINE"
}

failed=0
while IFS= read -r file; do
  [[ -z "$file" || ! -f "$file" ]] && continue
  [[ "$file" =~ $EXTENSIONS ]] || continue
  [[ "$file" =~ $EXCLUDE ]] && continue
  lines=$(wc -l < "$file" | tr -d ' ')
  allowed=$(baseline_for "$file")
  if [[ -n "$allowed" ]]; then
    if (( lines > allowed )); then
      echo "✗ $file has $lines lines; it is on the baseline at $allowed and may not grow"
      failed=1
    elif (( lines <= LIMIT )); then
      echo "• $file is now within $LIMIT lines: remove it from $BASELINE"
    fi
  elif (( lines > LIMIT )); then
    echo "✗ $file has $lines lines (limit $LIMIT)"
    failed=1
  fi
done <<< "$files"

if (( failed )); then
  echo "Split the files above before committing (maximum $LIMIT lines per file)."
  exit 1
fi
echo "✓ All source files are within $LIMIT lines or their baseline"
