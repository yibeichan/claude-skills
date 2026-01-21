#!/usr/bin/env python3
"""
Install Claude skills from this repository to a target directory.

Usage:
    python install.py --list                          # List available skills
    python install.py bidsapp-nidm-standards          # Install a skill (default: ~/.codex/skills/)
    python install.py scientific-writer --target ./skills
    python install.py --all                           # Install all skills
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Optional


# Default Claude Code skills directory
DEFAULT_SKILLS_DIR = Path.home() / ".codex" / "skills"

# Repository root
REPO_ROOT = Path(__file__).parent


def load_manifest() -> dict:
    """Load the skills manifest."""
    manifest_path = REPO_ROOT / "skills.json"
    if not manifest_path.exists():
        print(f"Error: skills.json not found at {manifest_path}")
        sys.exit(1)
    with open(manifest_path) as f:
        return json.load(f)


def list_skills():
    """List all available skills."""
    manifest = load_manifest()
    print("Available skills:")
    print()
    for skill in manifest.get("skills", []):
        print(f"  {skill['name']}")
        print(f"    Version: {skill.get('version', '1.0.0')}")
        print(f"    Description: {skill.get('description', 'No description')}")
        print(f"    Tags: {', '.join(skill.get('tags', []))}")
        print()


def install_skill(skill_name: str, target_dir: Path, overwrite: bool = False) -> bool:
    """Install a skill to the target directory."""
    manifest = load_manifest()

    # Find the skill
    skill = next((s for s in manifest.get("skills", []) if s["name"] == skill_name), None)
    if not skill:
        print(f"Error: Skill '{skill_name}' not found.")
        print("Run 'python install.py --list' to see available skills.")
        return False

    # Source path
    source_path = REPO_ROOT / skill["path"]
    if not source_path.exists():
        print(f"Error: Skill directory not found at {source_path}")
        return False

    # Target path
    target_path = target_dir / skill_name

    # Check if already exists
    if target_path.exists():
        if not overwrite:
            print(f"Error: Target directory already exists: {target_path}")
            print("Use --overwrite to replace the existing skill.")
            return False
        shutil.rmtree(target_path)

    # Create target directory
    target_dir.mkdir(parents=True, exist_ok=True)

    # Copy the skill
    print(f"Installing {skill_name}...")
    print(f"  Source: {source_path}")
    print(f"  Target: {target_path}")

    shutil.copytree(source_path, target_path)

    print(f"✓ Successfully installed {skill_name}")
    return True


def install_all_skills(target_dir: Path, overwrite: bool = False) -> bool:
    """Install all skills."""
    manifest = load_manifest()
    success = True

    for skill in manifest.get("skills", []):
        if not install_skill(skill["name"], target_dir, overwrite):
            success = False

    return success


def main():
    parser = argparse.ArgumentParser(
        description="Install Claude skills from this repository",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python install.py --list
  python install.py bidsapp-nidm-standards
  python install.py scientific-writer --target ./my-skills
  python install.py --all --overwrite
  python install.py bidsapp-nidm-standards --target ~/.claude/skills
        """
    )

    parser.add_argument(
        "skill",
        nargs="?",
        help="Name of the skill to install (use --list to see available)"
    )
    parser.add_argument(
        "--target", "-t",
        type=Path,
        default=DEFAULT_SKILLS_DIR,
        help=f"Target directory for skills (default: {DEFAULT_SKILLS_DIR})"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List available skills"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Install all available skills"
    )
    parser.add_argument(
        "--overwrite", "-o",
        action="store_true",
        help="Overwrite existing skill directory"
    )

    args = parser.parse_args()

    # List mode
    if args.list:
        list_skills()
        return 0

    # Install all mode
    if args.all:
        success = install_all_skills(args.target, args.overwrite)
        return 0 if success else 1

    # Install specific skill
    if not args.skill:
        parser.print_help()
        return 1

    success = install_skill(args.skill, args.target, args.overwrite)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
