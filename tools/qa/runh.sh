#!/bin/bash
# usage: runh.sh script.mjs phase [timeout] [outfile]  (full output to file, no truncation)
cd /workspace/work/kota-single && (python3 -m http.server 8787 >/dev/null 2>&1 &) ; sleep 1
cd /workspace/work/pw && timeout ${3:-110} node $1 "$2" > ${4:-/tmp/qa_out.txt} 2>&1; echo exit=$?
