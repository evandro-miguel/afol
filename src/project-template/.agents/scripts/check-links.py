#!/usr/bin/env python3
"""
Check Links - Broken link detector for markdown files.

Scans markdown files and checks for broken internal links.

Usage:
    python check-links.py [options] [directories...]

Examples:
    python check-links.py                          # Check docs/
    python check-links.py docs/                    # Check specific directory
    python check-links.py --verbose                # Show all links checked
    python check-links.py --fix                    # Generate fix report
"""

import re
import os
import sys
import argparse
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class LinkIssue:
    """Represents a broken link issue."""
    file: str
    line: int
    link: str
    reason: str


@dataclass
class LinkResult:
    """Result of link checking."""
    total_links: int
    valid_links: int
    broken_links: int
    issues: List[LinkIssue]


def extract_links(content: str, filepath: str) -> List[Tuple[int, str]]:
    """
    Extract all markdown links from content.

    Returns list of (line_number, link_url) tuples.
    Skips links inside inline code (`) and code blocks (```).
    """
    links = []
    lines = content.split('\n')

    # Markdown link pattern: [text](url) - but not in code
    md_pattern = re.compile(r'(?<!`)\[.*?\]\((.*?)\)(?!`)')

    # HTML link pattern: <a href="url">
    html_pattern = re.compile(r'<a\s+href=["\']([^"\']+)["\']')

    # Image link pattern: ![alt](url) - but not in code
    img_pattern = re.compile(r'(?<!`)!\[.*?\]\((.*?)\)(?!`)')

    in_code_block = False

    for line_num, line in enumerate(lines, 1):
        # Skip code blocks
        if line.strip().startswith('```'):
            in_code_block = not in_code_block
            continue

        if in_code_block:
            continue

        # Skip lines that are mostly code (more than 50% backticks)
        if line.count('`') > len(line) * 0.3:
            continue

        # Find markdown links
        for match in md_pattern.finditer(line):
            url = match.group(1)
            links.append((line_num, url))

        # Find HTML links
        for match in html_pattern.finditer(line):
            url = match.group(1)
            links.append((line_num, url))

        # Find image links
        for match in img_pattern.finditer(line):
            url = match.group(1)
            links.append((line_num, url))

    return links


def resolve_link(link: str, current_file: str) -> Optional[str]:
    """
    Resolve a link to an absolute path.

    Returns None for external links (http, mailto, etc.)
    Returns resolved path for internal links.
    """
    # Skip external links
    if link.startswith(('http://', 'https://', 'mailto:', 'ftp://', '#')):
        return None

    # Skip anchor-only links
    if link.startswith('#'):
        return None

    # Get directory of current file
    current_dir = os.path.dirname(current_file)

    # Resolve relative path
    if link.startswith('./'):
        link_path = os.path.join(current_dir, link[2:])
    elif link.startswith('../'):
        link_path = os.path.join(current_dir, link)
    else:
        link_path = os.path.join(current_dir, link)

    # Normalize path
    link_path = os.path.normpath(link_path)

    return link_path


def check_link(link_path: str) -> Tuple[bool, str]:
    """
    Check if a link target exists.

    Returns (is_valid, reason) tuple.
    """
    if not link_path:
        return False, "Empty link"

    # Check if file exists
    if os.path.isfile(link_path):
        return True, "File exists"

    # Check if directory exists (for folder links)
    if link_path.endswith('/') and os.path.isdir(link_path):
        return True, "Directory exists"
    elif os.path.isdir(link_path):
        return True, "Directory exists"

    # Check with .md extension
    if not link_path.endswith('.md'):
        md_path = link_path + '.md'
        if os.path.isfile(md_path):
            return True, "File exists (with .md)"

    # Check for index.md in directory
    if os.path.isdir(link_path):
        index_path = os.path.join(link_path, 'index.md')
        if os.path.isfile(index_path):
            return True, "index.md exists"
        readme_path = os.path.join(link_path, 'README.md')
        if os.path.isfile(readme_path):
            return True, "README.md exists"

    return False, "Target not found"


def _collect_markdown_files(path: str) -> List[str]:
    if os.path.isfile(path) and path.endswith('.md'):
        return [path]
    if not os.path.isdir(path):
        return []

    markdown_files: List[str] = []
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['node_modules', '__pycache__']]
        for file_name in files:
            if file_name.endswith('.md'):
                markdown_files.append(os.path.join(root, file_name))
    return markdown_files


def _append_unreadable_issue(issues: List[LinkIssue], filepath: str, error: Exception) -> None:
    issues.append(
        LinkIssue(
            file=filepath,
            line=0,
            link=str(error),
            reason="Could not read file",
        )
    )


def _check_resolved_link(
    filepath: str,
    line_num: int,
    link: str,
    verbose: bool,
    issues: List[LinkIssue],
) -> bool:
    resolved = resolve_link(link, filepath)
    if resolved is None:
        if verbose:
            print(f"  ✓ {filepath}:{line_num} (external) {link}")
        return True

    is_valid, reason = check_link(resolved)
    if is_valid:
        if verbose:
            print(f"  ✓ {filepath}:{line_num} {link} ({reason})")
        return True

    issues.append(
        LinkIssue(
            file=filepath,
            line=line_num,
            link=link,
            reason=reason,
        )
    )
    if verbose:
        print(f"  ✗ {filepath}:{line_num} {link} ({reason})")
    return False


def check_path(path: str, verbose: bool = False) -> LinkResult:
    """
    Check a single file or directory.

    Returns LinkResult with summary and issues.
    """
    issues = []
    total_links = 0
    valid_links = 0

    markdown_files = _collect_markdown_files(path)
    if not markdown_files:
        return LinkResult(
            total_links=0,
            valid_links=0,
            broken_links=0,
            issues=[]
        )

    # Check each file
    for filepath in markdown_files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            _append_unreadable_issue(issues, filepath, e)
            continue

        links = extract_links(content, filepath)

        for line_num, link in links:
            total_links += 1
            if _check_resolved_link(filepath, line_num, link, verbose, issues):
                valid_links += 1

    return LinkResult(
        total_links=total_links,
        valid_links=valid_links,
        broken_links=len(issues),
        issues=issues
    )


def print_report(result: LinkResult, show_files: bool = False):
    """Print link check report."""
    print("\n" + "=" * 60)
    print("LINK CHECK REPORT")
    print("=" * 60)
    print()
    print(f"Total links checked: {result.total_links}")
    print(f"Valid links: {result.valid_links}")
    print(f"Broken links: {result.broken_links}")
    print()

    if result.broken_links > 0:
        print("BROKEN LINKS:")
        print("-" * 60)

        # Group by file
        files_with_issues = {}
        for issue in result.issues:
            if issue.file not in files_with_issues:
                files_with_issues[issue.file] = []
            files_with_issues[issue.file].append(issue)

        for filepath, issues in files_with_issues.items():
            print(f"\n{filepath}:")
            for issue in issues:
                print(f"  Line {issue.line}: {issue.link}")
                print(f"    Reason: {issue.reason}")

        print()
        print("=" * 60)
        print(f"❌ Found {result.broken_links} broken link(s)")
        print("=" * 60)
    else:
        print("✅ All links are valid!")
        print("=" * 60)


def generate_fix_script(issues: List[LinkIssue]) -> str:
    """Generate a bash script to help fix issues."""
    script = "#!/bin/bash\n"
    script += "# Auto-generated link fix script\n\n"

    files_fixed = set()
    for issue in issues:
        if issue.file not in files_fixed:
            script += f"# Fix {issue.file}\n"
            files_fixed.add(issue.file)

        script += f"# Line {issue.line}: {issue.link} - {issue.reason}\n"

    return script


def main():
    parser = argparse.ArgumentParser(
        description="Check for broken links in markdown files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          # Check docs/
  %(prog)s docs/                    # Check specific directory
  %(prog)s --verbose                # Show all links checked
  %(prog)s --fix                    # Generate fix report
  %(prog)s --output report.txt      # Save report to file
        """
    )

    parser.add_argument(
        'directories',
        nargs='*',
        default=['docs/'],
        help='Directories or files to check (default: docs/)'
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Show all links checked'
    )

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='Only show broken links'
    )

    parser.add_argument(
        '--fix',
        action='store_true',
        help='Generate fix script'
    )

    parser.add_argument(
        '-o', '--output',
        help='Save report to file'
    )

    args = parser.parse_args()

    all_issues = []
    total_links = 0
    total_valid = 0

    for path in args.directories:
        if not os.path.exists(path):
            print(f"Error: Path not found: {path}", file=sys.stderr)
            continue

        if not args.quiet:
            print(f"\nChecking {path}...")

        result = check_path(path, args.verbose)
        total_links += result.total_links
        total_valid += result.valid_links
        all_issues.extend(result.issues)

        if not args.quiet:
            print_report(result)

    # Overall summary
    if len(args.directories) > 1:
        print("\n" + "=" * 60)
        print("OVERALL SUMMARY")
        print("=" * 60)
        print(f"Total links: {total_links}")
        print(f"Valid links: {total_valid}")
        print(f"Broken links: {len(all_issues)}")

    # Generate fix script
    if args.fix and all_issues:
        fix_script = generate_fix_script(all_issues)
        fix_file = 'fix_links.sh'
        with open(fix_file, 'w') as f:
            f.write(fix_script)
        print(f"\nFix script generated: {fix_file}")

    # Save report
    if args.output:
        with open(args.output, 'w') as f:
            f.write(f"Total links: {total_links}\n")
            f.write(f"Valid links: {total_valid}\n")
            f.write(f"Broken links: {len(all_issues)}\n\n")
            for issue in all_issues:
                f.write(f"{issue.file}:{issue.line}: {issue.link} ({issue.reason})\n")
        print(f"\nReport saved to: {args.output}")

    # Exit code
    sys.exit(1 if all_issues else 0)


if __name__ == '__main__':
    main()
