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

# Migration plans (jsonui-cli 2.3.20+), in a copy of their own so the room above stays a room without plans: one plan
# that holds (replace db-prod, add worker-prod and its edge, remove api-stg with its edges, in a written order), and one
# plan per migration.* code with exactly that error.
plan() {  # plan <room> <name> <changes json> <removals json>
  mkdir -p "$1/docs/infra/migrations/$2"
  printf '%s' "$3" > "$1/docs/infra/migrations/$2/changes.json"
  printf '%s' "$4" > "$1/docs/infra/migrations/$2/removals.json"
}
cp -R "${FIX}/aws-three-tier" "${WORK}/plans"
DB='{"id": "db-prod", "category": "database.relational", "service": "rds.postgres", "group": "private-prod", "ha": "multi-az", "environments": ["production"], "spec": [{"key": "instance_class", "value": "db.r6g.large"}, {"key": "storage_gb", "value": "200"}]}'
WORKER='{"id": "worker-prod", "category": "compute.container", "service": "ecs.fargate", "group": "private-prod", "count": 1, "environments": ["production"], "spec": [{"key": "cpu", "value": "512"}, {"key": "memory", "value": "1024"}, {"key": "tasks", "value": "1"}]}'
NONE='{"version": 0, "nodes": [], "groups": [], "edges": []}'
plan "${WORK}/plans" move "{\"version\": 0, \"order\": [\"db-prod\", \"worker-prod\", \"api-stg\"], \"nodes\": [${DB}, ${WORKER}], \"edges\": [{\"from\": \"api-prod\", \"to\": \"worker-prod\", \"protocol\": \"https\", \"port\": 443}]}" \
  '{"version": 0, "nodes": ["api-stg"], "groups": [], "edges": []}'
# the account's month needs a load in two environments: staging gets one here (only in this copy)
python3 - "${WORK}/plans/docs/infra/load" <<'EOF'
import json, sys
d = json.load(open(f"{sys.argv[1]}/ordinary.json", encoding="utf-8"))
d.update(id="staging", label="staging", environment="staging",
         loads=[{"node": "alb-stg", "quantities": {"lcu": 1}}, {"node": "api-stg", "quantities": {"vcpu": 0.25, "memory_gb": 0.5}},
                {"node": "db-stg", "sku": "db.t4g.medium", "quantities": {"storage_gb": 20}}], edges=[])
json.dump(d, open(f"{sys.argv[1]}/staging.json", "w", encoding="utf-8"), ensure_ascii=False)
EOF
cp -R "${FIX}/aws-three-tier" "${WORK}/badplans"
plan "${WORK}/badplans" remove-missing "{\"version\": 0, \"nodes\": [${WORKER}]}" '{"version": 0, "nodes": ["nope"], "groups": [], "edges": []}'
plan "${WORK}/badplans" duplicate "{\"version\": 0, \"nodes\": [${WORKER}, ${WORKER}]}" "${NONE}"
plan "${WORK}/badplans" both "{\"version\": 0, \"nodes\": [${DB}]}" '{"version": 0, "nodes": ["db-prod"], "groups": [], "edges": []}'
plan "${WORK}/badplans" order-unknown "{\"version\": 0, \"order\": [\"ghost\"], \"nodes\": [${WORKER}]}" "${NONE}"
plan "${WORK}/badplans" edge-end "{\"version\": 0, \"nodes\": [${WORKER}], \"edges\": [{\"from\": \"worker-prod\", \"to\": \"ghost\", \"protocol\": \"https\", \"port\": 443}]}" "${NONE}"
doc "${WORK}/plans" validate infra --json > "${OUT}/validate-infra.plans.json"
doc "${WORK}/plans" validate infra --migration move --json > "${OUT}/validate-infra.plan-move.json"
doc "${WORK}/plans" validate infra --migration nope --json > "${OUT}/validate-infra.plan-none.json"
for code in remove-missing duplicate both order-unknown edge-end; do
  doc "${WORK}/badplans" validate infra --migration "${code}" --json > "${OUT}/validate-infra.plan-${code}.json"
done
doc "${WORK}/plans" cost infra --migration move --json > "${OUT}/cost-infra.plan-move.json"
doc "${WORK}/plans" cost infra --migration move --account --scenario sale --json > "${OUT}/cost-infra.plan-move-account.json"
doc "${WORK}/badplans" cost infra --migration both --json > "${OUT}/cost-infra.plan-bad.json"
doc "${WORK}/plans" cost infra --migration nope --json > "${OUT}/cost-infra.plan-none.json"

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
