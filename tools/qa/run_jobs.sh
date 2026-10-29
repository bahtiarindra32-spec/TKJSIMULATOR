cd /workspace/work/kota-single && (python3 -m http.server 8787 >/dev/null 2>&1 &) ; sleep 1
cd /workspace/work/pw && timeout 1100 node qa_jobs.mjs "$1"
