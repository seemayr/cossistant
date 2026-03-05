#!/usr/bin/env bash
set -euo pipefail

FORBIDDEN_PATTERN='@api/ai-agent/(prompts|settings|behaviors|actions|capabilities-studio|pipeline|tools|kill-switch)'

MATCHES=$(rg -n "$FORBIDDEN_PATTERN" apps/api/src apps/workers/src packages apps/web/src || true)

if [[ -n "$MATCHES" ]]; then
	echo "Forbidden ai-agent runtime imports found:"
	echo "$MATCHES"
	exit 1
fi

echo "ai-pipeline hard-cut import guard passed"
