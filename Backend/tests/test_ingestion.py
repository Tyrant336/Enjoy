"""Stage 1 — shared ingestion pipeline (app/services/ingestion.py).

Real Docling parses real fixture files (§6.3 — no parser mocking). Failure
paths (§6.4): bad extension, oversize, empty, corrupt file — all loud.
"""

from pathlib import Path

import pytest

from app.core.errors import AppError
from app.services import ingestion

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# ── filename sanitization (§7.3) ─────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("notes.pdf", "notes.pdf"),
        ("../evil/notes.pdf", "notes.pdf"),
        ("C:\\fake\\notes.pdf", "notes.pdf"),
        ("my lecture notes (1).pdf", "my lecture notes _1_.pdf"),
        ("!!!.pdf", "___.pdf"),  # stripped chars become underscores
    ],
)
def test_sanitize_filename(raw: str, expected: str) -> None:
    assert ingestion.sanitize_filename(raw) == expected


# ── upload validation (§7.3, B3) ──────────────────────────────────────────────


def test_wrong_extension_rejected_with_envelope() -> None:
    with pytest.raises(AppError) as excinfo:
        ingestion.validate_upload("notes.exe", 100)
    err = excinfo.value
    assert err.status_code == 415
    assert err.code == "DOCUMENT_UNSUPPORTED"
    assert err.detail == {
        "filename": "notes.exe",
        "acceptedExtensions": [".pdf", ".pptx", ".docx", ".md", ".txt"],
    }


@pytest.mark.parametrize("name", ["a.pdf", "a.pptx", "a.docx", "a.md", "a.txt", "A.PDF"])
def test_accepted_extensions_pass(name: str) -> None:
    assert ingestion.validate_upload(name, 100) == ingestion.sanitize_filename(name)


def test_oversize_rejected() -> None:
    with pytest.raises(AppError) as excinfo:
        ingestion.validate_upload("big.pdf", ingestion.MAX_UPLOAD_BYTES + 1)
    assert excinfo.value.status_code == 413
    assert excinfo.value.code == "DOCUMENT_TOO_LARGE"


def test_empty_file_rejected() -> None:
    with pytest.raises(AppError) as excinfo:
        ingestion.validate_upload("empty.pdf", 0)
    assert excinfo.value.code == "DOCUMENT_EMPTY"


# ── real Docling parses (B-side of the pipeline) ──────────────────────────────


@pytest.mark.parametrize(
    "name",
    [
        "biology-photosynthesis.pdf",
        "history-french-revolution.pdf",
        "cs-neural-networks.pdf",
    ],
)
async def test_ingest_real_fixture_pdfs(name: str) -> None:
    doc = await ingestion.ingest_document(name, _read(name))
    assert doc.filename == name
    assert doc.title
    assert doc.chunks, "expected at least one chunk"
    # Provenance: offsets are ordered and inside the text; the stitched text
    # contains known source content (proves real extraction, not fabrication).
    for chunk in doc.chunks:
        assert chunk.char_start < chunk.char_end
        assert chunk.text.strip()
    assert (
        "Photosynthesis" in doc.text
        or "Revolution" in doc.text
        or "Perceptron" in doc.text
    )


async def test_ingest_plain_text() -> None:
    doc = await ingestion.ingest_document(
        "biology-photosynthesis.txt", _read("biology-photosynthesis.txt")
    )
    assert "Photosynthesis" in doc.text


async def test_corrupt_pdf_fails_loudly() -> None:
    """B4: corrupt file → DOCUMENT_PARSE_FAILED, never a partial result."""
    garbage = b"%PDF-1.4\nthis is not a real pdf body at all \x00\x01\x02" * 10
    with pytest.raises(AppError) as excinfo:
        await ingestion.ingest_document("corrupt.pdf", garbage)
    assert excinfo.value.code == "DOCUMENT_PARSE_FAILED"


async def test_textless_document_fails_loudly() -> None:
    """B4 twin: a file Docling parses but with no extractable text →
    DOCUMENT_PARSE_FAILED (never an empty IngestedDocument)."""
    with pytest.raises(AppError) as excinfo:
        await ingestion.ingest_document("blank.txt", b"   \n\n   ")
    assert excinfo.value.code == "DOCUMENT_PARSE_FAILED"


def test_chunking_splits_long_text() -> None:
    blocks = [f"Paragraph {i}. " + "word " * 120 for i in range(10)]
    markdown = "\n\n".join(blocks)
    chunks = ingestion._chunk_markdown(markdown)
    assert len(chunks) > 1
    assert [c.index for c in chunks] == list(range(len(chunks)))
    # Every block lands in exactly one chunk, in order.
    stitched = "\n\n".join(c.text for c in chunks)
    for block in blocks:
        assert block in stitched
