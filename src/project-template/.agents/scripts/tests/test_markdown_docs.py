from pathlib import Path

from lib.markdown_docs import parse_markdown_doc


def write_doc(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def test_parse_markdown_doc_returns_frontmatter_body_and_raw_content(tmp_path):
    doc = write_doc(
        tmp_path / "valid.md",
        "---\n"
        "doc_type: task\n"
        "id: test_task_01\n"
        "---\n\n"
        "# Body\n",
    )

    parsed = parse_markdown_doc(doc)

    assert parsed is not None
    frontmatter, body, raw_content = parsed
    assert frontmatter == {"doc_type": "task", "id": "test_task_01"}
    assert body == "# Body\n"
    assert raw_content.startswith("---\n")


def test_parse_markdown_doc_rejects_missing_frontmatter(tmp_path):
    doc = write_doc(tmp_path / "plain.md", "# Body\n")

    assert parse_markdown_doc(doc) is None


def test_parse_markdown_doc_rejects_invalid_yaml(tmp_path):
    doc = write_doc(tmp_path / "bad.md", "---\n: bad\n---\n# Body\n")

    assert parse_markdown_doc(doc) is None


def test_parse_markdown_doc_rejects_non_mapping_frontmatter(tmp_path):
    doc = write_doc(tmp_path / "list.md", "---\n- item\n---\n# Body\n")

    assert parse_markdown_doc(doc) is None
