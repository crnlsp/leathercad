#!/usr/bin/env bash
# The release gate (.github/workflows/release-gate.yml). A pull request into
# main comes from develop, with every item under the roadmap's next release
# done; from a hotfix/ branch, holding only fixes; or it is release-please's
# own release pull request.
#
# Run it by hand to see what the next release still waits for:
#   tools/release-gate.sh
# or whether a hotfix branch, checked out, would pass:
#   HEAD_REF=hotfix/<name> tools/release-gate.sh
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
  hotfix/*)
    # A patch release past the roadmap (CONTRIBUTING.md, Hotfixes). Main takes
    # merge commits, so release-please reads each of these commits: all fixes,
    # none breaking and none naming its own version, it cuts a patch. A branch
    # cut from develop fails here too, on develop's commits.
    range="${BASE_SHA:-origin/main}..${HEAD_SHA:-HEAD}"
    subjects=$(git log --no-merges --format=%s "$range")
    [[ -n "$subjects" ]] || fail "The hotfix has no commits on top of main."
    other=$(grep -vE '^fix(\([^)]+\))?: ' <<<"$subjects" || true)
    if [[ -n "$other" ]]; then
      echo "$other"
      fail "A hotfix holds only fix commits, so it ships as a patch: $(wc -l <<<"$other") above are not. A dependency bump is fix(deps), not chore(deps). Cut the branch from main, not develop."
    fi
    if git log --no-merges --format=%B "$range" | grep -qE '^(BREAKING[ -]CHANGE|Release-As):'; then
      fail "A hotfix is a patch: no BREAKING CHANGE or Release-As footer."
    fi
    echo "A hotfix of $(wc -l <<<"$subjects") fix commits."
    exit 0
    ;;
  develop) ;;
  *)
    fail "main changes only through a pull request from develop or a hotfix/ branch, not from $head_ref. Open it against develop instead (CONTRIBUTING.md, Branches)."
    ;;
esac

section=$(awk '/^## .* — the next release$/ { found = 1; next } found && /^## / { exit } found' docs/roadmap.md)
[[ -n "$section" ]] ||
  fail "docs/roadmap.md has no '## <version> — the next release' section to check."

# The section must be one that has not shipped. Left in place after its
# release, every item in it is done because it shipped, and the check below
# would pass a release of whatever has landed since, none of it in the section.
next=$(sed -nE 's/^## ([0-9]+(\.[0-9]+)*) — the next release$/\1/p' docs/roadmap.md | head -1)
released=$(sed -nE 's/^ *"\.": *"([^"]+)".*$/\1/p' .release-please-manifest.json)
[[ -n "$next" ]] ||
  fail "The next release's heading in docs/roadmap.md names no version, like '## 1.4 — the next release'."
[[ -n "$released" ]] ||
  fail ".release-please-manifest.json names no released version to compare the next release with."
if [[ "$next" == "$released" || "$(printf '%s\n' "$released" "$next" | sort -V | tail -1)" != "$next" ]]; then
  fail "docs/roadmap.md names $next as the next release, but $released is already released. Start the next section first (CONTRIBUTING.md, Changelog and releases)."
fi

open=$(grep -E '☐|◐' <<<"$section" || true)
if [[ -n "$open" ]]; then
  echo "$open" | cut -c1-120
  fail "The next release is not done: $(wc -l <<<"$open") items above are still planned or in progress. Finish them, or move them to a later release in a change of their own (CONTRIBUTING.md, Changelog and releases)."
fi

echo "Every item in the next release is done."
