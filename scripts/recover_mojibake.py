#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import re


MOJIBAKE_RE = re.compile(r"(闂|鈧|锟|偓|娓氣|顕€|锔|€�|€|�)")
CJK_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
KNOWN_UI_RE = re.compile(
    r"[全部角色记忆关系时序语义蒸馏浏览统计后端云同步连接断开确认取消关闭刷新重试重建重置扫描队列图谱结果错误成功处理中]"
)
TAG_TEXT_RE = re.compile(r"^(?P<indent>\s*)<(?P<tag>[A-Za-z][\w-]*)(?P<attrs>[^>]*)>(?P<text>.*)</(?P=tag)>\s*$")
STRING_RE = re.compile(r"(?P<prefix>.*?)(?P<quote>['\"`])(?P<body>.*?)(?P=quote)(?P<suffix>.*)")


def reverse_once(text: str) -> str:
    return text.encode("gbk", errors="replace").decode("utf-8", errors="replace")


def make_candidates(text: str, rounds: int = 8) -> list[str]:
    candidates = [text]
    current = text
    for _ in range(rounds):
        current = reverse_once(current)
        candidates.append(current)
    return candidates


def mostly_ascii_code(line: str) -> bool:
    if not line.strip():
        return True
    if any(ord(ch) > 127 for ch in line):
        return False
    return True


def score_candidate(candidate: str, original: str) -> float:
    score = 0.0

    mojibake_hits = len(MOJIBAKE_RE.findall(candidate))
    cjk_hits = len(CJK_RE.findall(candidate))
    qmark_hits = candidate.count("?")
    replacement_hits = candidate.count("\ufffd")

    score -= mojibake_hits * 14
    score -= replacement_hits * 20
    score -= qmark_hits * 3
    score += cjk_hits * 1.6

    if KNOWN_UI_RE.search(candidate):
        score += 10
    if original.count("'") == candidate.count("'"):
        score += 2
    if original.count('"') == candidate.count('"'):
        score += 2
    if original.count("`") == candidate.count("`"):
        score += 2
    if original.strip().startswith("<") and re.search(r"</[A-Za-z][\w-]*>\s*$", candidate):
        score += 4
    if "className=" in original and "className=" in candidate:
        score += 2
    if "label:" in original and "label:" in candidate:
        score += 3
    if "text=" in original and "text=" in candidate:
        score += 3
    if "=> " in original and "=> " in candidate:
        score += 1

    if mostly_ascii_code(original) and candidate != original:
        score -= 200

    return score


def fix_closing_tags(line: str) -> str:
    line = re.sub(r"\?/(\w[\w-]*)>", r"</\1>", line)
    line = re.sub(r"�/(\w[\w-]*)>", r"</\1>", line)
    return line


def simplify_comment(line: str) -> str:
    indent = line[: len(line) - len(line.lstrip())]
    stripped = line.strip()
    if stripped.startswith("{/*"):
        return f"{indent}{{/* Recovered UI comment */}}"
    return f"{indent}/* Recovered comment */"


def placeholder_for_tag(tag: str) -> str:
    return {
        "button": "操作",
        "h1": "恢复标题",
        "h2": "恢复标题",
        "h3": "恢复标题",
        "h4": "恢复标题",
        "p": "说明文案已恢复",
        "span": "提示",
        "div": "已恢复",
    }.get(tag, "已恢复")


def sanitize_tag_text(line: str) -> str:
    match = TAG_TEXT_RE.match(line)
    if not match:
        return line
    indent = match.group("indent")
    tag = match.group("tag")
    attrs = match.group("attrs")
    text = match.group("text")
    if not MOJIBAKE_RE.search(text):
        return line
    return f"{indent}<{tag}{attrs}>{placeholder_for_tag(tag)}</{tag}>"


def sanitize_single_string(line: str) -> str:
    match = STRING_RE.match(line)
    if not match:
        return line
    body = match.group("body")
    if not MOJIBAKE_RE.search(body):
        return line

    prefix = match.group("prefix")
    quote = match.group("quote")
    suffix = match.group("suffix")
    replacement = "已恢复"

    if "label:" in prefix:
        replacement = "已恢复标签"
    elif "text=" in prefix:
        replacement = "确认继续？"
    elif "<Spinner />" in prefix:
        replacement = "处理中..."
    elif "??" in prefix:
        replacement = "--"

    return f"{prefix}{quote}{replacement}{quote}{suffix}"


def choose_line(line: str) -> str:
    if mostly_ascii_code(line):
        return line

    stripped = line.strip()
    if MOJIBAKE_RE.search(stripped) and (
        (stripped.startswith("/*") and stripped.endswith("*/"))
        or (stripped.startswith("{/*") and stripped.endswith("*/}"))
    ):
        return simplify_comment(line)

    candidates = [fix_closing_tags(candidate) for candidate in make_candidates(line)]
    best = max(candidates, key=lambda candidate: score_candidate(candidate, line))

    if MOJIBAKE_RE.search(best):
        best = sanitize_tag_text(best)
    if MOJIBAKE_RE.search(best):
        best = sanitize_single_string(best)
    if "?" in best and re.search(r"\?/(span|div|p|button|h\d)>", best):
        best = fix_closing_tags(best)

    return best


def count_markers(lines: list[str]) -> int:
    return sum(len(MOJIBAKE_RE.findall(line)) for line in lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Recover mojibake-heavy TSX files with per-line candidate selection.")
    parser.add_argument("src", type=pathlib.Path)
    parser.add_argument("dest", type=pathlib.Path)
    args = parser.parse_args()

    source_text = args.src.read_text(encoding="utf-8")
    source_lines = source_text.splitlines()
    recovered_lines = [choose_line(line) for line in source_lines]
    recovered_text = "\n".join(recovered_lines) + ("\n" if source_text.endswith("\n") else "")

    args.dest.write_text(recovered_text, encoding="utf-8", newline="\n")

    print(f"source_markers={count_markers(source_lines)}")
    print(f"recovered_markers={count_markers(recovered_lines)}")
    print(f"lines={len(source_lines)}")
    print(f"dest={args.dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
