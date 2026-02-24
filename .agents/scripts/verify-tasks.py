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

Strict Mode (--strict):
    Enables evidence-backed verification:
    - Tasks marked done must have evidence references
    - Report contradictions are detected
    - Timeline/frontmatter temporal inconsistencies are flagged
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple, Dict, Any
from datetime import datetime, timedelta, timezone

try:
    import yaml
except ImportError:
    yaml = None

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

# Evidence patterns for strict mode
EVIDENCE_PATTERNS = {
    'command': re.compile(r'```(?:bash|shell|console|python|text)?\s*.*?```', re.DOTALL | re.IGNORECASE),
    'result': re.compile(r'\b(?:result|output|response|status)\s*[:\-=]\s*\S+', re.IGNORECASE),
    'artifact': re.compile(r'\b(?:artifact|file|evidence|proof)\s*[:\-=]\s*\S+\.(?:md|json|txt|log|py)', re.IGNORECASE),
    'verification': re.compile(r'\b(?:verified|validated|confirmed|tested|passed|success|successful)\b', re.IGNORECASE),
}

# Contradiction phrases for report analysis
CONTRADICTION_PHRASES = {
    'all_completed': re.compile(r'\ball\b.*?\b(?:tasks?|items?|work)\b.*?\b(?:completed|done|finished)', re.IGNORECASE),
    'pending_execution': re.compile(r'\b(?:pending|not yet|awaiting|waiting for|to do)\b', re.IGNORECASE),
    'blocked': re.compile(r'\b(?:blocked|stuck|unable to|cannot|failed)\b', re.IGNORECASE),
    'in_progress': re.compile(r'\b(?:in progress|working on|implementing|currently)\b', re.IGNORECASE),
}

FINAL_OPEN_MARKER_RE = re.compile(r'^\s*-\s\[( |/|%|!|>)\]\s+')
FUTURE_TOLERANCE = timedelta(minutes=2)


def parse_iso_timestamp(value: str) -> datetime:
    """Parse ISO timestamp with timezone support."""
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    return datetime.fromisoformat(candidate)


def to_utc(dt: datetime) -> datetime:
    """Normalize datetime into UTC for consistent comparisons."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def extract_evidence(content: str, file_path: Path) -> Dict[str, Any]:
    """
    Extract evidence references from task content.

    Returns dict with:
    - has_command: bool
    - has_result: bool
    - has_artifact: bool
    - has_verification: bool
    - evidence_count: int
    - evidence_details: list of found evidence types
    """
    evidence = {
        'has_command': bool(EVIDENCE_PATTERNS['command'].search(content)),
        'has_result': bool(EVIDENCE_PATTERNS['result'].search(content)),
        'has_artifact': bool(EVIDENCE_PATTERNS['artifact'].search(content)),
        'has_verification': bool(EVIDENCE_PATTERNS['verification'].search(content)),
        'evidence_count': 0,
        'evidence_details': [],
    }

    for pattern_name, pattern in EVIDENCE_PATTERNS.items():
        matches = pattern.findall(content)
        if matches:
            evidence['evidence_count'] += len(matches)
            evidence['evidence_details'].append({
                'type': pattern_name,
                'count': len(matches),
            })

    return evidence


def detect_report_contradictions(content: str) -> List[Dict[str, Any]]:
    """
    Detect semantic contradictions in report content.

    Returns list of contradictions found:
    - "all_completed" + "pending_execution"
    - "all_completed" + "blocked"
    - "all_completed" + "in_progress"
    """
    contradictions = []

    findings = {}
    for name, pattern in CONTRADICTION_PHRASES.items():
        matches = pattern.findall(content)
        if matches:
            findings[name] = len(matches)

    # Check for contradictory combinations
    if 'all_completed' in findings:
        if 'pending_execution' in findings:
            contradictions.append({
                'type': 'completion_conflict',
                'severity': 'error',
                'description': 'Report claims "all completed" but also mentions pending work',
                'conflicting_phrases': ['all_completed', 'pending_execution'],
            })
        if 'blocked' in findings:
            contradictions.append({
                'type': 'completion_conflict',
                'severity': 'error',
                'description': 'Report claims "all completed" but also mentions blocked items',
                'conflicting_phrases': ['all_completed', 'blocked'],
            })
        if 'in_progress' in findings:
            contradictions.append({
                'type': 'completion_conflict',
                'severity': 'warning',
                'description': 'Report claims "all completed" but also mentions work in progress',
                'conflicting_phrases': ['all_completed', 'in_progress'],
            })

    return contradictions


def check_temporal_consistency(session_dir: Path) -> List[Dict[str, Any]]:
    """
    Check for temporal inconsistencies across session documents.

    Validates:
    - Timeline entries are not later than document updated_at
    - updated_at >= created_at for all documents
    - Consistent timestamps across linked documents
    """
    issues = []
    now_utc = datetime.now(timezone.utc)

    if yaml is None:
        return [{'type': 'config', 'severity': 'warning', 'description': 'PyYAML not available, skipping temporal checks'}]

    doc_files = list(session_dir.glob('*.md'))
    doc_timestamps = {}

    for doc_file in doc_files:
        content = doc_file.read_text()
        if not content.startswith('---\n'):
            continue

        parts = content.split('---', 2)
        if len(parts) < 3:
            continue

        try:
            fm = yaml.safe_load(parts[1].strip())
            if not isinstance(fm, dict):
                continue
        except Exception:
            continue

        doc_timestamps[doc_file.name] = {
            'created_at': fm.get('created_at'),
            'updated_at': fm.get('updated_at'),
            'timeline_entries': [],
        }

        # Extract timeline entries
        timeline_match = re.search(r'## Timeline\s*\n(.*?)(?=\n## |\Z)', content, re.DOTALL)
        if timeline_match:
            timeline_content = timeline_match.group(1)
            # Find timestamps in timeline entries (format: - YYYY-MM-DD HH:MM)
            timeline_times = re.findall(r'-\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', timeline_content)
            doc_timestamps[doc_file.name]['timeline_entries'] = timeline_times

    # Check consistency
    for doc_name, ts_info in doc_timestamps.items():
        updated_at = ts_info.get('updated_at')
        created_at = ts_info.get('created_at')

        if updated_at and created_at:
            try:
                updated_dt = parse_iso_timestamp(updated_at)
                created_dt = parse_iso_timestamp(created_at)
                if updated_dt < created_dt:
                    issues.append({
                        'type': 'temporal_inconsistency',
                        'severity': 'error',
                        'document': doc_name,
                            'description': f'updated_at ({updated_at}) is before created_at ({created_at})',
                    })
                if to_utc(created_dt) > now_utc + FUTURE_TOLERANCE:
                    issues.append({
                        'type': 'temporal_inconsistency',
                        'severity': 'error',
                        'document': doc_name,
                        'description': f'created_at ({created_at}) is in the future',
                    })
                if to_utc(updated_dt) > now_utc + FUTURE_TOLERANCE:
                    issues.append({
                        'type': 'temporal_inconsistency',
                        'severity': 'error',
                        'document': doc_name,
                        'description': f'updated_at ({updated_at}) is in the future',
                    })
            except Exception:
                pass

        # Check timeline entries vs updated_at
        if updated_at:
            try:
                updated_dt = parse_iso_timestamp(updated_at)
                for timeline_entry in ts_info.get('timeline_entries', []):
                    try:
                        # Parse timeline entry format: "YYYY-MM-DD HH:MM"
                        entry_dt = datetime.strptime(timeline_entry, '%Y-%m-%d %H:%M')
                        # Assume same timezone as updated_at for comparison
                        if entry_dt > updated_dt.replace(tzinfo=None):
                            issues.append({
                                'type': 'temporal_inconsistency',
                                'severity': 'error',
                                'document': doc_name,
                                'description': f'Timeline entry ({timeline_entry}) is later than updated_at ({updated_at})',
                            })
                    except ValueError:
                        pass
            except Exception:
                pass

    return issues


def load_frontmatter_docs(session_dir: Path) -> List[Dict[str, Any]]:
    """Load markdown docs with parsed frontmatter/body."""
    docs: List[Dict[str, Any]] = []
    for doc_file in sorted(session_dir.glob("*.md")):
        content = doc_file.read_text()
        if not content.startswith("---\n") or yaml is None:
            continue
        parts = content.split("---", 2)
        if len(parts) < 3:
            continue
        try:
            fm = yaml.safe_load(parts[1].strip())
        except Exception:
            continue
        if not isinstance(fm, dict):
            continue
        docs.append(
            {
                "path": doc_file,
                "name": doc_file.name,
                "fm": fm,
                "body": parts[2].lstrip("\n"),
            }
        )
    return docs


def check_plan_task_coherence(session_dir: Path) -> List[Dict[str, Any]]:
    """
    Validate coherence between the latest plan and linked task.

    Rules:
    - Latest plan links.task must resolve to an existing task document id.
    - Linked task must reference latest plan via links.plan OR depends_on.
    """
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    plans = [d for d in docs if d["name"].find("_plan_") != -1]
    if not plans:
        return issues

    latest_plan = sorted(plans, key=lambda d: d["name"])[-1]
    plan_id = latest_plan["fm"].get("id")
    links = latest_plan["fm"].get("links", {})
    if not isinstance(links, dict):
        return issues

    linked_task_id = links.get("task")
    if not isinstance(linked_task_id, str) or not linked_task_id.strip():
        return issues

    task_docs = {
        str(d["fm"].get("id", "")).strip(): d
        for d in docs
        if d["name"].find("_task_") != -1
    }
    linked_task = task_docs.get(linked_task_id.strip())
    if linked_task is None:
        issues.append(
            {
                "type": "plan_task_coherence",
                "severity": "error",
                "description": f"Plan {plan_id} links.task='{linked_task_id}' but no task doc with this id exists",
            }
        )
        return issues

    task_fm = linked_task["fm"]
    task_links = task_fm.get("links", {})
    links_plan = task_links.get("plan") if isinstance(task_links, dict) else None
    depends_on = task_fm.get("depends_on")
    depends_values = depends_on if isinstance(depends_on, list) else []
    if links_plan != plan_id and plan_id not in depends_values:
        issues.append(
            {
                "type": "plan_task_coherence",
                "severity": "error",
                "description": (
                    f"Task {task_fm.get('id')} is linked from latest plan {plan_id} "
                    "but does not reference it via links.plan or depends_on"
                ),
            }
        )

    return issues


def check_final_docs_for_open_checklists(session_dir: Path) -> List[Dict[str, Any]]:
    """Fail strict mode when a status=final doc still has open checklist markers."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    for doc in load_frontmatter_docs(session_dir):
        fm = doc["fm"]
        if str(fm.get("status", "")).strip().lower() != "final":
            continue

        for line_num, line in enumerate(doc["body"].splitlines(), 1):
            if FINAL_OPEN_MARKER_RE.match(line):
                issues.append(
                    {
                        "type": "final_doc_open_checklist",
                        "severity": "error",
                        "document": doc["name"],
                        "line": line_num,
                        "description": (
                            f"Document {doc['name']} has status=final with open checklist line {line_num}"
                        ),
                    }
                )
                break

    return issues


def has_sufficient_evidence(evidence: Dict[str, Any]) -> bool:
    """
    Determine if evidence is sufficient for a completed task.

    Requirements (at least 2 of 4):
    - Command/code block showing execution
    - Result/output documentation
    - Artifact reference
    - Verification statement
    """
    criteria_met = sum([
        evidence['has_command'],
        evidence['has_result'],
        evidence['has_artifact'],
        evidence['has_verification'],
    ])
    return criteria_met >= 2


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


def verify_session(session_path: Path, strict: bool = False) -> Tuple[bool, Dict]:
    """
    Verify all tasks in a session folder are completed.

    Returns (all_completed, results_dict)

    In strict mode:
    - Validates evidence for completed tasks
    - Detects report contradictions
    - Checks temporal consistency
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
        'strict_mode': strict,
        'evidence_issues': [],
        'contradictions': [],
        'temporal_issues': [],
        'coherence_issues': [],
        'final_doc_issues': [],
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

                # Strict mode: validate evidence for completed tasks
                if strict:
                    evidence = extract_evidence(content, task_file)
                    if not has_sufficient_evidence(evidence):
                        issue = {
                            'type': 'missing_evidence',
                            'severity': 'error',
                            'task_id': task_id,
                            'file': str(task_file),
                            'line': line_num,
                            'description': f'Task {task_id} marked done but lacks sufficient evidence',
                            'evidence_found': evidence['evidence_count'],
                            'evidence_details': evidence['evidence_details'],
                        }
                        results['evidence_issues'].append(issue)
                        all_completed = False
                        file_result['all_completed'] = False
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

    # Strict mode: additional checks
    if strict:
        # Check report contradictions
        report_files = list(session_path.rglob('*report*.md'))
        for report_file in report_files:
            content = report_file.read_text()
            contradictions = detect_report_contradictions(content)
            if contradictions:
                results['contradictions'].extend(contradictions)
                for c in contradictions:
                    if c.get('severity') == 'error':
                        all_completed = False

        # Check temporal consistency
        temporal_issues = check_temporal_consistency(session_path)
        results['temporal_issues'] = temporal_issues
        for issue in temporal_issues:
            if issue.get('severity') == 'error':
                all_completed = False

        # Validate latest plan/task linkage coherence
        coherence_issues = check_plan_task_coherence(session_path)
        results['coherence_issues'] = coherence_issues
        for issue in coherence_issues:
            if issue.get('severity') == 'error':
                all_completed = False

        # Final documents must not have open checklist markers
        final_doc_issues = check_final_docs_for_open_checklists(session_path)
        results['final_doc_issues'] = final_doc_issues
        for issue in final_doc_issues:
            if issue.get('severity') == 'error':
                all_completed = False

    return all_completed, results


def print_report(all_completed: bool, results: Dict) -> None:
    """Print verification report."""
    print("=" * 60)
    print("Task Verification Report")
    print("=" * 60)
    print(f"Session: {results['session']}")
    if results.get('strict_mode'):
        print("Mode: STRICT")
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

    # Strict mode results
    if results.get('strict_mode'):
        print("Strict Mode Checks:")
        print("-" * 60)

        # Evidence issues
        if results['evidence_issues']:
            print(f"\n❌ Evidence Issues: {len(results['evidence_issues'])}")
            for issue in results['evidence_issues']:
                print(f"  ⚠️  {issue['task_id']} | {issue['file'].split('/')[-1]}:{issue['line']}")
                print(f"      {issue['description']}")
                if issue.get('evidence_details'):
                    details = ', '.join([f"{e['type']}:{e['count']}" for e in issue['evidence_details']])
                    print(f"      Evidence found: {details}")
        else:
            print("  ✓ Evidence checks passed")

        # Contradictions
        if results['contradictions']:
            print(f"\n❌ Contradictions: {len(results['contradictions'])}")
            for c in results['contradictions']:
                print(f"  ⚠️  [{c['severity'].upper()}] {c['description']}")
                print(f"      Conflicting: {', '.join(c.get('conflicting_phrases', []))}")
        else:
            print("  ✓ No contradictions detected")

        # Temporal issues
        if results['temporal_issues']:
            print(f"\n❌ Temporal Issues: {len(results['temporal_issues'])}")
            for issue in results['temporal_issues']:
                print(f"  ⚠️  {issue.get('document', 'unknown')}: {issue['description']}")
        else:
            print("  ✓ Temporal consistency checks passed")

        # Plan/task coherence issues
        if results.get('coherence_issues'):
            print(f"\n❌ Plan/Task Coherence Issues: {len(results['coherence_issues'])}")
            for issue in results['coherence_issues']:
                print(f"  ⚠️  [{issue.get('severity', 'error').upper()}] {issue['description']}")
        else:
            print("  ✓ Plan/task coherence checks passed")

        # Final docs checklist issues
        if results.get('final_doc_issues'):
            print(f"\n❌ Final Doc Checklist Issues: {len(results['final_doc_issues'])}")
            for issue in results['final_doc_issues']:
                print(
                    f"  ⚠️  {issue.get('document', 'unknown')}:{issue.get('line', '?')} "
                    f"{issue['description']}"
                )
        else:
            print("  ✓ Final-doc checklist checks passed")

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
        print("❌ Verification failed")
        print()
        if results.get('strict_mode'):
            print("Strict mode failures detected:")
            if results['evidence_issues']:
                print(f"  - {len(results['evidence_issues'])} task(s) lacking evidence")
            if results['contradictions']:
                print(f"  - {len(results['contradictions'])} contradiction(s) found")
            if results['temporal_issues']:
                print(f"  - {len(results['temporal_issues'])} temporal issue(s) found")
            if results.get('coherence_issues'):
                print(f"  - {len(results['coherence_issues'])} plan/task coherence issue(s) found")
            if results.get('final_doc_issues'):
                print(f"  - {len(results['final_doc_issues'])} final-doc checklist issue(s) found")
        else:
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
    import argparse

    parser = argparse.ArgumentParser(
        description='Verify all tasks in a session are completed.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python verify-tasks.py .agents/wb/260223_1200_auth-refactor/
  python verify-tasks.py --strict .agents/wb/260223_1200-auth-refactor/
  python verify-tasks.py .  # current directory

Strict Mode:
  Enables evidence-backed verification:
  - Tasks marked done must have evidence references
  - Report contradictions are detected
  - Timeline/frontmatter temporal inconsistencies are flagged
'''
    )
    parser.add_argument(
        'session_path',
        nargs='?',
        default=None,
        help='Session folder path (default: current directory)'
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Enable strict verification mode with evidence checks'
    )

    args = parser.parse_args()

    if args.session_path:
        session_path = Path(args.session_path)
    else:
        session_path = Path.cwd()

    all_completed, results = verify_session(session_path, strict=args.strict)
    print_report(all_completed, results)

    # Exit with error if tasks incomplete
    sys.exit(0 if all_completed else 1)


if __name__ == "__main__":
    main()
