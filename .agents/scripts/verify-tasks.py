#!/usr/bin/env python3
"""
Verify all tasks in a session are completed.

This script:
1. Scans a session folder for task files
2. Checks if all tasks are marked with `- [x]`
3. Reports status of each task
4. Returns error if any task is incomplete

Usage:
    python verify-tasks.py <session-folder>
    
Examples:
    python verify-tasks.py .agents/wb/260223_1200_auth-refactor/
    python verify-tasks.py .  # current directory
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple, Dict

# Task status markers
MARKERS = {
    'pending': r'- \[ \]',
    'in_progress': r'- \[/\]',
    'ready_for_test': r'- \[%\]',
    'blocked': r'- \[!\]',
    'skipped': r'- \[>\]',
    'completed': r'- \[x\]',
}

MARKER_TO_STATUS = {
    " ": "pending",
    "/": "in_progress",
    "%": "ready_for_test",
    "!": "blocked",
    ">": "skipped",
    "x": "completed",
}

TASK_LINE_RE = re.compile(r'^\s*-\s\[( |/|%|!|>|x)\]\s+(T-\d{2,3})\s+(.+?)\s*$')


def extract_tasks(content: str, file_path: Path) -> List[Tuple[str, str, str, int]]:
    """
    Extract all tasks from markdown content.
    
    Returns list of (task_id, task_text, marker_type, line_number)
    """
    tasks = []
    lines = content.splitlines()
    in_code_block = False
    
    for line_num, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            continue

        if in_code_block:
            continue

        match = TASK_LINE_RE.match(line)
        if not match:
            continue

        marker_char = match.group(1)
        task_id = match.group(2)
        task_text = match.group(3).strip()
        marker_type = MARKER_TO_STATUS[marker_char]

        if task_text:
            tasks.append((task_id, task_text, marker_type, line_num))
    
    return tasks


def verify_session(session_path: Path) -> Tuple[bool, Dict]:
    """
    Verify all tasks in a session folder are completed.
    
    Returns (all_completed, results_dict)
    """
    results = {
        'session': session_path,
        'task_files': [],
        'open_tasks': [],
        'total_tasks': 0,
        'completed': 0,
        'pending': 0,
        'in_progress': 0,
        'ready_for_test': 0,
        'blocked': 0,
        'skipped': 0,
        'issues': [],
    }
    
    if not session_path.exists():
        results['issues'].append(f"Session folder not found: {session_path}")
        return False, results
    
    # Find all task files (recursive, so .agents/wb/ can be used directly)
    task_files = list(session_path.rglob('*task*.md'))
    
    if not task_files:
        results['issues'].append("No task files found in session")
        return True, results  # No tasks = vacuously true
    
    all_completed = True
    
    for task_file in sorted(task_files):
        file_result = {
            'file': task_file,
            'tasks': [],
            'all_completed': True,
        }
        
        content = task_file.read_text()
        tasks = extract_tasks(content, task_file)
        
        for task_id, task_text, marker_type, line_num in tasks:
            task_info = {
                'id': task_id,
                'description': task_text,
                'status': marker_type,
                'line': line_num,
                'file': task_file,
            }
            file_result['tasks'].append(task_info)
            results['total_tasks'] += 1
            
            if marker_type == 'completed':
                results['completed'] += 1
            elif marker_type == 'pending':
                results['pending'] += 1
                results['open_tasks'].append(task_info)
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'in_progress':
                results['in_progress'] += 1
                results['open_tasks'].append(task_info)
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'ready_for_test':
                results['ready_for_test'] += 1
                results['open_tasks'].append(task_info)
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'blocked':
                results['blocked'] += 1
                results['open_tasks'].append(task_info)
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'skipped':
                results['skipped'] += 1
                # Skipped tasks are user-authorized, don't mark as incomplete
        
        results['task_files'].append(file_result)
    
    return all_completed, results


def print_report(all_completed: bool, results: Dict) -> None:
    """Print verification report."""
    print("=" * 60)
    print(f"Task Verification Report")
    print("=" * 60)
    print(f"Session: {results['session']}")
    print()
    
    # Summary
    print("Summary:")
    print(f"  Total tasks:     {results['total_tasks']}")
    print(f"  Completed:       {results['completed']} ✓")
    if results['skipped'] > 0:
        print(f"  Skipped:         {results['skipped']} ➤")
    if results['pending'] > 0:
        print(f"  Pending:         {results['pending']} ⏳")
    if results['in_progress'] > 0:
        print(f"  In Progress:     {results['in_progress']} 🔄")
    if results['ready_for_test'] > 0:
        print(f"  Ready for test:  {results['ready_for_test']} 🧪")
    if results['blocked'] > 0:
        print(f"  Blocked:         {results['blocked']} ⚠️")
    print()
    
    # Detailed status per file
    print("Task Details:")
    print("-" * 60)
    
    for file_result in results['task_files']:
        print(f"\n📄 {file_result['file'].name}")
        
        if not file_result['tasks']:
            print("   (no tasks found)")
            continue
        
        status_icon = {
            'completed': '✓',
            'skipped': '➤',
            'pending': '⏳',
            'in_progress': '🔄',
            'ready_for_test': '🧪',
            'blocked': '⚠️',
        }
        
        for task in file_result['tasks']:
            icon = status_icon.get(task['status'], '?')
            print(f"   {icon} {task['id']} @ line {task['line']}: {task['description']}")

    if results['open_tasks']:
        print()
        print("Open Tasks:")
        print("-" * 60)
        for task in results['open_tasks']:
            rel = task["file"].relative_to(results["session"])
            print(f"  {task['id']} | {rel}:{task['line']} | {task['status']} | {task['description']}")
    
    print()
    print("=" * 60)
    
    # Final verdict
    if all_completed:
        if results['skipped'] > 0:
            print(f"✅ All tasks completed! ({results['skipped']} skipped by user)")
        else:
            print("✅ All tasks completed!")
    else:
        print("❌ Incomplete tasks found")
        print()
        print("Legend:")
        print("  ✓  completed")
        print("  ➤  skipped (user-authorized)")
        print("  ⏳  pending")
        print("  🔄  in progress")
        print("  🧪  ready for test (not tested yet)")
        print("  ⚠️  blocked (check *-blocks.md file)")
    
    print("=" * 60)
    
    # Issues
    if results['issues']:
        print("\nIssues:")
        for issue in results['issues']:
            print(f"  ⚠️  {issue}")


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        session_path = Path.cwd()
    else:
        session_path = Path(sys.argv[1])
    
    all_completed, results = verify_session(session_path)
    print_report(all_completed, results)
    
    # Exit with error if tasks incomplete
    sys.exit(0 if all_completed else 1)


if __name__ == "__main__":
    main()
