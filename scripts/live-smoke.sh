#!/usr/bin/env bash
# Live smoke test: status code + a content marker per route. Exits non-zero on any failure.
set -u
BASE="${1:-https://polarpramaan-sih26063.vercel.app}"
fail=0
check() {
  local path="$1" code="$2" marker="$3"
  local out status
  out=$(curl -sS -L --max-time 60 -w '\n__STATUS__%{http_code}' "$BASE$path")
  status="${out##*__STATUS__}"
  if [ "$status" != "$code" ] || ! grep -q -- "$marker" <<<"$out"; then
    echo "FAIL $path status=$status (want $code) marker='$marker'"; fail=1
  else
    echo "OK   $path $status '$marker'"
  fi
}
check / 200 "What is in the catalog now"
check / 200 "Read-only preview"
check "/explore?india=1" 200 "Maitri"
check "/explore?view=map" 200 "Antarctic (South Pole centre)"
check /explore/expedition 200 "AGULII"
check "/ask?q=What+was+the+Arctic+sea+ice+extent+in+September+2012%3F" 200 "3.57"
check "/ask?q=What+is+the+population+of+Mumbai%3F" 200 "Insufficient evidence"
check /data-stories 200 "N-monthly-extent"
check "/check?s=Arctic+sea+ice+reaches+its+minimum+in+March." 200 "contradicted"
check /classroom/antarctic-february-story 200 "Antarctic sea ice"
check /classroom/arctic-september-minimum/teacher 200 "Answer key"
check /offline/india-in-antarctica 200 "Pocket Polar Museum"
check /offline/india-in-antarctica/exhibit?v=1 200 "Pocket Polar Museum"
check /sources 200 "Snapshot provenance"
check /about 200 "pglite-snapshot"
check /feed.xml 200 "<rss"
check /workspace/login 200 "Not available in the read-only preview"
check /sw.js 200 "pp-pack-"
# security headers
hdr=$(curl -sSI --max-time 30 "$BASE/")
for h in "content-security-policy" "x-frame-options: DENY" "x-content-type-options: nosniff"; do
  if grep -qi -- "$h" <<<"$hdr"; then echo "OK   header $h"; else echo "FAIL header $h"; fail=1; fi
done
# a record page and its evidence anchor
rec=$(curl -sS --max-time 60 "$BASE/explore?q=Maitri" | grep -o '/records/[0-9a-f-]\{36\}' | head -1)
check "$rec" 200 "Rights and permitted uses"
# calculation export CSV from the first NSIDC series
sv=$(curl -sS --max-time 60 "$BASE/data-stories" | grep -o 'sv=[0-9a-f-]\{36\}&amp;series=N-monthly-extent' | head -1 | sed 's/sv=//;s/&amp;.*//')
recipe=$(python3 -c "import json,urllib.parse;print(urllib.parse.quote(json.dumps({'seriesKey':'N-monthly-extent','sourceVersionId':'$sv','month':9,'periodStart':'1979-01-01','periodEnd':'2100-12-31','stats':['mean','trend']})))")
check "/api/calc/export?format=csv&recipe=$recipe" 200 "2012-09"
echo "checked at $(date -u +%FT%TZ) against $BASE"
exit $fail
