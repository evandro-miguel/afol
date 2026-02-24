#!/usr/bin/env python3
"""
Agents Telemetry - Collect and query telemetry data for .agents system

Usage:
    agents-telemetry.py record <event_type> [options]
    agents-telemetry.py query [filters]
    agents-telemetry.py export [--format=json|csv] [--output=<path>]
    agents-telemetry.py report [--period=weekly|monthly]
    agents-telemetry.py validate
    agents-telemetry.py help

Commands:
    record      Record a telemetry event
    query       Query telemetry events
    export      Export telemetry data
    report      Generate telemetry report
    validate    Validate telemetry data against schema
    help        Show this help message

Options:
    --event-type=<type>       Event type (session_start, session_end, tool_exec, etc.)
    --session-id=<id>         Session ID
    --metadata=<json>         Event metadata as JSON string
    --context=<json>          Context information as JSON string
    --query=<query>           Query filter (e.g., "event_type=session_end")
    --period=<period>         Report period (weekly, monthly, all)
    --format=<format>         Export format (json, csv)
    --output=<path>           Output file path
    --limit=<n>               Max results to return (default: 100)
    --since=<date>            Filter events since date (ISO 8601)
    --until=<date>            Filter events until date (ISO 8601)
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
import argparse


# Configuration
TELEMETRY_DATA_DIR = Path(__file__).parent.parent / "data" / "telemetry"
TELEMETRY_SCHEMA_PATH = TELEMETRY_DATA_DIR / "schemas" / "event.json"
TELEMETRY_EVENTS_FILE = TELEMETRY_DATA_DIR / "events.jsonl"
ACTIVE_SESSION_FILE = Path(__file__).parent.parent / "wb" / ".active_session"
ACTIVE_SESSION_FILE = Path(
    os.environ.get("AGENTS_ACTIVE_SESSION_FILE", str(ACTIVE_SESSION_FILE))
)

# Ensure data directory exists
TELEMETRY_DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_iso_timestamp() -> str:
    """Get current timestamp in ISO 8601 format with timezone."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_schema() -> Dict[str, Any]:
    """Load telemetry event schema."""
    if not TELEMETRY_SCHEMA_PATH.exists():
        return {}
    with open(TELEMETRY_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_event(event: Dict[str, Any]) -> bool:
    """
    Validate event against schema (basic validation).
    Full JSON Schema validation would require jsonschema library.
    """
    required_fields = ["timestamp", "event_type", "session_id"]
    for field in required_fields:
        if field not in event:
            print(f"Error: Missing required field: {field}", file=sys.stderr)
            return False
    
    valid_event_types = [
        "session_start", "session_end", "tool_exec",
        "task_complete", "task_status_change", "blocker",
        "error", "pattern_applied", "file_changed",
        "element_access", "element_view", "element_apply"
    ]
    if event["event_type"] not in valid_event_types:
        print(f"Error: Invalid event_type: {event['event_type']}", file=sys.stderr)
        return False
    
    return True


def get_active_session() -> Optional[str]:
    """Get current active session ID."""
    if not ACTIVE_SESSION_FILE.exists():
        return None
    with open(ACTIVE_SESSION_FILE, "r", encoding="utf-8") as f:
        return f.read().strip()


def record_event(
    event_type: str,
    session_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Record a telemetry event to the events file."""
    
    # Use active session if not provided
    if not session_id:
        session_id = get_active_session()
        if not session_id:
            session_id = "unknown"
    
    event = {
        "timestamp": get_iso_timestamp(),
        "event_type": event_type,
        "session_id": session_id,
        "event_id": str(uuid.uuid4()),
        "metadata": metadata or {},
        "context": context or {}
    }
    
    if not validate_event(event):
        sys.exit(1)
    
    # Append to JSONL file
    with open(TELEMETRY_EVENTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")
    
    return event


def load_events(
    limit: int = 100,
    since: Optional[str] = None,
    until: Optional[str] = None,
    event_type: Optional[str] = None,
    session_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Load telemetry events with optional filters."""
    if not TELEMETRY_EVENTS_FILE.exists():
        return []
    
    events = []
    with open(TELEMETRY_EVENTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                
                # Apply filters
                if event_type and event.get("event_type") != event_type:
                    continue
                if session_id and event.get("session_id") != session_id:
                    continue
                if since and event.get("timestamp", "") < since:
                    continue
                if until and event.get("timestamp", "") > until:
                    continue
                
                events.append(event)
            except json.JSONDecodeError:
                continue
    
    # Sort by timestamp descending and limit
    events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return events[:limit]


def query_events(
    query: Optional[str] = None,
    limit: int = 100,
    since: Optional[str] = None,
    until: Optional[str] = None,
    event_type: Optional[str] = None,
    session_id: Optional[str] = None,
    output_format: str = "text"
) -> None:
    """Query and display telemetry events."""
    events = load_events(
        limit=limit,
        since=since,
        until=until,
        event_type=event_type,
        session_id=session_id
    )
    
    if output_format == "json":
        print(json.dumps(events, indent=2))
    elif output_format == "csv":
        if events:
            # CSV header
            fields = ["timestamp", "event_type", "session_id", "event_id"]
            print(",".join(fields))
            for event in events:
                row = [
                    event.get("timestamp", ""),
                    event.get("event_type", ""),
                    event.get("session_id", ""),
                    event.get("event_id", "")
                ]
                print(",".join(row))
    else:
        # Text format
        if not events:
            print("No events found.")
            return
        
        print(f"Found {len(events)} events:\n")
        for event in events:
            ts = event.get("timestamp", "unknown")[:19]
            etype = event.get("event_type", "unknown")
            sid = event.get("session_id", "unknown")
            print(f"  [{ts}] {etype:20s} {sid}")
            
            # Show metadata summary
            metadata = event.get("metadata", {})
            if metadata:
                for key, value in list(metadata.items())[:3]:
                    print(f"    {key}: {value}")


def export_events(
    output_path: Optional[str] = None,
    output_format: str = "json"
) -> None:
    """Export all telemetry events to a file."""
    events = load_events(limit=10000)  # Large limit for export
    
    if output_path:
        output_file = Path(output_path)
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = TELEMETRY_DATA_DIR / f"telemetry_export_{timestamp}.{output_format}"
    
    with open(output_file, "w", encoding="utf-8") as f:
        if output_format == "json":
            json.dump(events, f, indent=2)
        elif output_format == "csv":
            if events:
                fields = ["timestamp", "event_type", "session_id", "event_id"]
                f.write(",".join(fields) + "\n")
                for event in events:
                    row = [
                        event.get("timestamp", ""),
                        event.get("event_type", ""),
                        event.get("session_id", ""),
                        event.get("event_id", "")
                    ]
                    f.write(",".join(row) + "\n")
    
    print(f"Exported {len(events)} events to {output_file}")


def _calculate_date_range(period: str) -> Optional[str]:
    """Calculate date range for telemetry query."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    if period == "weekly":
        return (now - timedelta(days=7)).isoformat().replace("+00:00", "Z")
    elif period == "monthly":
        return (now - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    return None


def _calculate_session_durations(events: List[Dict]) -> List[float]:
    """Calculate session durations from start/end events."""
    session_starts = {}
    session_ends = {}
    for event in events:
        sid = event.get("session_id")
        if event.get("event_type") == "session_start":
            session_starts[sid] = event.get("timestamp")
        elif event.get("event_type") == "session_end":
            session_ends[sid] = event.get("timestamp")

    durations = []
    for sid in session_starts:
        if sid in session_ends:
            try:
                start = datetime.fromisoformat(session_starts[sid].replace("Z", "+00:00"))
                end = datetime.fromisoformat(session_ends[sid].replace("Z", "+00:00"))
                durations.append((end - start).total_seconds())
            except (ValueError, KeyError):
                continue
    return durations


def _count_tool_usage(events: List[Dict]) -> Dict[str, int]:
    """Count tool execution events by tool name."""
    tool_usage = {}
    for event in events:
        if event.get("event_type") == "tool_exec":
            tool = event.get("metadata", {}).get("tool_name", "unknown")
            tool_usage[tool] = tool_usage.get(tool, 0) + 1
    return tool_usage


def _count_outcomes(events: List[Dict]) -> Dict[str, int]:
    """Count events by outcome."""
    outcomes = {"success": 0, "failure": 0, "partial": 0, "skipped": 0}
    for event in events:
        outcome = event.get("metadata", {}).get("outcome")
        if outcome in outcomes:
            outcomes[outcome] += 1
    return outcomes


def generate_report(period: str = "weekly") -> Dict[str, Any]:
    """Generate telemetry report for specified period."""
    # Calculate date range
    since = _calculate_date_range(period)
    events = load_events(since=since, limit=10000)

    # Calculate metrics
    total_events = len(events)
    sessions = set(e.get("session_id") for e in events)

    event_counts = {}
    for event in events:
        etype = event.get("event_type", "unknown")
        event_counts[etype] = event_counts.get(etype, 0) + 1

    # Session durations
    session_durations = _calculate_session_durations(events)
    avg_duration = sum(session_durations) / len(session_durations) if session_durations else 0

    # Tool usage and outcomes
    tool_usage = _count_tool_usage(events)
    outcomes = _count_outcomes(events)

    # Blockers and errors
    blockers = [e for e in events if e.get("event_type") == "blocker"]
    errors = [e for e in events if e.get("event_type") == "error"]

    report = {
        "period": period,
        "generated_at": get_iso_timestamp(),
        "summary": {
            "total_events": total_events,
            "total_sessions": len(sessions),
            "avg_session_duration_seconds": avg_duration,
            "success_rate": outcomes["success"] / max(1, sum(outcomes.values()))
        },
        "event_breakdown": event_counts,
        "tool_usage": tool_usage,
        "outcomes": outcomes,
        "blockers_count": len(blockers),
        "errors_count": len(errors),
        "top_blockers": [
            e.get("metadata", {}).get("blocker_reason", "unknown")
            for e in blockers[:5]
        ]
    }

    return report


def print_report(report: Dict[str, Any]) -> None:
    """Print formatted telemetry report."""
    print("\n" + "=" * 60)
    print("TELEMETRY REPORT")
    print("=" * 60)
    print(f"Period: {report['period']}")
    print(f"Generated: {report['generated_at']}")
    print()
    
    print("SUMMARY")
    print("-" * 40)
    summary = report["summary"]
    print(f"  Total Events: {summary['total_events']}")
    print(f"  Total Sessions: {summary['total_sessions']}")
    print(f"  Avg Session Duration: {summary['avg_session_duration_seconds']:.1f}s")
    print(f"  Success Rate: {summary['success_rate']:.1%}")
    print()
    
    print("EVENT BREAKDOWN")
    print("-" * 40)
    for etype, count in sorted(report["event_breakdown"].items(), key=lambda x: -x[1]):
        print(f"  {etype:25s} {count:5d}")
    print()
    
    print("TOOL USAGE")
    print("-" * 40)
    for tool, count in sorted(report["tool_usage"].items(), key=lambda x: -x[1])[:10]:
        print(f"  {tool:25s} {count:5d}")
    print()
    
    print("OUTCOMES")
    print("-" * 40)
    for outcome, count in report["outcomes"].items():
        print(f"  {outcome:15s} {count:5d}")
    print()
    
    print("ISSUES")
    print("-" * 40)
    print(f"  Blockers: {report['blockers_count']}")
    print(f"  Errors: {report['errors_count']}")
    if report["top_blockers"]:
        print("  Top Blockers:")
        for blocker in report["top_blockers"]:
            print(f"    - {blocker}")
    print()
    print("=" * 60)


def validate_telemetry() -> bool:
    """Validate all telemetry events against schema."""
    if not TELEMETRY_EVENTS_FILE.exists():
        print("No telemetry events found.")
        return True
    
    errors = 0
    total = 0
    
    with open(TELEMETRY_EVENTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            try:
                event = json.loads(line)
                if not validate_event(event):
                    errors += 1
                total += 1
            except json.JSONDecodeError as e:
                print(f"Invalid JSON: {e}")
                errors += 1
                total += 1
    
    print(f"Validated {total} events, {errors} errors")
    return errors == 0


def _get_period_delta(period: str) -> timedelta:
    """Get timedelta for period."""
    if period == "daily":
        return timedelta(days=1)
    elif period == "weekly":
        return timedelta(weeks=1)
    elif period == "monthly":
        return timedelta(days=30)
    return timedelta(days=365*10)  # ~10 years for "all"


def _collect_element_stats(events: List[Dict], period_start: datetime) -> Dict[str, Dict]:
    """Collect element statistics from events."""
    now = datetime.now(timezone.utc)
    element_stats = {}

    for event in events:
        event_type = event.get("event_type")
        metadata = event.get("metadata", {})
        timestamp_str = event.get("timestamp", "")
        outcome = metadata.get("outcome", "success")

        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue

        days_ago = (now - timestamp).days
        element_id = None
        element_type = None

        if event_type == "tool_exec":
            element_id = metadata.get("tool_name")
            element_type = "tool"
        elif event_type == "pattern_applied":
            element_id = metadata.get("pattern_id")
            element_type = "pattern"
        elif event_type in ["element_access", "element_view", "element_apply"]:
            element_id = metadata.get("element_id")
            element_type = metadata.get("element_type", "document")

        if not element_id:
            continue

        key = f"{element_type}:{element_id}"
        in_current_period = timestamp >= period_start

        if in_current_period:
            if key not in element_stats:
                element_stats[key] = {
                    "element_id": element_id,
                    "element_type": element_type,
                    "access_count": 0,
                    "success_count": 0,
                    "fail_count": 0,
                    "last_access_days_ago": days_ago,
                }

            stats = element_stats[key]
            stats["access_count"] += 1
            if outcome == "success":
                stats["success_count"] += 1
            elif outcome in ["failure", "error"]:
                stats["fail_count"] += 1
            if days_ago < stats["last_access_days_ago"]:
                stats["last_access_days_ago"] = days_ago

    return element_stats


def _calculate_element_heat_score(stats: Dict, max_access: int) -> Dict:
    """Calculate heat score for a single element."""
    frequency_score = (stats["access_count"] / max_access) * 100 if max_access > 0 else 0
    recency_score = 100 * (0.9 ** stats["last_access_days_ago"])
    total_outcomes = stats["success_count"] + stats["fail_count"]
    success_score = (stats["success_count"] / total_outcomes * 100) if total_outcomes > 0 else 100
    heat_score = (frequency_score * 0.5) + (recency_score * 0.3) + (success_score * 0.2)

    heat_level = "hot" if heat_score >= 70 else ("warm" if heat_score >= 40 else "cold")

    return {
        "element_id": stats["element_id"],
        "element_type": stats["element_type"],
        "heat_score": round(heat_score, 1),
        "heat_level": heat_level,
        "frequency_score": round(frequency_score, 1),
        "recency_score": round(recency_score, 1),
        "success_score": round(success_score, 1),
        "access_count": stats["access_count"],
        "last_access_days_ago": stats["last_access_days_ago"],
        "success_count": stats["success_count"],
        "fail_count": stats["fail_count"],
        "trend": "stable"
    }


def calculate_heat_scores(
    period: str = "weekly",
    compare_previous: bool = False
) -> Dict[str, Any]:
    """
    Calculate heat scores for elements within a specific time period.

    Heat Score Formula (per period):
    - frequency_score (50%): Access count in period (0-100)
    - recency_score (30%): Days since last access in period (0-100)
    - success_score (20%): Success rate in period (0-100)
    """
    events = load_events(limit=10000)
    if not events:
        return {"tools": {}, "patterns": {}, "templates": {}, "documents": {}, "summary": {}}

    # Calculate date range
    now = datetime.now(timezone.utc)
    period_start = now - _get_period_delta(period)

    # Collect element stats
    element_stats = _collect_element_stats(events, period_start)
    if not element_stats:
        return {"tools": {}, "patterns": {}, "templates": {}, "documents": {}, "summary": {}}

    max_access = max(s["access_count"] for s in element_stats.values())

    # Calculate scores
    scored_elements = [_calculate_element_heat_score(stats, max_access) for stats in element_stats.values()]
    scored_elements.sort(key=lambda x: -x["heat_score"])

    # Categorize by type
    result = {
        "tools": [e for e in scored_elements if e["element_type"] == "tool"],
        "patterns": [e for e in scored_elements if e["element_type"] == "pattern"],
        "templates": [e for e in scored_elements if e["element_type"] == "template"],
        "documents": [e for e in scored_elements if e["element_type"] == "document"],
        "all": scored_elements,
        "period": period,
        "period_start": period_start.isoformat(),
        "period_end": now.isoformat(),
        "summary": {
            "total_elements": len(scored_elements),
            "hot_count": len([e for e in scored_elements if e["heat_level"] == "hot"]),
            "warm_count": len([e for e in scored_elements if e["heat_level"] == "warm"]),
            "cold_count": len([e for e in scored_elements if e["heat_level"] == "cold"]),
            "avg_heat_score": round(sum(e["heat_score"] for e in scored_elements) / len(scored_elements), 1) if scored_elements else 0,
            "total_accesses": sum(e["access_count"] for e in scored_elements)
        }
    }

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Agents Telemetry - Collect and query telemetry data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Record command
    record_parser = subparsers.add_parser("record", help="Record a telemetry event")
    record_parser.add_argument("event_type", help="Event type")
    record_parser.add_argument("--session-id", help="Session ID")
    record_parser.add_argument("--metadata", help="Metadata as JSON string")
    record_parser.add_argument("--context", help="Context as JSON string")
    record_parser.add_argument("--outcome", help="Event outcome")
    
    # Heat commands
    heat_parser = subparsers.add_parser("heat", help="Show heat map of all elements")
    heat_parser.add_argument("--type", choices=["all", "tools", "patterns", "templates", "documents"], default="all")
    heat_parser.add_argument("--format", choices=["text", "json"], default="text")
    heat_parser.add_argument("--min-score", type=float, default=0, help="Minimum heat score to show")
    heat_parser.add_argument("--period", choices=["daily", "weekly", "monthly", "all"], default="weekly", help="Time period for heat calculation")
    
    hot_parser = subparsers.add_parser("hot", help="Show hottest (most accessed) elements")
    hot_parser.add_argument("--limit", type=int, default=10, help="Number of hot elements to show")
    hot_parser.add_argument("--type", choices=["all", "tools", "patterns", "templates", "documents"], default="all")
    hot_parser.add_argument("--format", choices=["text", "json"], default="text")
    hot_parser.add_argument("--period", choices=["daily", "weekly", "monthly", "all"], default="weekly", help="Time period for heat calculation")
    
    cold_parser = subparsers.add_parser("cold", help="Show coldest (least accessed) elements")
    cold_parser.add_argument("--limit", type=int, default=10, help="Number of cold elements to show")
    cold_parser.add_argument("--type", choices=["all", "tools", "patterns", "templates", "documents"], default="all")
    cold_parser.add_argument("--format", choices=["text", "json"], default="text")
    cold_parser.add_argument("--period", choices=["daily", "weekly", "monthly", "all"], default="weekly", help="Time period for heat calculation")
    
    # Query command
    query_parser = subparsers.add_parser("query", help="Query telemetry events")
    query_parser.add_argument("--query", help="Query filter")
    query_parser.add_argument("--limit", type=int, default=100, help="Max results")
    query_parser.add_argument("--since", help="Filter since date (ISO 8601)")
    query_parser.add_argument("--until", help="Filter until date (ISO 8601)")
    query_parser.add_argument("--event-type", help="Filter by event type")
    query_parser.add_argument("--session-id", help="Filter by session ID")
    query_parser.add_argument("--format", dest="output_format", choices=["text", "json", "csv"], default="text")
    
    # Export command
    export_parser = subparsers.add_parser("export", help="Export telemetry data")
    export_parser.add_argument("--format", dest="output_format", choices=["json", "csv"], default="json")
    export_parser.add_argument("--output", help="Output file path")
    
    # Report command
    report_parser = subparsers.add_parser("report", help="Generate telemetry report")
    report_parser.add_argument("--period", choices=["weekly", "monthly", "all"], default="weekly")
    report_parser.add_argument("--format", dest="output_format", choices=["text", "json"], default="text")
    
    # Validate command
    subparsers.add_parser("validate", help="Validate telemetry data")
    
    args = parser.parse_args()
    
    if args.command == "record":
        metadata = {}
        context = {}
        if args.metadata:
            metadata = json.loads(args.metadata)
        if args.context:
            context = json.loads(args.context)
        if args.outcome:
            metadata["outcome"] = args.outcome
        
        event = record_event(
            event_type=args.event_type,
            session_id=args.session_id,
            metadata=metadata,
            context=context
        )
        print(f"Recorded event: {event['event_id']}")
        print(json.dumps(event, indent=2))
    
    elif args.command == "query":
        query_events(
            query=args.query,
            limit=args.limit,
            since=args.since,
            until=args.until,
            event_type=args.event_type,
            session_id=args.session_id,
            output_format=args.output_format
        )
    
    elif args.command == "export":
        export_events(
            output_path=args.output,
            output_format=args.output_format
        )
    
    elif args.command == "report":
        report = generate_report(period=args.period)
        if args.output_format == "json":
            print(json.dumps(report, indent=2))
        else:
            print_report(report)
    
    elif args.command == "validate":
        success = validate_telemetry()
        sys.exit(0 if success else 1)

    elif args.command == "heat":
        heat_data = calculate_heat_scores(period=args.period)
        print_heat_map(heat_data, element_type=args.type, min_score=args.min_score, output_format=args.format)

    elif args.command == "hot":
        heat_data = calculate_heat_scores(period=args.period)
        elements = heat_data.get(args.type, heat_data.get("all", []))
        hot_elements = [e for e in elements if e["heat_level"] == "hot"][:args.limit]
        print_heat_elements(hot_elements, title=f"🔥 HOT Elements (Last {args.period})", output_format=args.format)

    elif args.command == "cold":
        heat_data = calculate_heat_scores(period=args.period)
        elements = heat_data.get(args.type, heat_data.get("all", []))
        # Sort by heat_score ascending for cold elements
        cold_elements = sorted([e for e in elements if e["heat_level"] == "cold"], key=lambda x: x["heat_score"])[:args.limit]
        print_heat_elements(cold_elements, title=f"🧊 COLD Elements (Last {args.period})", output_format=args.format)

    else:
        parser.print_help()


def print_heat_map(heat_data: Dict[str, Any], element_type: str = "all", min_score: float = 0, output_format: str = "text") -> None:
    """Print heat map of elements."""
    if output_format == "json":
        print(json.dumps(heat_data, indent=2))
        return
    
    summary = heat_data.get("summary", {})
    period = heat_data.get("period", "weekly")
    period_start = heat_data.get("period_start", "unknown")[:10]
    period_end = heat_data.get("period_end", "unknown")[:10]
    
    print("\n" + "=" * 70)
    print(f"🔥 HEAT MAP - Element Usage & Engagement ({period})")
    print("=" * 70)
    print(f"Period: {period_start} → {period_end}")
    print()
    print(f"Total Elements: {summary.get('total_elements', 0)}")
    print(f"Total Accesses: {summary.get('total_accesses', 0)}")
    print(f"🔴 Hot (score >= 70): {summary.get('hot_count', 0)}")
    print(f"🟡 Warm (score 40-69): {summary.get('warm_count', 0)}")
    print(f"🔵 Cold (score < 40): {summary.get('cold_count', 0)}")
    print(f"Avg Heat Score: {summary.get('avg_heat_score', 0)}")
    print()
    
    # Print by category
    categories = ["tools", "patterns", "templates", "documents"]
    if element_type != "all":
        categories = [element_type]
    
    for category in categories:
        elements = heat_data.get(category, [])
        if not elements:
            continue
        
        print(f"\n{category.upper()}")
        print("-" * 70)
        print(f"{'Element':25s} {'Score':>8s} {'Level':>8s} {'Access':>8s} {'Last':>8s} {'Success':>10s}")
        print("-" * 70)
        
        for elem in elements:
            if elem["heat_score"] < min_score:
                continue
            
            icon = "🔴" if elem["heat_level"] == "hot" else "🟡" if elem["heat_level"] == "warm" else "🔵"
            last_access = f"{elem['last_access_days_ago']}d ago" if elem['last_access_days_ago'] < 30 else f"{elem['last_access_days_ago']}d"
            success_rate = f"{elem['success_count']}/{elem['access_count']} ({elem['success_score']:.0f}%)"
            
            print(f"{icon} {elem['element_id']:23s} {elem['heat_score']:>8.1f} {elem['heat_level']:>8s} {elem['access_count']:>8d} {last_access:>8s} {success_rate:>10s}")
    
    print()
    print("=" * 70)


def print_heat_elements(elements: List[Dict[str, Any]], title: str = "Elements", output_format: str = "text") -> None:
    """Print list of heat-scored elements."""
    if output_format == "json":
        print(json.dumps(elements, indent=2))
        return
    
    if not elements:
        print("No elements found matching criteria.")
        return
    
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)
    print()
    print(f"{'Element':25s} {'Type':>12s} {'Score':>8s} {'Level':>8s} {'Access':>8s} {'Success':>10s}")
    print("-" * 70)
    
    for elem in elements:
        icon = "🔴" if elem["heat_level"] == "hot" else "🟡" if elem["heat_level"] == "warm" else "🔵"
        success_rate = f"{elem['success_count']}/{elem['access_count']}"
        
        print(f"{icon} {elem['element_id']:23s} {elem['element_type']:>12s} {elem['heat_score']:>8.1f} {elem['heat_level']:>8s} {elem['access_count']:>8d} {success_rate:>10s}")
    
    print()
    print("=" * 70)


if __name__ == "__main__":
    main()
