"""Knowledge Graph Agent — document → merged graph delta (FR-3.1/3.2/3.3, P1).

ONE LangGraph StateGraph (locked decision, handoff §3.4):
  extract (LLM structured output, per chunk, parallel)
    → on LLMError ONLY: keybert node (the single sanctioned fallback,
      FR-3.2/§2.1 — WARNING log + `fallbackUsed: "keybert"` in the response)
    → normalize (deterministic label normalization + in-batch dedupe)
There is no other extractor and no other fallback.

Persistence (FR-3.3): merge/dedupe by NORMALIZED label into `kg_nodes` /
`kg_edges` (JSONB tables) — re-building from an overlapping document updates
in place instead of duplicating. `deckIds`/`taskIds` are linked where
attributable (§5.1); a document build has no deck/task lineage (§4.5
retention discards it), so they stay empty — documented, not guessed.
"""

import asyncio
import hashlib
import logging
import re
from typing import Literal, TypedDict, cast

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.agents.kg.prompts import KG_SYSTEM_PROMPT
from app.core import llm
from app.core.errors import AppError
from app.services.ingestion import IngestedDocument

logger = logging.getLogger("enjoy.kg.build")


class ExtractedNode(s.ContractModel):
    label: str
    type: s.KGNodeType
    gloss: str


class ExtractedEdge(s.ContractModel):
    source_label: str
    target_label: str
    type: s.KGEdgeType


class ChunkGraph(s.ContractModel):
    """The structured-output envelope for one chunk's LLM call."""

    nodes: list[ExtractedNode]
    edges: list[ExtractedEdge]


class KGBuildResponse(s.ContractModel):
    """POST /agents/kg/build response (endpoint payload — not part of the
    frozen §5.1 contract; nodes/links ARE canonical KGNode/KGLink)."""

    nodes: list[s.KGNode]
    links: list[s.KGLink]
    fallback_used: Literal["keybert"] | None = None


class _KGState(TypedDict):
    document: IngestedDocument
    nodes: list[ExtractedNode]
    edges: list[ExtractedEdge]
    needs_fallback: bool
    fallback_used: str | None


# ── deterministic helpers ─────────────────────────────────────────────────────


def normalize_label(label: str) -> str:
    """THE one label normalization (FR-3.3 merge key)."""
    return " ".join(label.lower().split())


def node_id_for(normalized_label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", normalized_label).strip("-")
    if not slug:
        # A label that normalizes to nothing is an extraction defect — loud.
        raise AppError(
            502,
            "KG_EXTRACTION_FAILED",
            "The graph extractor produced an unusable node label.",
            detail={"label": normalized_label},
            recoverable=True,
        )
    return slug


def _node_id(user_id: str, normalized_label: str) -> str:
    """kg_nodes.id is a GLOBAL primary key; labels merge per-user. The id is
    the slug plus a deterministic per-user suffix so two users extracting the
    same concept never collide (root-caused in session 026 test run)."""
    suffix = hashlib.sha1(user_id.encode()).hexdigest()[:8]
    return f"{node_id_for(normalized_label)}-{suffix}"


def cluster_id_for(document: IngestedDocument) -> str:
    """One cluster per document/subject (FR-3.6: cluster = deck/subject)."""
    return "doc-" + re.sub(r"[^a-z0-9]+", "-", document.title.lower()).strip("-")


# ── graph nodes ───────────────────────────────────────────────────────────────


async def _extract(state: _KGState) -> dict[str, object]:
    """LLM extraction per chunk. LLMError — and ONLY LLMError — routes to the
    sanctioned KeyBERT fallback (FR-3.2); everything else propagates (§2.2)."""
    document = state["document"]

    async def _one_chunk(chunk_text: str) -> ChunkGraph:
        return await llm.structured(
            ChunkGraph,
            system=KG_SYSTEM_PROMPT,
            user=f"Document: {document.title}\n\nChunk:\n{chunk_text}",
        )

    try:
        results = await asyncio.gather(
            *(_one_chunk(chunk.text) for chunk in document.chunks)
        )
    except llm.LLMError as exc:
        logger.warning(
            "KG LLM extraction failed (%s) — using the sanctioned KeyBERT "
            "fallback (FR-3.2)", exc,
        )
        return {"needs_fallback": True}
    nodes = [n for r in results for n in r.nodes]
    edges = [e for r in results for e in r.edges]
    logger.info(
        "kg extraction: doc=%s chunks=%d nodes=%d edges=%d",
        document.filename, len(document.chunks), len(nodes), len(edges),
    )
    return {"nodes": nodes, "edges": edges, "needs_fallback": False}


def _extract_keybert_keyphrases(text: str) -> list[str]:
    from keybert import KeyBERT

    model = KeyBERT()
    phrases = model.extract_keywords(
        text, keyphrase_ngram_range=(1, 3), stop_words="english", top_n=15
    )
    return [phrase for phrase, _score in phrases]


async def _keybert(state: _KGState) -> dict[str, object]:
    """FR-3.2 fallback: keyphrase nodes (type Concept), no edges."""
    document = state["document"]
    phrases = await asyncio.to_thread(_extract_keybert_keyphrases, document.text)
    nodes = [
        ExtractedNode(label=phrase, type="Concept", gloss="")
        for phrase in phrases
    ]
    logger.warning(
        "kg KeyBERT fallback: doc=%s keyphrases=%d", document.filename, len(nodes)
    )
    return {"nodes": nodes, "edges": [], "fallback_used": "keybert"}


async def _normalize(state: _KGState) -> dict[str, object]:
    """In-batch dedupe by normalized label + edge endpoint hygiene."""
    seen: dict[str, ExtractedNode] = {}
    for node in state["nodes"]:
        key = normalize_label(node.label)
        node_id_for(key)  # loud on unusable labels
        if key not in seen or (not seen[key].gloss and node.gloss):
            seen[key] = node
    known = set(seen)
    edges: list[ExtractedEdge] = []
    seen_edges: set[tuple[str, str, str]] = set()
    for edge in state["edges"]:
        source = normalize_label(edge.source_label)
        target = normalize_label(edge.target_label)
        if source == target:
            continue  # self-loop: meaningless, dropped by design (documented)
        if source not in known:
            seen[source] = ExtractedNode(
                label=edge.source_label, type="Concept", gloss=""
            )
            known.add(source)
        if target not in known:
            seen[target] = ExtractedNode(
                label=edge.target_label, type="Concept", gloss=""
            )
            known.add(target)
        edge_key = (source, target, edge.type)
        if edge_key not in seen_edges:
            seen_edges.add(edge_key)
            edges.append(edge)
    if not seen:
        raise AppError(
            502,
            "KG_EXTRACTION_FAILED",
            "The extractor found no concepts in this document.",
            detail={"document": state["document"].filename},
            recoverable=True,
        )
    return {"nodes": list(seen.values()), "edges": edges}


def _route_after_extract(state: _KGState) -> str:
    return "keybert" if state["needs_fallback"] else "normalize"


_KGGraphT = CompiledStateGraph[_KGState, None, _KGState, _KGState]


def _build_graph() -> _KGGraphT:
    graph = StateGraph(_KGState)
    graph.add_node("extract", _extract)
    graph.add_node("keybert", _keybert)
    graph.add_node("normalize", _normalize)
    graph.add_edge(START, "extract")
    graph.add_conditional_edges("extract", _route_after_extract)
    graph.add_edge("keybert", "normalize")
    graph.add_edge("normalize", END)
    return cast(_KGGraphT, graph.compile())


_KG_GRAPH = _build_graph()


# ── persistence (FR-3.3 merge/dedupe) ─────────────────────────────────────────


def _node_schema(row: m.KGNode) -> s.KGNode:
    return s.KGNode.model_validate(
        {"id": row.id, "label": row.label, "clusterId": row.cluster_id, **row.data}
    )


async def build_graph(
    session: AsyncSession, user: m.User, *, document: IngestedDocument
) -> KGBuildResponse:
    """Extract + merge one document into the user's atlas. Caller commits."""
    result = await _KG_GRAPH.ainvoke(
        {
            "document": document,
            "nodes": [],
            "edges": [],
            "needs_fallback": False,
            "fallback_used": None,
        }
    )
    nodes = [ExtractedNode.model_validate(n) for n in result["nodes"]]
    edges = [ExtractedEdge.model_validate(e) for e in result["edges"]]
    cluster_id = cluster_id_for(document)

    existing_rows = (
        (await session.execute(select(m.KGNode).where(m.KGNode.user_id == user.id)))
        .scalars()
        .all()
    )
    by_normalized = {normalize_label(row.label): row for row in existing_rows}

    touched: list[s.KGNode] = []
    for node in nodes:
        key = normalize_label(node.label)
        row = by_normalized.get(key)
        if row is None:
            row = m.KGNode(
                id=_node_id(user.id, key),
                user_id=user.id,
                label=node.label,
                cluster_id=cluster_id,
                data={
                    "type": node.type,
                    "gloss": node.gloss,
                    "deckIds": [],
                    "taskIds": [],
                },
            )
            session.add(row)
            by_normalized[key] = row
        else:
            # Merge (FR-3.3): fill an empty gloss; never duplicate the node.
            if not row.data.get("gloss") and node.gloss:
                row.data = {**row.data, "gloss": node.gloss}
        touched.append(_node_schema(row))
    await session.flush()

    existing_edges = (
        (await session.execute(select(m.KGEdge).where(m.KGEdge.user_id == user.id)))
        .scalars()
        .all()
    )
    edge_keys = {(e.source, e.target, e.type) for e in existing_edges}
    new_links: list[s.KGLink] = []
    for edge in edges:
        source = by_normalized[normalize_label(edge.source_label)].id
        target = by_normalized[normalize_label(edge.target_label)].id
        if (source, target, edge.type) in edge_keys:
            continue  # dedupe — the relation is already in the atlas
        session.add(
            m.KGEdge(user_id=user.id, source=source, target=target, type=edge.type)
        )
        edge_keys.add((source, target, edge.type))
        new_links.append(s.KGLink(source=source, target=target, type=edge.type))

    return KGBuildResponse(
        nodes=touched,
        links=new_links,
        fallback_used=result["fallback_used"],
    )


__all__ = ["ChunkGraph", "KGBuildResponse", "build_graph", "normalize_label"]
