# Phase 05 — Reproducible data stories (F2)

```text
Implement NSIDC and PANGAEA variable schemas using observed file headers/provider
documentation. Parse preambles, duplicate column labels, nulls and missing-value
flags correctly. Preserve source row keys, units, hemisphere and product version.
PANGAEA.885208 includes concentration in tenths: never treat it as an unlabelled
percentage. Do not assume every numeric-looking categorical code is a measurement.

Build period/region/variable selectors, deterministic calculations, chart + table,
saved recipe, selected-row CSV export and generated explanation from results.
Use monthly source products for the long-term sea-ice trend workflow. Do not compute
unsupported trends from a tiny local observational dataset or infer causation.

Validate calculations against independent SQL/manual calculations on known subsets,
including unit conversions and missing values. Keep full precision internally and
declare display rounding. Make numerical statements link to calculation IDs.

Gate: two datasets produce real usable visualizations, exported recipes reproduce
displayed results, and no LLM-generated numeric values enter the chart data. Commit.
```
