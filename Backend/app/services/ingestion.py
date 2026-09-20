"""THE ONE ingestion pipeline — shared by the Flashcard (FR-2) and Knowledge
Graph (FR-3) generators (REQUIREMENTS §4.1/FR-2.1/FR-3.1, AGENTS.md §3.1).

Flow (one path, no branches):
  validate (§7.3: `.pdf .pptx .docx .md .txt`, ≤25 MB, sanitized filename)
  → Docling parse to TEXT (the LLM never sees page images — locked decision)
  → typed `IngestedDocument` (title + chunks with provenance offsets).

Failures are loud, never partial (AGENTS.md §2):
- wrong extension / oversize → §5.2 envelopes DOCUMENT_UNSUPPORTED /
  DOCUMENT_TOO_LARGE (validation errors: REST only, no SSE — §5.2);
- Docling failure or a document with no extractable text →
  DOCUMENT_PARSE_FAILED.

Retention (§4.5): document bytes are processed in memory and DISCARDED; only
the typed chunks live for the duration of one generation call. Nothing in
this module persists anything.
"""

import asyncio
import io
import logging
import re
from dataclasses import dataclass, field

from app.core.errors import AppError

logger = logging.getLogger("enjoy.ingestion")

# §7.3 — accepted upload types and size cap (synchronous reject of others).
ACCEPTED_EXTENSIONS = (".pdf", ".pptx", ".docx", ".md", ".txt")
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Chunk sizing: large enough for coherent concept extraction, small enough for
# reliable structured output. Paragraph blocks are packed greedily.
_CHUNK_TARGET_CHARS = 3000


@dataclass(frozen=True)
class DocumentChunk:
    """One text chunk with provenance offsets into the parsed markdown."""

    index: int
    text: str
    char_start: int
    char_end: int


@dataclass(frozen=True)
class IngestedDocument:
    """Typed ingestion result consumed by both generators (one contract)."""

    filename: str  # sanitized
    title: str
    chunks: list[DocumentChunk] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n\n".join(chunk.text for chunk in self.chunks)


def sanitize_filename(filename: str) -> str:
    """§7.3 filename sanitization: strip path components, keep a conservative
    character set. Result is never empty (falls back to the stem 'document'
    only when every character was stripped — an explicit, deterministic rule,
    not a hidden fallback)."""
    name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip()
    return name or "document"


def validate_upload(filename: str, size: int) -> str:
    """§7.3 validation. Returns the sanitized filename; raises the §5.2
    envelope on rejection."""
    safe = sanitize_filename(filename)
    lower = safe.lower()
    if not any(lower.endswith(ext) for ext in ACCEPTED_EXTENSIONS):
        raise AppError(
            415,
            "DOCUMENT_UNSUPPORTED",
            "This file type is not supported.",
            detail={
                "filename": filename,
                "acceptedExtensions": list(ACCEPTED_EXTENSIONS),
            },
            recoverable=True,
        )
    if size > MAX_UPLOAD_BYTES:
        raise AppError(
            413,
            "DOCUMENT_TOO_LARGE",
            "This file is too large. The harbour accepts files up to 25 MB.",
            detail={"filename": safe, "maxBytes": MAX_UPLOAD_BYTES, "size": size},
            recoverable=True,
        )
    if size == 0:
        raise AppError(
            422,
            "DOCUMENT_EMPTY",
            "This file is empty — there is nothing to learn from.",
            detail={"filename": safe},
            recoverable=True,
        )
    return safe


def _chunk_markdown(markdown: str) -> list[DocumentChunk]:
    """Split parsed markdown into paragraph-aligned chunks with offsets."""
    blocks = [b for b in re.split(r"\n\s*\n", markdown) if b.strip()]
    chunks: list[DocumentChunk] = []
    current: list[str] = []
    current_start = 0
    cursor = 0
    for block in blocks:
        start = markdown.find(block, cursor)
        end = start + len(block)
        cursor = end
        if current and sum(len(b) for b in current) + len(block) > _CHUNK_TARGET_CHARS:
            chunks.append(
                DocumentChunk(
                    index=len(chunks),
                    text="\n\n".join(current),
                    char_start=current_start,
                    char_end=start,
                )
            )
            current = []
        if not current:
            current_start = start
        current.append(block)
    if current:
        chunks.append(
            DocumentChunk(
                index=len(chunks),
                text="\n\n".join(current),
                char_start=current_start,
                char_end=cursor,
            )
        )
    return chunks


def _parse_with_docling(filename: str, data: bytes) -> str:
    """Synchronous Docling parse (CPU-bound — caller runs it off-loop)."""
    from docling.datamodel.base_models import DocumentStream
    from docling.document_converter import DocumentConverter

    converter = DocumentConverter()
    stream = DocumentStream(name=filename, stream=io.BytesIO(data))
    result = converter.convert(stream)
    return result.document.export_to_markdown()


async def ingest_document(filename: str, data: bytes) -> IngestedDocument:
    """Validate + parse one uploaded document. Loud failure, no retention."""
    safe = validate_upload(filename, len(data))
    logger.info("ingest: file=%s bytes=%d", safe, len(data))
    try:
        markdown = await asyncio.to_thread(_parse_with_docling, safe, data)
    except AppError:
        raise
    except Exception as exc:
        logger.error("Docling parse failed: file=%s error=%r", safe, exc)
        raise AppError(
            422,
            "DOCUMENT_PARSE_FAILED",
            "This document could not be read. Supported formats are "
            "PDF, PPTX, DOCX, Markdown and plain text.",
            detail={"filename": safe},
            recoverable=True,
        ) from exc
    if not markdown.strip():
        logger.error("Docling extracted no text: file=%s", safe)
        raise AppError(
            422,
            "DOCUMENT_PARSE_FAILED",
            "No text could be extracted from this document.",
            detail={"filename": safe},
            recoverable=True,
        )
    chunks = _chunk_markdown(markdown)
    title = safe.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
    logger.info("ingest ok: file=%s chunks=%d chars=%d", safe, len(chunks), len(markdown))
    return IngestedDocument(filename=safe, title=title, chunks=chunks)
