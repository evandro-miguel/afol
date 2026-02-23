# Agentic System Update System

Sistema de atualização para o agentic system que permite repositórios puxarem atualizações do upstream sem quebrar dados locais.

## Features

- **Git-based updates**: Puxa atualizações de repositório upstream
- **Preservação de dados**: Nunca toca em dados do usuário (wb/, arc/, lessons/)
- **Backup esqueleto+delta**: Cria backup em z-arq/ com estrutura + arquivos modificados
- **Atomic swap**: Troca de versão de forma atômica (symlink Unix, rename Windows)
- **Three-way merge**: Detecta conflitos entre local e upstream
- **Rollback**: Restaura versão anterior a partir do backup

## Comandos

```bash
# Verificar se há atualizações
./.agents/agents-update check

# Ver o que será modificado
./.agents/agents-update plan
./.agents/agents-update plan --verbose  # Mostrar arquivos inalterados

# Aplicar atualização
./.agents/agents-update apply
./.agents/agents-update apply --dry-run  # Simulação
./.agents/agents-update apply --force    # Sem confirmação

# Rollback para versão anterior
./.agents/agents-update rollback
./.agents/agents-update rollback --to 1.0.0  # Versão específica

# Diagnóstico
./.agents/agents-update doctor
./.agents/agents-update doctor --fix  # Corrigir problemas
```

## Arquitetura

### Componentes

1. **version.py**: Parsing e comparação de versões SemVer
2. **manifest.py**: Manifesto com hashes SHA-256 dos arquivos
3. **lock.py**: Controle de concorrência (lock file)
4. **ownership.py**: Mapa de ownership (system/user/hybrid)
5. **upstream.py**: Fetch do repositório upstream via git
6. **conflict.py**: Detecção de conflitos (three-way merge)
7. **backup.py**: Backup esqueleto + delta
8. **staging.py**: Preparação da nova versão
9. **swap.py**: Atomic swap (Unix symlink, Windows rename)
10. **agents-update.py**: CLI principal

### Fluxo de Update

```
1. Pre-flight (lock, permissões)
2. Download upstream → .cache/upstream/
3. Detecção de conflitos (three-way)
4. Backup esqueleto+delta → z-arq/
5. Staging → versions/v{X.Y.Z}/
6. Atomic swap → current/
7. Validação
8. Cleanup
```

### Preservação de Dados

**NUNCA atualizados:**
- `wb/` - Workbench sessions
- `arc/SPECS/` - Especificações
- `arc/DECISIONS/` - Decisões arquiteturais
- `a-docs/lessons/` - Lições aprendidas
- `data/` - Dados operacionais
- `z-arq/` - Arquivamento

**Atualizáveis:**
- `scripts/` - Scripts Python
- `rules/` - Regras
- `a-docs/templates/` - Templates
- `a-docs/standards/` - Padrões
- `skills/core/` - Skills do sistema

### Estrutura de Backup

```
z-arq/
  YYYYMMDD_HHMMSS_update_{from}_to_{to}/
    backup-index.json           # Índice do backup
    restore-point.json          # Metadados para rollback
    system-manifest-before.json # Estado antes
    skeleton/                   # Estrutura de diretórios
    delta/                      # Arquivos modificados
```

## Configuração

### update-ownership.json

Mapa de ownership definindo quais paths são system vs user:

```json
{
  "ownership_rules": [
    {
      "path": "scripts",
      "type": "system",
      "recursive": true
    },
    {
      "path": "wb",
      "type": "user",
      "recursive": true
    }
  ],
  "default_policy": "user"
}
```

### Upstream

Por padrão usa o **git main deste repositório** como upstream. Não requer configuração - detecta automaticamente o repositório git atual.

## Testes

```bash
# Testar versão
python3 .agents/scripts/agents-update/version.py

# Testar manifest
python3 .agents/scripts/agents-update/manifest.py

# Testar lock
python3 .agents/scripts/agents-update/lock.py

# Testar backup
python3 .agents/scripts/agents-update/backup.py

# Testar swap
python3 .agents/scripts/agents-update/swap.py
```

## Troubleshooting

### Lock stale

Se um update foi interrompido:
```bash
./.agents/agents-update doctor --fix
```

### Verificar integridade

```bash
./.agents/agents-update doctor
```

### Ver plano antes de aplicar

```bash
./.agents/agents-update plan
```

### Rollback manual

```bash
# Ver backups disponíveis
ls -la .agents/z-arq/

# Rollback
./.agents/agents-update rollback
```

## Segurança

- Lock file evita concorrência
- Backup automático antes de qualquer mudança
- Validação pós-swap
- Rollback automático em caso de falha
- Nunca sobrescreve dados do usuário

## Desenvolvimento

Para adicionar novos comandos:

1. Editar `agents-update.py`
2. Adicionar função `cmd_<nome>(args)`
3. Registrar em `commands` dict
4. Adicionar parser em `subparsers`

## Licença

MIT
