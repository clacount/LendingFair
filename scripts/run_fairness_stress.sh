#!/usr/bin/env bash
set -euo pipefail

# FairLending stress harness entrypoint.
#
# Usage:
#   ./scripts/run_fairness_stress.sh <duration_minutes> [options]
#   ./scripts/run_fairness_stress.sh --replay <case.json> [--output <dir>]
#
# Examples:
#   ./scripts/run_fairness_stress.sh 30
#   ./scripts/run_fairness_stress.sh 15 --engine officer_lane --output stress_runs/run_001
#   ./scripts/run_fairness_stress.sh 10 --max-iterations 500 --seed-start 9000 --max-cases 100
#   ./scripts/run_fairness_stress.sh --replay stress_runs/20260423T120000Z/cases/9012_global.json
#
# Options:
#   --max-iterations <n>  Stop after n iterations even if time remains.
#   --seed-start <n>      First deterministic seed to use (default: 1).
#   --output <dir>        Output directory (default: stress_runs/<timestamp>).
#   --engine <mode>       global | officer_lane | both (default: both).
#   --max-cases <n>       Stop after capturing n failure/suspicious cases.
#   --replay <case.json>  Replay a single captured scenario case JSON.
#   -h, --help            Show this help text.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/fairness_stress_runner.js"

if [[ ! -f "$RUNNER" ]]; then
  echo "Runner not found: $RUNNER" >&2
  exit 1
fi

show_help() {
  sed -n '1,120p' "$0" | sed -n '1,32p' | sed 's/^# \{0,1\}//'
}

DURATION_MINUTES=""
MAX_ITERATIONS=""
SEED_START="1"
OUTPUT_DIR=""
ENGINE="both"
MAX_CASES=""
REPLAY_CASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      show_help
      exit 0
      ;;
    --max-iterations)
      MAX_ITERATIONS="${2:-}"
      shift 2
      ;;
    --seed-start)
      SEED_START="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --engine)
      ENGINE="${2:-}"
      shift 2
      ;;
    --max-cases)
      MAX_CASES="${2:-}"
      shift 2
      ;;
    --replay)
      REPLAY_CASE="${2:-}"
      shift 2
      ;;
    --*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$DURATION_MINUTES" ]]; then
        DURATION_MINUTES="$1"
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -n "$REPLAY_CASE" ]]; then
  if [[ ! -f "$REPLAY_CASE" ]]; then
    echo "Replay case file not found: $REPLAY_CASE" >&2
    exit 1
  fi
else
  if [[ -z "$DURATION_MINUTES" ]]; then
    echo "Duration in minutes is required unless --replay is used." >&2
    echo "Try: ./scripts/run_fairness_stress.sh 15" >&2
    exit 1
  fi
fi

mkdir -p "$ROOT_DIR/stress_runs"
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$ROOT_DIR/stress_runs/$(date -u +%Y%m%dT%H%M%SZ)"
fi
mkdir -p "$OUTPUT_DIR"

CMD=(node "$RUNNER" --output "$OUTPUT_DIR" --engine "$ENGINE" --seed-start "$SEED_START")

if [[ -n "$REPLAY_CASE" ]]; then
  CMD+=(--replay "$REPLAY_CASE")
else
  CMD+=(--duration-minutes "$DURATION_MINUTES")
fi

if [[ -n "$MAX_ITERATIONS" ]]; then
  CMD+=(--max-iterations "$MAX_ITERATIONS")
fi
if [[ -n "$MAX_CASES" ]]; then
  CMD+=(--max-cases "$MAX_CASES")
fi

echo "Running FairLending stress harness..."
echo "Output directory: $OUTPUT_DIR"
"${CMD[@]}"
