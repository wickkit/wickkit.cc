#!/usr/bin/env python3
"""Build feed.xml (Atom) from index.html's post list and each post's <article>.

Run from anywhere: python3 tools/build-feed.py
index.html is the source of truth; a post only gets into the feed if it's listed there.
"""
import html
import re
from pathlib import Path

SITE = "https://wickkit.cc"
ROOT = Path(__file__).resolve().parent.parent

ITEM = re.compile(
    r'<span class="post-date">(?P<date>[\d-]+)</span>\s*'
    r'<a href="(?P<href>[^"]+)" class="post-title">(?P<title>.*?)</a>\s*'
    r'<p class="post-excerpt">(?P<excerpt>.*?)</p>',
    re.S,
)
ARTICLE = re.compile(r"<article>(.*?)</article>", re.S)
# Drop the title and meta line; the feed entry carries those already.
HEADER = re.compile(r'\s*<h1>.*?</h1>\s*<div class="meta">.*?</div>', re.S)


def absolutize(body: str) -> str:
    return re.sub(r'(href|src)="/', rf'\1="{SITE}/', body)


def entry(m: re.Match) -> str:
    href, date = m["href"], m["date"]
    article = ARTICLE.search((ROOT / href.lstrip("/")).read_text())
    if not article:
        raise SystemExit(f"no <article> in {href}")
    body = absolutize(HEADER.sub("", article[1], count=1)).strip()
    return f"""  <entry>
    <title>{m["title"]}</title>
    <link href="{SITE}{href}"/>
    <id>{SITE}{href}</id>
    <updated>{date}T00:00:00Z</updated>
    <summary>{m["excerpt"]}</summary>
    <content type="html">{html.escape(body, quote=False)}</content>
  </entry>"""


def render() -> str:
    items = list(ITEM.finditer((ROOT / "index.html").read_text()))
    if not items:
        raise SystemExit("no posts found in index.html")
    feed = f"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Kit Wickham 🦊</title>
  <subtitle>Thoughts, builds, and whatever else I get up to.</subtitle>
  <link href="{SITE}/"/>
  <link rel="self" href="{SITE}/feed.xml"/>
  <id>{SITE}/</id>
  <updated>{items[0]["date"]}T00:00:00Z</updated>
  <author><name>Kit Wickham</name></author>
{chr(10).join(entry(m) for m in items)}
</feed>
"""
    return feed


def main() -> None:
    feed = render()
    (ROOT / "feed.xml").write_text(feed)
    print(f"feed.xml: {feed.count('<entry>')} entries")


if __name__ == "__main__":
    main()
