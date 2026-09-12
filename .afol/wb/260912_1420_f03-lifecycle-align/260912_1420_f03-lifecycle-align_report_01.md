# Report: 260912_1420_f03-lifecycle-align

## Summary
declared: Lifecycle alignment: n/st/d emit next hints; qt/d reject true; journeys and skills teach d -x. Getting-started multi-task uses ranges.

## Tasks
- T-01: done
- T-02: done
- T-03: done
- T-04: done
- T-05: done

## Evidence
- T-04 attempt=1 evidence_id=E-20260912142323533-bfc95b: failed (python3 -c "from pathlib import Path p=Path(\".agents/skills/afol-integration-test/SKILL.md\").read_text() start=p.index(\"For a staged or multi-task fixture\") end=p.index(\"Repeat\") chunk=p[start:end] assert \"<afol-dev> e \" not in chunk assert \"\`st\`, \`e\`, \`d\`\" not in p assert \"st\`, \`e\`, \`d\`, and \`c\`\" not in p assert \"<afol-dev> d T-01 -x\" in chunk assert \"## How to test lifecycle\" in p assert \"echo hop-ok\" in p assert \"src/project-template/.afol/config.json\" in p assert \"mktemp\" in p assert \"afol st T-01\" in p assert \"afol d T-01 -x\" in p assert \"shell no-op\" in p assert \"State Board\" in p assert \"Omit \`-S\`\" in p r=Path(\".agents/skills/afol-rules/SKILL.md\").read_text() assert \"start/evidence/done/close\" not in r assert \"afol d -x\" in r print(\"hop-ok\")"; exit_code=1)
- T-04 attempt=1 evidence_id=E-20260912142411240-90a6e5 authorizing: passed (python3 tmp/t04-skill-check.py; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260912142708368-6aa6cc: passed (test -f .afol/adm/ux/260912_governed-lifecycle_ux-journey.md; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260912142708387-6c56ca: passed (test -f .afol/adm/ux/260912_micro-qt_ux-journey.md; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260912142708397-dd51ee: passed (rg --files-without-match -F "afol evidence --session" src/project-template/docs/templates/AGENTS_TEMPLATE.md; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260912142708407-696529: passed (rg --files-without-match -F "afol done --session" src/project-template/docs/templates/AGENTS_TEMPLATE.md; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260912142708419-eed977 authorizing: passed (rg -F "afol d T-01 -x" src/project-template/docs/templates/AGENTS_TEMPLATE.md; exit_code=0)
- T-01 attempt=1 evidence_id=E-20260912143025017-3a44bb authorizing: passed (bun test cli/tests/hop-residue-economy.test.ts cli/tests/workbench-hints.test.ts cli/tests/workbench-args.test.ts cli/tests/quick-task-command.test.ts; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260912143025024-5ef04f authorizing: passed (bun test cli/tests/hop-residue-economy.test.ts cli/tests/workbench-hints.test.ts cli/tests/workbench-args.test.ts cli/tests/quick-task-command.test.ts; exit_code=0)
- T-05 attempt=1 evidence_id=E-20260912143652062-f86ca3 authorizing: passed (bun -e 'const fs=require("node:fs"); const journeys=[".afol/adm/ux/260912_governed-lifecycle_ux-journey.md",".afol/adm/ux/260912_micro-qt_ux-journey.md"]; for (const p of journeys) { if (!fs.existsSync(p)) { console.error("missing "+p); process.exit(1); } } const g=fs.readFileSync(journeys[0],"utf8"); const q=fs.readFileSync(journeys[1],"utf8"); const t=fs.readFileSync("src/project-template/docs/templates/AGENTS_TEMPLATE.md","utf8"); if (!g.includes("afol st T-01") || !g.includes("afol d T-01 -x") || !g.includes("afol c")) { console.error("governed journey missing st/d/c"); process.exit(1); } if (!q.includes("afol qt")) { console.error("qt journey missing qt"); process.exit(1); } if (!t.includes("afol d T-01 -x") || !t.includes("afol qt") || !t.includes("Do not require evidence then done as two hops")) { console.error("AGENTS_TEMPLATE missing fast path"); process.exit(1); } const i=t.indexOf("Canonical path"); const j=t.indexOf("Micro one-shot"); const hop=i>=0&&j>i?t.slice(i,j):t; if (/\bafol e\b/.test(hop) || /afol evidence/.test(hop)) { console.error("AGENTS_TEMPLATE happy path still requires e"); process.exit(1); } console.log("t05-align-ok");'; exit_code=0)
