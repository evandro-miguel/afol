#!/bin/bash
#===============================================================================
# sync-skill.sh - Sincroniza skills entre OpenCode e Antigravity
# 
# Uso: 
#   ./sync-skill.sh <skill-name>           # Copia do OpenCode para Antigravity
#   ./sync-skill.sh <skill-name> --reverse # Copia do Antigravity para OpenCode
#   ./sync-skill.sh <skill-name> --both    # Sync bidirecional (mais recente prevalece)
#   ./sync-skill.sh --list                 # Lista skills disponiveis
#
# Parametros:
#   skill-name    Nome da skill para sincronizar
#   --reverse     Inverte a direcao (Antigravity -> OpenCode)
#   --both        Sync bidirecional
#   --list        Lista todas as skills do OpenCode
#   --dry-run     Mostra o que seria feito sem executar
#
# Variaveis de ambiente:
#   OPENCODE_SKILLS_DIR  - Diretorio de skills do OpenCode (default: ~/.config/opencode/skills)
#   ANTIGRAVITY_DIR      - Diretorio de skills do Antigravity
#
# Exemplo:
#   ./sync-skill.sh electron-dev
#   ./sync-skill.sh electron-dev --reverse
#   ./sync-skill.sh --list
#===============================================================================

set -e

# Configuracoes padrao
OPENCODE_SKILLS_DIR="${OPENCODE_SKILLS_DIR:-$HOME/.config/opencode/skills}"
ANTIGRAVITY_DIR="${ANTIGRAVITY_DIR:-/mnt/c/Users/evand/.gemini/antigravity/skills}"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funcoes
usage() {
    echo "Uso: $0 <skill-name> [opcoes]"
    echo ""
    echo "Opcoes:"
    echo "  --reverse     Copia do Antigravity para OpenCode (inverte direcao)"
    echo "  --both        Sync bidirecional (mais recente prevalece)"
    echo "  --list        Lista skills disponiveis"
    echo "  --dry-run     Mostra o que seria feito sem executar"
    echo "  -h, --help   Mostra esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 electron-dev"
    echo "  $0 electron-dev --reverse"
    echo "  $0 --list"
    exit 1
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

list_skills() {
    log_info "Skills disponiveis no OpenCode:"
    echo ""
    for dir in "$OPENCODE_SKILLS_DIR"/*/; do
        if [ -d "$dir" ]; then
            skill_name=$(basename "$dir")
            if [ -f "$dir/SKILL.md" ]; then
                echo "  - $skill_name"
            fi
        fi
    done
    echo ""
    log_info "Skills no Antigravity:"
    echo ""
    for dir in "$ANTIGRAVITY_DIR"/*/; do
        if [ -d "$dir" ]; then
            skill_name=$(basename "$dir")
            if [ -f "$dir/SKILL.md" ]; then
                echo "  - $skill_name"
            fi
        fi
    done
}

get_dir_modified_time() {
    local dir="$1"
    if [ -d "$dir" ]; then
        find "$dir" -type f -name "*.md" -exec stat --format='%Y' {} \; 2>/dev/null | sort -rn | head -1
    else
        echo "0"
    fi
}

copy_skill() {
    local skill_name="$1"
    local source="$2"
    local dest="$3"
    local dry_run="$4"
    
    local source_path="$source/$skill_name"
    local dest_path="$dest/$skill_name"
    
    if [ ! -d "$source_path" ]; then
        log_error "Skill '$skill_name' nao encontrada em $source_path"
        return 1
    fi
    
    if [ "$dry_run" = "true" ]; then
        log_info "[DRY RUN] Copiaria '$skill_name' de '$source' para '$dest'"
        return 0
    fi
    
    # Criar diretorio destino se nao existir
    if [ ! -d "$dest" ]; then
        log_info "Criando diretorio: $dest"
        mkdir -p "$dest"
    fi
    
    # Remover destino existente
    if [ -d "$dest_path" ]; then
        log_warn "Removendo skill existente em: $dest_path"
        rm -rf "$dest_path"
    fi
    
    # Copiar
    log_info "Copiando '$skill_name' de '$source' para '$dest'"
    cp -r "$source_path" "$dest_path"
    
    if [ $? -eq 0 ]; then
        log_success "Skill '$skill_name' sincronizada com sucesso!"
    else
        log_error "Falha ao copiar skill '$skill_name'"
        return 1
    fi
}

sync_bidirectional() {
    local skill_name="$1"
    local dry_run="$2"
    
    local opencode_path="$OPENCODE_SKILLS_DIR/$skill_name"
    local antigravity_path="$ANTIGRAVITY_DIR/$skill_name"
    
    if [ ! -d "$opencode_path" ] && [ ! -d "$antigravity_path" ]; then
        log_error "Skill '$skill_name' nao encontrada em nenhum repositorio"
        return 1
    fi
    
    # Comparar datas de modificacao
    local opencode_time=$(get_dir_modified_time "$opencode_path")
    local antigravity_time=$(get_dir_modified_time "$antigravity_path")
    
    if [ "$opencode_time" -gt "$antigravity_time" ]; then
        log_info "OpenCode mais recente. Copiando para Antigravity..."
        copy_skill "$skill_name" "$OPENCODE_SKILLS_DIR" "$ANTIGRAVITY_DIR" "$dry_run"
    elif [ "$antigravity_time" -gt "$opencode_time" ]; then
        log_info "Antigravity mais recente. Copiando para OpenCode..."
        copy_skill "$skill_name" "$ANTIGRAVITY_DIR" "$OPENCODE_SKILLS_DIR" "$dry_run"
    else
        log_info "Skills ja estao sincronizadas (mesma data)"
    fi
}

# Parse argumentos
DRY_RUN="false"
REVERSE="false"
BOTH="false"
LIST="false"
SKILL_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --reverse)
            REVERSE="true"
            shift
            ;;
        --both)
            BOTH="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --list|-l)
            LIST="true"
            shift
            ;;
        --help|-h)
            usage
            ;;
        -*)
            log_error "Opcao desconhecida: $1"
            usage
            ;;
        *)
            SKILL_NAME="$1"
            shift
            ;;
    esac
done

# Executar acoes
if [ "$LIST" = "true" ]; then
    list_skills
    exit 0
fi

if [ -z "$SKILL_NAME" ]; then
    log_error "Nome da skill e obrigatorio. Use --list para ver disponiveis."
    usage
fi

if [ "$BOTH" = "true" ]; then
    sync_bidirectional "$SKILL_NAME" "$DRY_RUN"
elif [ "$REVERSE" = "true" ]; then
    copy_skill "$SKILL_NAME" "$ANTIGRAVITY_DIR" "$OPENCODE_SKILLS_DIR" "$DRY_RUN"
else
    copy_skill "$SKILL_NAME" "$OPENCODE_SKILLS_DIR" "$ANTIGRAVITY_DIR" "$DRY_RUN"
fi
