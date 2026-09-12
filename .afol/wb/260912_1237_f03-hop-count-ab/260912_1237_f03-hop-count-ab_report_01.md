# Report: 260912_1237_f03-hop-count-ab

## Summary
declared: Slice-1 hop A/B complete. M2-M6 beat M0 mean hops; A-happy stayed at 3. M1 ties M0. Fixtures live in tmp/hop-count-ab. No cli patches.

## Tasks
- T-01: done
- T-02: done
- T-03: done
- T-04: done
- T-05: done
- T-06: done
- T-07: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260912123836482-62705a authorizing: passed (python3 - <<'PY' from pathlib import Path root = Path(".") child = root/".afol/adm/specs/260912_1736_agent-cli-hop-count-ab_spec-child_01.md" test = root/".afol/adm/specs/260912_1736_agent-cli-hop-count-ab_spec-test_01.md" plan = root/".afol/wb/260912_1237_f03-hop-count-ab/260912_1237_f03-hop-count-ab_plan_01.md" assert child.is_file(), "missing spec-child" assert test.is_file(), "missing spec-test" assert plan.is_file(), "missing plan" text = test.read_text() marks = [f"| M{i} " for i in range(7)] missing = [m for m in marks if m not in text] assert not missing, f"missing marks {missing}" assert "Kill-switch" in text, "missing kill-switch" assert "A-happy" in text and "A-dirty" in text print("protocol_ok marks=7 fixtures_named=yes") PY; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260912131341464-11fa1f: failed (test -f .afol/wb/260912_1237_f03-hop-count-ab/oracle/hop-oracle.ts && test -d .afol/wb/260912_1237_f03-hop-count-ab/fixtures/A-happy && test -d .afol/wb/260912_1237_f03-hop-count-ab/fixtures/A-dirty; exit_code=2)
- T-03 attempt=1 evidence_id=E-20260912131341611-1693a8 authorizing: passed (python3 -c "import json,pathlib; p=pathlib.Path(\".afol/wb/260912_1237_f03-hop-count-ab/traces/M0/A-happy.json\"); d=json.loads(p.read_text()); assert d[\"hops\"]==3 and d[\"success\"]"; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260912131341718-888966 authorizing: passed (python3 -c "import json,pathlib; r=pathlib.Path(\".afol/wb/260912_1237_f03-hop-count-ab/traces\"); m2=json.loads((r/\"M2/A-help-flag.json\").read_text()); m0=json.loads((r/\"M0/A-help-flag.json\").read_text()); assert m2[\"hops\"]<m0[\"hops\"]"; exit_code=0)
- T-05 attempt=1 evidence_id=E-20260912131341812-98afa0 authorizing: passed (python3 -c "import json,pathlib; r=pathlib.Path(\".afol/wb/260912_1237_f03-hop-count-ab/traces\"); m3=json.loads((r/\"M3/A-evidence.json\").read_text()); m4=json.loads((r/\"M4/A-compact.json\").read_text()); m0e=json.loads((r/\"M0/A-evidence.json\").read_text()); m0c=json.loads((r/\"M0/A-compact.json\").read_text()); assert m3[\"hops\"]<m0e[\"hops\"] and m4[\"hops\"]<m0c[\"hops\"]"; exit_code=0)
- T-06 attempt=1 evidence_id=E-20260912131341955-6bacb5 authorizing: passed (python3 -c "import json,pathlib; r=pathlib.Path(\".afol/wb/260912_1237_f03-hop-count-ab/traces\"); m5=json.loads((r/\"M5/A-verify.json\").read_text()); m6=json.loads((r/\"M6/A-ls.json\").read_text()); m0v=json.loads((r/\"M0/A-verify.json\").read_text()); m0l=json.loads((r/\"M0/A-ls.json\").read_text()); assert m5[\"hops\"]<m0v[\"hops\"] and m6[\"hops\"]<m0l[\"hops\"]"; exit_code=0)
- T-07 attempt=3 evidence_id=E-20260912131342099-fac9cc authorizing: passed (python3 -c "from pathlib import Path; t=Path(\".afol/wb/260912_1237_f03-hop-count-ab/traces/winner.md\").read_text(); assert \"| M3 |\" in t and \"keep\" in t and \"M1\" in t"; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260912131351036-e0a76c authorizing: passed (test -f .afol/wb/260912_1237_f03-hop-count-ab/oracle/hop-oracle.ts; exit_code=0)
