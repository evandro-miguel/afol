#!/usr/bin/env python3
"""
Update the lint validator to recognize new doc_types.

This script reads all markdown files, extracts unique doc_type values,
and updates the validator's allowed list.

Usage:
    python fix-lint-doctypes.py [--dry-run]
"""

import argparse
import re
import sys
from pathlib import Path


def extract_doc_types(base_dir: Path) -> set[str]:
    """Extract all unique doc_type values from markdown files."""
    doc_types = set()
    
    for md_file in base_dir.rglob('*.md'):
        # Skip certain directories
        if any(skip in str(md_file) for skip in ['.venv', 'node_modules', '.git']):
            continue
        
        try:
            content = md_file.read_text(encoding='utf-8')
            
            # Look for doc_type in frontmatter
            if content.strip().startswith('---'):
                match = re.search(r'^---\s*\n.*?doc_type:\s*(\S+)\s*\n', content, re.DOTALL)
                if match:
                    doc_type = match.group(1).strip().strip("'\"")
                    doc_types.add(doc_type)
        except Exception:
            pass
    
    return doc_types


def find_validator_script(base_dir: Path) -> Path | None:
    """Find the lint validator script."""
    # Common locations for validator
    candidates = [
        base_dir / 'scripts' / 'agents-lint-docs.py',
        base_dir / 'a-docs' / 'standards' / 'lint-validator.py',
    ]
    
    for candidate in candidates:
        if candidate.exists():
            return candidate
    
    return None


def update_validator(validator_path: Path, new_doc_types: set[str], dry_run: bool = False) -> dict:
    """Update the validator's allowed doc_types list."""
    result = {
        'file': str(validator_path),
        'updated': False,
        'added_types': [],
        'error': None
    }
    
    try:
        content = validator_path.read_text(encoding='utf-8')
        
        # Find the allowed doc_types list pattern
        # Looking for pattern like: doc_type: '...'. Valid: type1, type2, ...
        # Or a Python list definition
        list_pattern = r"(Valid:\s*)([a-z_]+(?:,\s*[a-z_]+)*)"
        match = re.search(list_pattern, content)
        
        if not match:
            # Try Python list pattern
            list_pattern = r"(['\"]doc_type['\"].*?Valid:\s*)(\[.*?\])"
            match = re.search(list_pattern, content, re.DOTALL)
        
        if match:
            # Parse existing types
            existing_str = match.group(2) if match.lastindex >= 2 else match.group(1)
            
            # Extract individual types
            if existing_str.startswith('['):
                existing_types = set(re.findall(r"['\"]([a-z_]+)['\"]", existing_str))
            else:
                existing_types = set(t.strip() for t in existing_str.split(','))
            
            # Find new types to add
            types_to_add = new_doc_types - existing_types
            
            if types_to_add:
                result['added_types'] = sorted(types_to_add)
                
                # Create new list
                all_types = sorted(existing_types | types_to_add)
                
                # Format as comma-separated list
                new_list = ', '.join(all_types)
                
                # Replace in content
                if existing_str.startswith('['):
                    new_content = content.replace(existing_str, str(all_types))
                else:
                    new_content = content.replace(match.group(2), new_list)
                
                if not dry_run:
                    validator_path.write_text(new_content, encoding='utf-8')
                
                result['updated'] = True
        else:
            result['error'] = 'Could not find doc_type validation list'
    
    except Exception as e:
        result['error'] = str(e)
    
    return result


def main():
    parser = argparse.ArgumentParser(
        description='Update lint validator to recognize new doc_types found in markdown files'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be updated without modifying files'
    )
    parser.add_argument(
        '--base-dir',
        default='.agents',
        help='Base directory to scan (default: .agents)'
    )
    
    args = parser.parse_args()
    
    base_dir = Path(args.base_dir)
    
    if not base_dir.exists():
        print(f"Error: Directory {base_dir} does not exist.")
        return 1
    
    print(f"Scanning {base_dir} for doc_type values...")
    doc_types = extract_doc_types(base_dir)
    print(f"Found {len(doc_types)} unique doc_type values:\n")
    
    for dt in sorted(doc_types):
        print(f"  - {dt}")
    
    print(f"\n{'='*60}")
    print("Looking for validator script...")
    
    validator_path = find_validator_script(base_dir)
    
    if not validator_path:
        print("Could not find validator script.")
        print("Searched in:")
        print("  - .agents/scripts/agents-lint-docs.py")
        print("  - .agents/a-docs/standards/lint-validator.py")
        return 1
    
    print(f"Found: {validator_path}")
    
    result = update_validator(validator_path, doc_types, dry_run=args.dry_run)
    
    if result['error']:
        print(f"\n✗ Error: {result['error']}")
        return 1
    
    if result['updated']:
        action = "Would add" if args.dry_run else "Added"
        print(f"\n✓ {action} {len(result['added_types'])} new doc_type(s):")
        for dt in result['added_types']:
            print(f"    + {dt}")
    else:
        print("\n⊘ All doc_types already recognized by validator.")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
