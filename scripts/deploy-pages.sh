#!/usr/bin/env bash
# Push current HEAD to origin and watch the GitHub Pages deploy for that commit.
# workflow_dispatch alone redeploys remote main and skips unpushed local commits.
set -euo pipefail

cd "$(dirname "$0")/.."

# Only tracked modifications block deploy (ignore untracked docs screenshots etc.)
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "error: uncommitted changes to tracked files. Commit first, then run: npm run pages"
  git status --short --untracked-files=no
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=normal | grep '^??' || true)" ]]; then
  echo "note: untracked files are present and will not be deployed:"
  git status --short --untracked-files=normal | grep '^??' || true
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "error: deploy from main only (current: $branch)"
  exit 1
fi

sha="$(git rev-parse HEAD)"
echo "Pushing $sha to origin/main ..."
git push origin HEAD

echo "Waiting for Pages workflow on $sha ..."
run_id=""
for _ in $(seq 1 45); do
  run_id="$(
    gh run list \
      --workflow="Deploy to GitHub Pages" \
      --commit "$sha" \
      --limit 1 \
      --json databaseId \
      --jq '.[0].databaseId // empty'
  )"
  if [[ -n "$run_id" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "error: no workflow run found for commit $sha"
  exit 1
fi

echo "Watching run $run_id ..."
gh run watch "$run_id" --exit-status
gh run view "$run_id" --json conclusion,url,displayTitle \
  --jq '"\(.conclusion): \(.displayTitle)\n\(.url)"'
echo "Site: https://isaac99kr.github.io/br/"
