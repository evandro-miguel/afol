#!/usr/bin/env python3
"""Translate Portuguese documentation to English."""

import os
import re

# Common Portuguese to English translations
translations = {
    'Visão Geral': 'Overview',
    'Função': 'Function',
    'Propósito': 'Purpose',
    'Configuração': 'Configuration',
    'Como Configurar': 'How to Configure',
    'Como Usar': 'How to Use',
    'Como Modificar': 'How to Modify',
    'Como Testar': 'How to Test',
    'Exemplos de Uso': 'Usage Examples',
    'Padrão de Documentação': 'Documentation Standard',
    'Arquitetura': 'Architecture',
    'Fluxo': 'Flow',
    'Métricas': 'Metrics',
    'Saúde': 'Health',
    'Mudança': 'Change',
    'Catálogo': 'Catalog',
    'ferramentas': 'tools',
    'ferramenta': 'tool',
    'Arquivos': 'Files',
    'Diretório': 'Directory',
    'Pastas': 'Folders',
    'Cria': 'Creates',
    'Criação': 'Creation',
    'Valida': 'Validates',
    'Validação': 'Validation',
    'Verifica': 'Checks',
    'Verificação': 'Verification',
    'Atualiza': 'Updates',
    'Atualização': 'Update',
    'Sincronização': 'Synchronization',
    'Documentação': 'Documentation',
    'Indexação': 'Indexing',
    'Mapeamento': 'Mapping',
    'Automação': 'Automation',
    'Infraestrutura': 'Infrastructure',
    'Biblioteca': 'Library',
    'disponível': 'available',
    'obrigatório': 'required',
    'opcional': 'optional',
    'padrão': 'default',
    'principal': 'main',
    'principais': 'main',
    'tarefa': 'task',
    'tarefas': 'tasks',
    'sessão': 'session',
    'sessões': 'sessions',
    'erro': 'error',
    'erros': 'errors',
    'sucesso': 'success',
    'falha': 'failure',
    'quando': 'when',
    'antes': 'before',
    'depois': 'after',
    'após': 'after',
}

def translate_file(filepath):
    """Translate a file from Portuguese to English."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        
        for pt, en in sorted(translations.items(), key=lambda x: -len(x[0])):
            content = re.sub(
                r'\b' + re.escape(pt) + r'\b',
                en,
                content,
                flags=re.IGNORECASE
            )
        
        if original != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f'Error processing {filepath}: {e}')
        return False

if __name__ == '__main__':
    files_to_translate = [
        '.agents/a-docs/templates/task.md',
        '.agents/a-docs/agentic/agents-doctor.md',
        '.agents/a-docs/agentic/agents-config.md',
        '.agents/a-docs/agentic/agents-index.md',
        '.agents/a-docs/agentic/sync-agent-docs.md',
        '.agents/a-docs/agentic/verify-tasks.md',
        '.agents/a-docs/agentic/agents-new.md',
        '.agents/a-docs/agentic/tools-json.md',
        '.agents/a-docs/agentic/agents-lint-docs.md',
        '.agents/a-docs/agentic/agents-structure-map.md',
        '.agents/a-docs/agentic/agents-bootstrap.md',
        '.agents/a-docs/agentic/agents-wb-update.md',
        '.agents/a-docs/agentic/agents-tools.md',
        '.agents/a-docs/agentic/makefile.md',
        '.agents/a-docs/agentic/agents-wrapper.md',
    ]
    
    translated = 0
    for filepath in files_to_translate:
        if os.path.exists(filepath):
            if translate_file(filepath):
                translated += 1
                print(f'Translated: {filepath}')
            else:
                print(f'No changes: {filepath}')
        else:
            print(f'Not found: {filepath}')
    
    print(f'\nTotal translated: {translated}/{len(files_to_translate)}')
