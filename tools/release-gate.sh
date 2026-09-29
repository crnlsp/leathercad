#!/usr/bin/env bash
# The release gate (.github/workflows/release-gate.yml). A pull request into
# main comes from develop, with every item under the roadmap's next release
# done, or it is release-please's own release pull request.
#
# Run it by hand to see what the next release still waits for:
#   tools/release-gate.sh
set -euo pipefail

head_ref="${HEAD_REF:-develop}"

fail() {
  echo "::error title=Release gate::$1"
  exit 1
}

# A fork can name its branch develop too.
[[ "${HEAD_REPO:-}" == "${GITHUB_REPOSITORY:-}" ]] ||
  fail "A pull request into main comes from this repository's develop, not from a fork."

case "$head_ref" in
  release-please--*)
    echo "release-please's release pull request."
    exit 0
    ;;
  develop) ;;
  *)
    fail "main changes only through a pull request from develop, not from $head_ref. Open it against develop instead (CONTRIBUTING.md, Branches)."
    ;;
esac

section=$(awk '/^## .* — the next release$/ { found = 1; next } found && /^## / { exit } found' docs/roadmap.md)
[[ -n "$section" ]] ||
  fail "docs/roadmap.md has no '## <version> — the next release' section to check."

open=$(grep -E '☐|◐' <<<"$section" || true)
if [[ -n "$open" ]]; then
  echo "$open" | cut -c1-120
  fail "The next release is not done: $(wc -l <<<"$open") items above are still planned or in progress. Finish them, or move them to a later release in a change of their own (CONTRIBUTING.md, Changelog and releases)."
fi

echo "Every item in the next release is done."
