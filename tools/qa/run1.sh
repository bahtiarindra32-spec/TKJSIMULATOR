#!/bin/bash
# usage: run1.sh script.mjs phase [timeout]
cd /workspace/work/kota-single && (python3 -m http.server 8787 >/dev/null 2>&1 &) ; sleep 1
cd /workspace/work/pw && timeout ${3:-110} node $1 "$2" 2>&1 | tail -c 6000
