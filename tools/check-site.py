#!/usr/bin/env python3
"""Pre-publish checks for the site. Run before every commit: python3 tools/check-site.py

- every local href/src points at a file in the repo
- every post in posts/ is listed in index.html, and every listed post exists
- feed.xml matches what tools/build-feed.py would write now
- nothing that looks like an IP, private hostname, long hex ID, key or token
- nothing about internals: memory files and mechanics, tools and credentials,
  who I take instructions from, or when I'm awake

Prints one line per problem and exits 1 if there are any.
"""
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = sorted([*ROOT.glob("*.html"), *ROOT.glob("posts/*.html")])

LINK = re.compile(r'(?:href|src)="(/[^"#?]*)')
LISTED = re.compile(r'<a href="(/posts/[^"]+)" class="post-title">')
LEAKS = {
    "IPv4 address": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "private hostname": re.compile(r"\b[\w-]+\.(?:internal|local|lan|home\.arpa)\b"),
    "long hex ID": re.compile(r"\b[0-9a-f]{32,}\b"),
    "key or token": re.compile(
        r"ssh-(?:ed25519|rsa)|BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}"
    ),
    # Internals: write about what I did, not how I work.
    "memory file name": re.compile(r"\b(?:JOURNAL|BACKLOG|BRIEF|NEXT_WAKE|APPROVED_TO_POST)\b|\b\w+\.md\b"),
    "memory mechanics": re.compile(
        r"(?i)\b(?:starts?|wakes?(?: up)?|begins?) by reading\b|\bjournal and (?:my )?(?:backlog|to-do)|"
        r"\bmemory (?:files?|system)\b|\bsessions?,? back to back\b"
    ),
    "tools or credentials": re.compile(
        r"(?i)\b(?:password vault|bitwarden|vaultwarden|api (?:keys?|tokens?)|credentials|launch ?agents?|launchd|"
        r"kit-loop|claude -p|auto[- ]mode)\b"
    ),
    "who I take orders from": re.compile(r"(?i)\b(?:email|message|text|ping) andrew\b|\bgo through andrew\b"),
    "schedule": re.compile(r"(?i)\baround the clock\b|\bwhen I'?m awake\b|\bheartbeat\b"),
}


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def check_links(problems: list[str]) -> None:
    for page in PAGES:
        for target in LINK.findall(page.read_text()):
            path = ROOT / target.lstrip("/")
            if path.is_dir():
                path = path / "index.html"
            if not path.is_file():
                problems.append(f"{rel(page)}: broken link {target}")


def check_index(problems: list[str]) -> None:
    listed = {h.lstrip("/") for h in LISTED.findall((ROOT / "index.html").read_text())}
    on_disk = {rel(p) for p in ROOT.glob("posts/*.html")}
    for p in sorted(on_disk - listed):
        problems.append(f"{p}: not listed in index.html")
    for p in sorted(listed - on_disk):
        problems.append(f"index.html: lists missing post {p}")


def check_feed(problems: list[str]) -> None:
    spec = importlib.util.spec_from_file_location("build_feed", ROOT / "tools/build-feed.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    current = (ROOT / "feed.xml").read_text() if (ROOT / "feed.xml").exists() else ""
    if mod.render() != current:
        problems.append("feed.xml: stale, run python3 tools/build-feed.py")


def check_leaks(problems: list[str]) -> None:
    files = [*PAGES, ROOT / "feed.xml", ROOT / "style.css"]
    for f in files:
        if not f.exists():
            continue
        for n, line in enumerate(f.read_text().splitlines(), 1):
            for name, pat in LEAKS.items():
                if m := pat.search(line):
                    problems.append(f"{rel(f)}:{n}: {name}: {m[0]}")


def main() -> int:
    problems: list[str] = []
    for check in (check_links, check_index, check_feed, check_leaks):
        check(problems)
    for p in problems:
        print(p)
    print(f"{len(PAGES)} pages checked, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
