#!/usr/bin/env bash
# copilot-review.sh — drive a GitHub Copilot PR review to a clean pass.
#
# The loop: fix (one commit per finding) -> reply with the fix sha -> resolve
# the thread -> re-request Copilot -> poll the async re-review -> repeat until
# 0 new comments. This wraps the non-obvious bits:
#   * a review thread has a node-id (PRRT_…, used to RESOLVE) AND its top
#     comment has a databaseId (used to REPLY) — they are different ids;
#   * the reviewer slug is `copilot-pull-request-reviewer[bot]`, and it
#     auto-resolves threads it considers fixed when you push;
#   * re-review is async — baseline the latest bot review timestamp and poll.
#
# Repo/PR are inferred from the current branch's PR; override with COPILOT_PR.
#
# Usage:
#   scripts/copilot-review.sh threads              # list OPEN threads: <commentId> <threadNodeId> <path:line>
#   scripts/copilot-review.sh reply <commentId> <message…>
#   scripts/copilot-review.sh resolve <threadNodeId>
#   scripts/copilot-review.sh rerequest            # ask Copilot to review again
#   scripts/copilot-review.sh poll [timeoutSec]    # block until re-review (exit 0) or timeout (exit 1)
#   scripts/copilot-review.sh status               # open-thread count + latest Copilot verdict
set -euo pipefail

BOT="copilot-pull-request-reviewer[bot]"

die()  { echo "error: $*" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
need gh; need jq

resolve_target() {
  local nwo
  nwo=$(gh repo view --json nameWithOwner -q .nameWithOwner) || die "not inside a GitHub repo (gh)"
  OWNER=${nwo%%/*}; REPO=${nwo##*/}
  PR=${COPILOT_PR:-$(gh pr view --json number -q .number 2>/dev/null || true)}
  [[ -n "${PR:-}" ]] || die "no open PR for the current branch; set COPILOT_PR=<number>"
  [[ "$PR" =~ ^[0-9]+$ ]] || die "PR must be numeric, got: $PR"
}

threads_json() {
  gh api graphql -f query="query { repository(owner:\"$OWNER\",name:\"$REPO\"){ pullRequest(number:$PR){ reviewThreads(first:50){ nodes { id isResolved comments(first:1){ nodes { databaseId path line } } } } } } }"
}

cmd_threads() {
  threads_json | jq -r '
    .data.repository.pullRequest.reviewThreads.nodes[]
    | select(.isResolved==false)
    | "\(.comments.nodes[0].databaseId)\t\(.id)\t\(.comments.nodes[0].path):\(.comments.nodes[0].line)"'
}

cmd_reply() {
  local id="${1:-}"; shift || true; local body="${*:-}"
  [[ -n "$id" && -n "$body" ]] || die "usage: reply <commentDatabaseId> <message…>"
  gh api --method POST "repos/$OWNER/$REPO/pulls/$PR/comments/$id/replies" -f body="$body" --jq '.id' >/dev/null
  echo "replied on comment $id"
}

cmd_resolve() {
  local tid="${1:-}"
  [[ -n "$tid" ]] || die "usage: resolve <threadNodeId (PRRT_…)>"
  gh api graphql -f query="mutation { resolveReviewThread(input:{threadId:\"$tid\"}){ thread { isResolved } } }" \
    --jq '.data.resolveReviewThread.thread.isResolved' | xargs -I{} echo "thread $tid resolved={}"
}

cmd_rerequest() {
  gh api --method POST "repos/$OWNER/$REPO/pulls/$PR/requested_reviewers" -f "reviewers[]=$BOT" >/dev/null
  echo "re-requested $BOT on PR #$PR"
}

latest_bot_ts()    { gh api "repos/$OWNER/$REPO/pulls/$PR/reviews" --jq "[.[]|select(.user.login==\"$BOT\")]|last|.submitted_at // \"\""; }
# GitHub may report the Copilot reviewer either as the user "Copilot" or by the
# bot slug; match either so `poll` doesn't false-error as "nothing to wait for".
still_requested()  { gh api "repos/$OWNER/$REPO/pulls/$PR/requested_reviewers" 2>/dev/null \
                       | jq -r --arg bot "$BOT" '[.users[].login] | (index("Copilot") // index($bot)) // empty' 2>/dev/null || true; }

cmd_status() {
  local open; open=$(cmd_threads | grep -c . || true)
  echo "PR #$PR ($OWNER/$REPO) — open review threads: ${open:-0}"
  gh api "repos/$OWNER/$REPO/pulls/$PR/reviews" \
    --jq "([.[]|select(.user.login==\"$BOT\")]|last) as \$r | if \$r then \"latest Copilot: \\(\$r.state) @ \\(\$r.submitted_at)\" else \"no Copilot review yet\" end" 2>/dev/null || true
}

cmd_poll() {
  local timeout="${1:-600}" step=25 waited=0 base now start_req
  base=$(latest_bot_ts)
  start_req=$(still_requested)
  # Guard against a false clean pass: with no prior review AND Copilot not
  # requested (e.g. `poll` before `rerequest`), there is nothing to wait for.
  if [[ -z "$base" && -z "$start_req" ]]; then
    die "nothing to wait for — no prior Copilot review and Copilot is not requested; run 'rerequest' first"
  fi
  echo "polling for Copilot re-review (baseline='${base:-none}', timeout=${timeout}s)…"
  while (( waited < timeout )); do
    sleep "$step"; waited=$((waited + step))
    now=$(latest_bot_ts)
    # Complete on a newer review, or Copilot leaving the requested list (only if it
    # WAS queued at start). A re-review is "clean" only when no threads remain open —
    # a new review that itself raises findings is NOT a clean pass.
    if [[ ( -n "$now" && "$now" != "$base" ) || ( -n "$start_req" && -z "$(still_requested)" ) ]]; then
      local open
      if ! open=$(cmd_threads); then
        echo "→ could not fetch review threads (auth/rate-limit/network); not trusting a clean result" >&2; return 2
      fi
      if [[ -n "$open" ]]; then
        echo "→ re-review complete — OPEN findings remain:"; echo "$open"; cmd_status; return 1
      fi
      echo "→ clean pass — no open review threads"; cmd_status; return 0
    fi
    echo "  …waited ${waited}s"
  done
  echo "timeout after ${timeout}s — no re-review yet" >&2; return 1
}

usage() { sed -n '2,26p' "$0"; }

case "${1:-help}" in help|-h|--help) usage; exit 0 ;; esac

resolve_target
case "${1:-help}" in
  threads)            cmd_threads ;;
  reply)    shift;    cmd_reply "$@" ;;
  resolve)  shift;    cmd_resolve "$@" ;;
  rerequest|re-request) cmd_rerequest ;;
  poll)     shift;    cmd_poll "$@" ;;
  status)             cmd_status ;;
  help|-h|--help)     usage ;;
  *) echo "unknown subcommand: $1" >&2; usage; exit 2 ;;
esac
