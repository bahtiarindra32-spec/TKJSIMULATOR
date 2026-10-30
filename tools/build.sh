#!/bin/bash
set -e
cd /workspace/projects/b057e655-c0c1-4cdc-b187-cf16e7554199/kota-nusantara
export KN_BUILD=${KN_BUILD:-$(TZ=Asia/Jakarta date +%Y%m%d%H%M)}
npx tsc --noEmit
npx vite build >/tmp/vb1.log 2>&1 || { cat /tmp/vb1.log; exit 1; }
npx vite build -c vite.single.config.ts >/tmp/vb2.log 2>&1 || { cat /tmp/vb2.log; exit 1; }
python3 /workspace/work/make_single.py
cp public/* /workspace/work/kota-single/
echo "{\"build\":\"$KN_BUILD\"}" > /workspace/work/kota-single/version.json
echo "{\"build\":\"$KN_BUILD\"}" > public/version.json
echo BUILD=$KN_BUILD
