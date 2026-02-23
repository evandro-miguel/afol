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


def extract_tasks(content: str, file_path: Path) -> List[Tuple[str, str, int]]:
    """
    Extract all tasks from markdown content.
    
    Returns list of (task_text, marker_type, line_number)
    """
    tasks = []
    lines = content.splitlines()
    
    for line_num, line in enumerate(lines, 1):
        # Skip code blocks
        if line.strip().startswith('```'):
            continue
            
        for marker_type, pattern in MARKERS.items():
            match = re.search(pattern, line)
            if match:
                # Extract task description (after the marker)
                task_text = re.sub(r'- \[.[^\]]*\]\s*', '', line).strip()
                if task_text and not task_text.startswith('#'):
                    tasks.append((task_text, marker_type, line_num))
                break
    
    return tasks


def verify_session(session_path: Path) -> Tuple[bool, Dict]:
    """
    Verify all tasks in a session folder are completed.
    
    Returns (all_completed, results_dict)
    """
    results = {
        'session': session_path,
        'task_files': [],
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
    
    # Find all task files
    task_files = list(session_path.glob('*task*.md'))
    
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
        
        for task_text, marker_type, line_num in tasks:
            task_info = {
                'description': task_text,
                'status': marker_type,
                'line': line_num,
            }
            file_result['tasks'].append(task_info)
            results['total_tasks'] += 1
            
            if marker_type == 'completed':
                results['completed'] += 1
            elif marker_type == 'pending':
                results['pending'] += 1
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'in_progress':
                results['in_progress'] += 1
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'ready_for_test':
                results['ready_for_test'] += 1
                all_completed = False
                file_result['all_completed'] = False
            elif marker_type == 'blocked':
                results['blocked'] += 1
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
            print(f"   {icon} Line {task['line']}: {task['description']}")
    
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
