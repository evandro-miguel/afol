#!/usr/bin/env python3
"""
Agentic System Update CLI
Main entry point for checking and applying updates.
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from version import Version, get_update_type, format_version_diff
from manifest import Manifest
from lock import UpdateLock, LockError, get_lock_status
from ownership import load_default_ownership_map, OwnershipType
from upstream import UpstreamManager, get_installed_version
from conflict import ConflictResolver, print_update_plan


def get_agents_dir() -> Path:
    """Get the .agents directory from current location."""
    # Check if we're inside .agents/scripts/agents-update/
    script_dir = Path(__file__).resolve().parent

    # Go up: agents-update -> scripts -> .agents
    agents_dir = script_dir.parent.parent

    if not (agents_dir / "scripts").exists():
        # Fallback: look for .agents in current working directory
        cwd = Path.cwd()
        if (cwd / ".agents").exists():
            return cwd / ".agents"
        raise RuntimeError(
            f"Could not find .agents directory.\n"
            f"Tried: {agents_dir}\n"
            f"Current directory: {cwd}"
        )

    return agents_dir


def cmd_check(args) -> int:
    """Check for available updates."""
    agents_dir = get_agents_dir()

    print("🔍 Checking for updates...")
    print(f"   Agents directory: {agents_dir}")

    # Get current version
    current_version = get_installed_version(agents_dir)
    print(f"   Current version: {current_version}")

    # Check upstream
    try:
        upstream = UpstreamManager(agents_dir)
        info = upstream.check_upstream()

        print(f"   Upstream: {info.url}")
        print(f"   Latest version: {info.version}")
        print(f"   Commit: {info.commit}")

        # Compare versions
        try:
            current = Version.parse(current_version)
            latest = Version.parse(info.version)

            update_type = get_update_type(current, latest)

            if update_type == "none":
                print("\n✅ System is up to date!")
                return 0

            print(f"\n📦 Update available!")
            print(f"   {format_version_diff(current, latest)}")

            if update_type == "major":
                print("\n⚠️  This is a MAJOR update. Please review changes carefully.")
            elif update_type == "minor":
                print("\nℹ️  This is a MINOR update with new features.")
            elif update_type == "patch":
                print("\nℹ️  This is a PATCH update with bug fixes.")

            print(f"\nRun 'agents-update plan' to see what will change.")
            print(f"Run 'agents-update apply' to apply the update.")

        except ValueError as e:
            print(f"\n⚠️  Could not compare versions: {e}")
            print(f"   Current: {current_version}")
            print(f"   Upstream: {info.version}")

    except Exception as e:
        print(f"\n❌ Error checking upstream: {e}")
        return 1

    return 0


def cmd_plan(args) -> int:
    """Show update plan with diffs."""
    agents_dir = get_agents_dir()

    print("📋 Generating update plan...")
    print(f"   Agents directory: {agents_dir}")

    # Check if locked
    lock_status = get_lock_status(agents_dir)
    if lock_status["locked"]:
        print(f"\n⚠️  Update in progress by {lock_status['holder']}")
        if lock_status["stale"]:
            print("   Lock appears stale. Use 'agents-update doctor' to repair.")
        return 1

    # Load ownership map
    try:
        ownership = load_default_ownership_map(agents_dir)
    except FileNotFoundError as e:
        print(f"\n❌ {e}")
        return 1

    # Get manifests
    current_version = get_installed_version(agents_dir)
    print(f"   Current version: {current_version}")

    try:
        upstream = UpstreamManager(agents_dir)
        info = upstream.check_upstream()

        print(f"   Target version: {info.version}")

        # Parse manifests
        local_manifest = Manifest(
            version=current_version,
            upstream_commit="",
            upstream_url="",
            upstream_tag="",
        )

        # Generate local manifest from current state
        from manifest import generate_manifest

        local_manifest = generate_manifest(
            agents_dir,
            version=current_version,
            exclude_patterns=[
                ".cache/*",
                "versions/*",
                "z-arq/*",
                "wb/*",
                "*.pyc",
                "__pycache__/*",
            ],
        )

        # Fetch upstream manifest
        print("\n📥 Fetching upstream...")
        upstream_manifest_dict = upstream.get_manifest()

        if not upstream_manifest_dict:
            print("❌ Could not get upstream manifest")
            return 1

        upstream_manifest = Manifest.from_dict(upstream_manifest_dict)

        # For base manifest, use local (simplified - in production would track original)
        base_manifest = local_manifest

        # Detect changes
        print("\n🔍 Analyzing changes...")
        resolver = ConflictResolver(
            base_manifest, local_manifest, upstream_manifest, ownership
        )
        plan = resolver.detect_changes()

        # Print plan
        print()
        print("=" * 70)
        print_update_plan(plan, show_unchanged=args.verbose)
        print("=" * 70)

        # Summary
        stats = plan.get_stats()
        safe = len(plan.get_safe_changes())
        action = len(plan.get_action_required())

        print(f"\n📊 Summary:")
        print(f"   Safe to update: {safe} files")
        print(f"   Require action: {action} files")

        if plan.has_conflicts():
            print(f"\n⚠️  {len(plan.get_by_type('conflict'))} CONFLICTS detected!")
            print("   Local modifications will be backed up as .local.bak")

        if action > 0 and not args.force:
            print(f"\n⚠️  Some files require attention.")
            print("   Review the plan above carefully before applying.")

        print(f"\n✅ Run 'agents-update apply' to apply changes.")

    except Exception as e:
        print(f"\n❌ Error generating plan: {e}")
        import traceback

        traceback.print_exc()
        return 1

    return 0


def cmd_apply(args) -> int:
    """Apply pending update."""
    agents_dir = get_agents_dir()
    
    print("🚀 Applying update...")
    print(f"   Agents directory: {agents_dir}")
    
    # Check if locked
    lock_status = get_lock_status(agents_dir)
    if lock_status["locked"]:
        print(f"\n⚠️  Update in progress by {lock_status['holder']}")
        if lock_status["stale"]:
            print("   Lock appears stale. Use 'agents-update doctor --fix' to repair.")
        return 1
    
    # Acquire lock
    try:
        lock = UpdateLock(agents_dir)
        lock.acquire()
        print("   ✓ Acquired update lock")
    except LockError as e:
        print(f"   ❌ Could not acquire lock: {e}")
        return 1
    
    try:
        # Load ownership map
        try:
            ownership = load_default_ownership_map(agents_dir)
        except FileNotFoundError as e:
            print(f"\n❌ {e}")
            return 1
        
        # Get versions
        current_version = get_installed_version(agents_dir)
        print(f"   Current version: {current_version}")
        
        # Check upstream
        upstream = UpstreamManager(agents_dir)
        info = upstream.check_upstream()
        print(f"   Target version: {info.version}")
        
        if current_version == info.version:
            print("\n✅ Already up to date!")
            return 0
        
        # Dry run - just show plan
        if args.dry_run:
            print("\n🧪 DRY RUN - No changes will be made")
            return cmd_plan(args)
        
        # Generate manifests
        from manifest import generate_manifest
        local_manifest = generate_manifest(
            agents_dir,
            version=current_version,
            exclude_patterns=[".cache/*", "versions/*", "z-arq/*", "wb/*", "*.pyc", "__pycache__/*"]
        )
        
        # Fetch upstream
        print("\n📥 Fetching upstream...")
        upstream_path = upstream.fetch_upstream(ref=f"v{info.version}" if info.version != "0.0.0-dev" else None)
        upstream_manifest_dict = upstream.get_manifest()
        upstream_manifest = Manifest.from_dict(upstream_manifest_dict) if upstream_manifest_dict else None
        
        if not upstream_manifest:
            print("❌ Could not get upstream manifest")
            return 1
        
        # Detect changes
        print("🔍 Analyzing changes...")
        resolver = ConflictResolver(local_manifest, local_manifest, upstream_manifest, ownership)
        plan = resolver.detect_changes()
        
        print(f"\n📊 Update summary:")
        print(f"   Safe to update: {len(plan.get_safe_changes())}")
        print(f"   Require action: {len(plan.get_action_required())}")
        
        if plan.has_conflicts() and not args.force:
            print("\n⚠️  Conflicts detected! Review with 'agents-update plan'")
            print("   Use --force to apply anyway (local files will be backed up)")
            return 1
        
        # Confirm
        if not args.force:
            response = input("\n⚡ Apply update? [y/N]: ")
            if response.lower() not in ['y', 'yes']:
                print("Update cancelled.")
                return 0
        
        # Create backup
        print("\n💾 Creating backup...")
        from backup import BackupManager
        backup_mgr = BackupManager(agents_dir)
        backup_dir = backup_mgr.create_backup(
            version_from=current_version,
            version_to=info.version,
            changes=plan.changes,
            current_manifest=local_manifest
        )
        
        # Staging
        print("\n📦 Preparing staging area...")
        from staging import StagingManager, StagingError
        staging = StagingManager(agents_dir, info.version, upstream_path)
        staging_dir = staging.prepare(plan.changes, ownership)
        staging.validate()
        
        # Atomic swap
        print("\n🔄 Performing atomic swap...")
        from swap import SwapManager, SwapError
        swapper = SwapManager(agents_dir)
        
        def on_swap_error():
            print("   Attempting rollback...")
            backup_mgr.restore_from_backup(backup_dir)
        
        success = swapper.swap(staging_dir, on_error=on_swap_error)
        
        if not success:
            print("\n❌ Update failed")
            return 1
        
        # Validation
        print("\n✅ Validating update...")
        # Update manifest
        upstream_manifest.save(agents_dir / "manifest.json")
        
        print(f"\n🎉 Update complete!")
        print(f"   {current_version} → {info.version}")
        print(f"   Backup: {backup_dir.name}")
        
        # Cleanup old versions
        swapper.cleanup_old_versions(keep=5)
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Update failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        lock.release()


def cmd_rollback(args) -> int:
    """Rollback to previous version."""
    agents_dir = get_agents_dir()
    
    print("⏪ Rolling back...")
    print(f"   Agents directory: {agents_dir}")
    
    from backup import BackupManager, create_backup_report
    
    backup_mgr = BackupManager(agents_dir)
    backups = backup_mgr.list_backups()
    
    if not backups:
        print("\n❌ No backups found")
        return 1
    
    # Show available backups
    print(f"\n📋 Available backups:")
    for i, backup_dir in enumerate(backups[:5], 1):
        print(f"   {i}. {backup_dir.name}")
    
    # Select backup
    if args.target_version:
        # Find backup for specific version
        target_backup = None
        for backup_dir in backups:
            restore_point = backup_mgr.get_restore_point(backup_dir)
            if restore_point and restore_point.version_from == args.target_version:
                target_backup = backup_dir
                break
        
        if not target_backup:
            print(f"\n❌ No backup found for version {args.target_version}")
            return 1
    else:
        # Use most recent
        target_backup = backups[0]
    
    # Show details
    print(f"\n{create_backup_report(target_backup)}")
    
    # Confirm
    if not args.force:
        response = input(f"\n⚡ Rollback to {target_backup.name}? [y/N]: ")
        if response.lower() not in ['y', 'yes']:
            print("Rollback cancelled.")
            return 0
    
    # Perform rollback
    success = backup_mgr.restore_from_backup(target_backup, dry_run=args.dry_run)
    
    if success and not args.dry_run:
        print("\n✅ Rollback complete!")
        
        # Also try swap rollback if using versioning
        try:
            from swap import SwapManager
            swapper = SwapManager(agents_dir)
            swapper.rollback()
        except:
            pass
    elif args.dry_run:
        print("\n🧪 Dry run complete - no changes made")
    else:
        print("\n❌ Rollback failed")
        return 1
    
    return 0


def cmd_doctor(args) -> int:
    """Diagnose update system health."""
    agents_dir = get_agents_dir()

    print("🩺 Running update system diagnostics...")
    print(f"   Agents directory: {agents_dir}")
    print()

    checks = []

    # Check 1: Ownership map exists
    ownership_path = agents_dir / "update-ownership.json"
    if ownership_path.exists():
        try:
            load_default_ownership_map(agents_dir)
            checks.append(("✅", "Ownership map", "Valid"))
        except Exception as e:
            checks.append(("❌", "Ownership map", f"Invalid: {e}"))
    else:
        checks.append(("❌", "Ownership map", "Missing"))

    # Check 2: Lock status
    lock_status = get_lock_status(agents_dir)
    if lock_status["locked"]:
        if lock_status["stale"]:
            checks.append(("⚠️", "Lock", f"Stale lock by {lock_status['holder']}"))
        else:
            checks.append(("⚠️", "Lock", f"Active lock by {lock_status['holder']}"))
    else:
        checks.append(("✅", "Lock", "No active locks"))

    # Check 3: Upstream connectivity
    try:
        upstream = UpstreamManager(agents_dir)
        if upstream.validate_connection():
            checks.append(("✅", "Upstream", "Reachable"))
        else:
            checks.append(("⚠️", "Upstream", "Validation failed"))
    except Exception as e:
        checks.append(("❌", "Upstream", f"Unreachable: {e}"))

    # Check 4: Version
    version = get_installed_version(agents_dir)
    checks.append(("ℹ️", "Version", version))

    # Print results
    max_status = max(len(c[0]) for c in checks)
    max_name = max(len(c[1]) for c in checks)

    for status, name, result in checks:
        print(f"{status} {name:<{max_name}} {result}")

    # Stale lock recovery
    if lock_status.get("stale"):
        print(f"\n⚠️  Stale lock detected!")
        if args.fix:
            lock = UpdateLock(agents_dir)
            lock._force_release()
            print("   Lock cleared.")
        else:
            print("   Run 'agents-update doctor --fix' to clear stale lock.")

    print()
    return 0


def main():
    parser = argparse.ArgumentParser(
        prog="agents-update",
        description="Update agentic system from upstream repository",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  check      Check if updates are available
  plan       Show what would be updated
  apply      Apply the update
  rollback   Rollback to previous version
  doctor     Diagnose update system health

Examples:
  agents-update check
  agents-update plan --verbose
  agents-update apply --force
  agents-update doctor --fix
""",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # check
    check_parser = subparsers.add_parser("check", help="Check for updates")

    # plan
    plan_parser = subparsers.add_parser("plan", help="Show update plan")
    plan_parser.add_argument(
        "-v", "--verbose", action="store_true", help="Show unchanged files"
    )
    plan_parser.add_argument(
        "-f", "--force", action="store_true", help="Skip confirmation prompts"
    )

    # apply
    apply_parser = subparsers.add_parser("apply", help="Apply update")
    apply_parser.add_argument(
        "-f", "--force", action="store_true", help="Force apply without confirmation"
    )
    apply_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without applying",
    )

    # rollback
    rollback_parser = subparsers.add_parser("rollback", help="Rollback update")
    rollback_parser.add_argument(
        "--to", dest="target_version", help="Rollback to specific version"
    )

    # doctor
    doctor_parser = subparsers.add_parser("doctor", help="Diagnose system")
    doctor_parser.add_argument("--fix", action="store_true", help="Fix detected issues")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 0

    commands = {
        "check": cmd_check,
        "plan": cmd_plan,
        "apply": cmd_apply,
        "rollback": cmd_rollback,
        "doctor": cmd_doctor,
    }

    try:
        return commands[args.command](args)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        return 130
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
