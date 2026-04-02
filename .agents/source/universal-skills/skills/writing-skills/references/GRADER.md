---
description: Grader integration guide for verifying writing-skills workflow adherence
metadata:
  tags: "writing-skills, grader, evaluation, integration"
---

# Grader Integration Guide

Como integrar o grader para verificar se agentes estão lendo os arquivos corretos da skill.

## Visão Geral

O grader verifica:
1. ✅ **File Reading** - Quais arquivos o agente leu
2. ✅ **Workflow Following** - Se seguiu os passos do workflow
3. ✅ **Script Usage** - Se usou os scripts bundlados
4. ✅ **Output Structure** - Se criou a estrutura correta
5. ✅ **Progressive Disclosure** - Se leu só o necessário (não tudo de uma vez)

## Uso Básico

```bash
# Rodar grader em um transcript
python scripts/run_grader.py \
  --transcript evals/transcripts/eval_1.txt \
  --eval-item '{"expectations": ["Agent reads SKILL.md", "Agent uses create-skill.js"]}' \
  --skill-path skills/writing-skills \
  --tier 2 \
  --output evals/grader/grading_1.json
```

## Uso com run_eval.py

```bash
# Eval com expectativas + grader automático
python scripts/run_eval.py \
  --eval-set evals/evals-example.json \
  --skill-path skills/writing-skills/SKILL.md \
  --cli-tool opencode \
  --tier 2 \
  --output evals/grading.json
```

Output inclui:
```json
{
  "results": [...],  // Trigger results
  "grader_results": [
    {
      "expectations": [
        {"text": "Agent reads SKILL.md", "passed": true, "evidence": "..."},
        {"text": "Agent uses create-skill.js", "passed": false, "evidence": "..."}
      ],
      "summary": {"pass_rate": 0.75},
      "file_reads": ["SKILL.md", "standards/README.md"],
      "progressive_disclosure": {"respected": true}
    }
  ]
}
```

## Definir Expectativas

No `evals.json`, adicione `expectations` em cada eval:

```json
{
  "evals": [
    {
      "id": 1,
      "prompt": "Create a tier-2 skill",
      "should_trigger": true,
      "expectations": [
        "The agent reads SKILL.md first",
        "The agent checks references/standards/README.md",
        "The agent uses create-skill.js --tier 2",
        "The output has references/ directory"
      ]
    }
  ]
}
```

## Categorias de Expectativas

O grader reconhece automaticamente:

| Categoria | Keywords | Verificação |
|-----------|----------|-------------|
| **file_reading** | "read", "file", "reference" | Detecta arquivos lidos no transcript |
| **workflow** | "workflow", "step", "first", "then" | Detecta passos numerados/sequência |
| **script_usage** | "script", "bun", "create-skill" | Detecta invocação de scripts |
| **output_structure** | "structure", "tier", "output" | Detecta criação de arquivos |
| **progressive_disclosure** | "progressive", "disclosure" | Verifica se não leu >10 arquivos |

## Tier-Specific Checks

### Tier 1
- Deve ler **apenas** SKILL.md (e talvez examples.md)
- Erro: Ler arquivos desnecessários

### Tier 2
- Deve ler SKILL.md primeiro
- Pode ler referências específicas sob demanda

### Tier 3
- Deve ler SKILL.md primeiro
- Pode ler arquivos do produto relevante

## Output do Grader

```json
{
  "expectations": [
    {
      "text": "The agent reads SKILL.md first",
      "passed": true,
      "evidence": "Agent read standards files: ['SKILL.md']",
      "category": "file_reading"
    }
  ],
  "summary": {
    "passed": 4,
    "failed": 1,
    "total": 5,
    "pass_rate": 0.8
  },
  "file_reads": ["SKILL.md", "standards/README.md"],
  "tools_used": [{"type": "script", "name": "create-skill.js"}],
  "progressive_disclosure": {
    "respected": true,
    "issues": [],
    "read_count": 2
  },
  "tier": 2
}
```

## Combined Score (run_loop.py)

O `run_loop.py` usa **combined score**:

```
combined = (trigger_score * 0.5) + (grader_score * 0.5)
```

Isso garante que:
- Skill trigger corretamente (50%)
- Agente use a skill corretamente (50%)

## Exemplo: Loop de Melhoria com Grader

```bash
# Loop completo com grader
python scripts/run_loop.py \
  --eval-set evals/evals-example.json \
  --skill-path skills/writing-skills/SKILL.md \
  --max-iterations 10 \
  --holdout 0.4 \
  --cli-tool opencode

# Output:
# === Iteration 1/10 ===
# Train score: 65.00% (trigger + grader combined)
# Test score: 60.00%
# Attempting to improve description...
```

## Debugging

### Ver transcripts
```bash
ls evals/transcripts/
cat evals/transcripts/eval_1.txt
```

### Ver grading detalhado
```bash
cat evals/grader/grading_eval_1.json | jq
```

### Rodar grader manualmente
```bash
python scripts/run_grader.py \
  --transcript evals/transcripts/eval_1.txt \
  --eval-item evals/eval-item-1.json \
  --skill-path skills/writing-skills \
  --tier 2
```
