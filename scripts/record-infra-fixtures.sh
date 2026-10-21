#!/bin/bash
# Record what the jsonui-doc infra commands print with --json, as the infra tools' test fixtures
# (tests/fixtures/infra/*.json). The tools summarise those outputs, so the fixtures are the CLI's contract: when the
# CLI's JSON changes, record again and the tools' tests say what no longer holds.
#
#   scripts/record-infra-fixtures.sh <jsonui-cli checkout>     # e.g. a worktree of integrate/2.3.15
#
# Rooms: jsonui-cli's own document_tools/tests/fixtures/infra (aws-three-tier: a model, two load scenarios, a price
# file; compose-and-cloud: what seed reads), copied to a temp folder; one copy is broken on purpose (a load file that
# is not JSON, a model file with a schema error) so the error shapes are recorded too. The fetched-price cache is kept
# out (JUI_VIZ_HOME points nowhere), so the bundled table prices them.
set -euo pipefail
CLI_ROOT="$(cd "${1:?usage: $0 <jsonui-cli checkout>}" && pwd)"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${HERE}/tests/fixtures/infra"
FIX="${CLI_ROOT}/document_tools/tests/fixtures/infra"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

export PYTHONPATH="${CLI_ROOT}/document_tools:${CLI_ROOT}/jui_tools:${CLI_ROOT}/test_tools"
export JUI_VIZ_HOME=/nonexistent
doc() { (cd "$1" && shift && python3 -m jsonui_doc_cli.cli "$@") || true; }

cp -R "${FIX}/aws-three-tier" "${WORK}/room"
cp -R "${FIX}/aws-three-tier" "${WORK}/broken"
printf '{' > "${WORK}/broken/docs/infra/load/broken.json"
printf '{"version": 0, "nodes": [{"id": "x", "category": "nope"}]}' > "${WORK}/broken/docs/infra/bad.json"
mkdir -p "${WORK}/seed/app"
cat > "${WORK}/seed/docker-compose.yml" <<'EOF'
services:
  web:
    image: example/web
    depends_on: [db, cache]
  db:
    image: postgres:16
  cache:
    image: redis:7
EOF
cat > "${WORK}/seed/main.tf" <<'EOF'
provider "aws" { region = "ap-northeast-1" }
resource "aws_db_instance" "main" { engine = "postgres" }
resource "aws_lb" "web" { load_balancer_type = "application" }
resource "aws_s3_bucket" "assets" {}
resource "aws_glue_job" "etl" {}
EOF
printf 'import boto3\nimport stripe\nQUEUE_URL = "SQS_QUEUE_URL"\n' > "${WORK}/seed/app/main.py"
cat > "${WORK}/room/jui.config.json" <<'EOF'
{"checks": [{"name": "infra-load", "type": "builtin:infra-load"}, {"name": "infra-code", "type": "builtin:infra-code"}]}
EOF

mkdir -p "${OUT}" "${WORK}/empty"
doc "${WORK}/empty" validate infra --json > "${OUT}/validate-infra.unreadable.json"
doc "${WORK}/empty" validate infra-load --json > "${OUT}/validate-infra-load.unreadable.json"
doc "${WORK}/room" validate infra --json > "${OUT}/validate-infra.ok.json"
doc "${WORK}/broken" validate infra --json > "${OUT}/validate-infra.errors.json"
doc "${WORK}/room" validate infra-load --json > "${OUT}/validate-infra-load.ok.json"
doc "${WORK}/broken" validate infra-load --json > "${OUT}/validate-infra-load.errors.json"
doc "${WORK}/room" validate infra-prices --json > "${OUT}/validate-infra-prices.ok.json"
doc "${WORK}/seed" seed infra -o "${WORK}/seed-out" > /dev/null
cp "${WORK}/seed-out/draft.json" "${OUT}/seed-infra.draft.json"
cp "${WORK}/seed-out/seed-report.json" "${OUT}/seed-infra.report.json"
doc "${WORK}/room" cost infra --json > "${OUT}/cost-infra.month.json"
doc "${WORK}/room" cost infra --by node --scenario sale --json > "${OUT}/cost-infra.month-by-node.json"
doc "${WORK}/room" cost infra --date 2026-11-03 --json > "${OUT}/cost-infra.day.json"
doc "${WORK}/room" cost infra --scenario nope --json > "${OUT}/cost-infra.refused.json"
doc "${WORK}/room" check infra --json 2>/dev/null > "${OUT}/check-infra.json"

# The temp folder's path is not part of the contract
for f in "${OUT}"/*.json; do
  python3 - "$f" "${WORK}" <<'EOF'
import sys
p, work = sys.argv[1:]
s = open(p, encoding="utf-8").read().replace(work, "<ROOT>")
open(p, "w", encoding="utf-8").write(s)
EOF
done
git -C "${CLI_ROOT}" log -1 --format='%h %s' > "${OUT}/RECORDED_FROM"
ls -1 "${OUT}"
