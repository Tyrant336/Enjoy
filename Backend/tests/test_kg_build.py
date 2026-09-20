"""Stage 3 — POST /agents/kg/build (FR-3.1/3.2/3.3, P1).

Real Docling ingestion, real Postgres merge, real KeyBERT fallback. Only the
OpenRouter HTTP boundary is mocked (§6.5).
"""

import json
import logging
from pathlib import Path

import httpx2
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from tests.conftest import OpenRouterHttpMock, openrouter_tool_response

FIXTURES = Path(__file__).parent / "fixtures"
CS_PDF = (FIXTURES / "cs-neural-networks.pdf").read_bytes()
HISTORY_PDF = (FIXTURES / "history-french-revolution.pdf").read_bytes()

GRAPH_ARGUMENTS = {
    "nodes": [
        {"label": "Perceptron", "type": "Concept",
         "gloss": "A linear classifier computing a weighted sum through an activation."},
        {"label": "Activation Function", "type": "Term",
         "gloss": "Non-linear function applied to the weighted sum."},
        {"label": "Backpropagation", "type": "Process",
         "gloss": "Gradient computation by chain rule, layer by layer."},
        {"label": "Cross-Entropy Loss", "type": "Formula",
         "gloss": "Loss for classification: negative log likelihood of the true class."},
        {"label": "Overfitting", "type": "Concept",
         "gloss": "When a model memorizes training data and fails to generalize."},
    ],
    "edges": [
        {"sourceLabel": "Perceptron", "targetLabel": "Activation Function",
         "type": "REQUIRES"},
        {"sourceLabel": "Backpropagation", "targetLabel": "Perceptron",
         "type": "EXPLAINS"},
        {"sourceLabel": "Overfitting", "targetLabel": "Cross-Entropy Loss",
         "type": "CONTRASTS_WITH"},
    ],
}


def _graph_handler(arguments: dict[str, object]):
    def handler(req: httpx2.Request) -> httpx2.Response:
        body = json.loads(req.content)
        prompt = json.dumps(body["messages"])
        assert "Neural Networks" in prompt or "Perceptron" in prompt
        return openrouter_tool_response("ChunkGraph", arguments)

    return handler


async def _post_build(client: AsyncClient, user: str, name: str, data: bytes):
    return await client.post(
        "/agents/kg/build",
        headers={"X-Harbour-User-Id": user},
        files={"file": (name, data, "application/pdf")},
    )


async def test_build_from_real_pdf_persists_canonical_graph(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    openrouter_http.handler = _graph_handler(GRAPH_ARGUMENTS)
    response = await _post_build(client, "user-kg-01", "cs-neural-networks.pdf", CS_PDF)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["fallbackUsed"] is None
    assert len(body["nodes"]) == 5
    assert len(body["links"]) == 3
    for node in body["nodes"]:
        assert node["type"] in {"Concept", "Term", "Formula", "Process", "Example"}
        assert node["clusterId"].startswith("doc-")
    for link in body["links"]:
        assert link["type"] in {
            "EXPLAINS", "PART_OF", "REQUIRES", "CONTRASTS_WITH", "EXAMPLE_OF"
        }

    # Persisted to the JSONB tables (FR-3.3).
    node_count = (
        await db_session.execute(
            select(func.count())
            .select_from(m.KGNode)
            .where(m.KGNode.user_id == "user-kg-01")
        )
    ).scalar_one()
    edge_count = (
        await db_session.execute(
            select(func.count())
            .select_from(m.KGEdge)
            .where(m.KGEdge.user_id == "user-kg-01")
        )
    ).scalar_one()
    assert (node_count, edge_count) == (5, 3)

    # D4: the atlas read path grew.
    graph = await client.get(
        "/agents/kg/graph", headers={"X-Harbour-User-Id": "user-kg-01"}
    )
    assert len(graph.json()["nodes"]) == 5
    assert len(graph.json()["links"]) == 3


async def test_build_merges_overlapping_document(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    """D2/FR-3.3: re-building with overlapping labels merges by normalized
    label — no duplicate nodes, no duplicate edges."""
    openrouter_http.handler = _graph_handler(GRAPH_ARGUMENTS)
    first = await _post_build(client, "user-kg-02", "cs-neural-networks.pdf", CS_PDF)
    assert first.status_code == 200

    # Overlapping: same labels with different casing/whitespace + one new node.
    overlap = {
        "nodes": [
            {"label": "  perceptron ", "type": "Concept", "gloss": "Duplicate casing."},
            {"label": "Gradient Descent", "type": "Process",
             "gloss": "Iterative optimization following the negative gradient."},
        ],
        "edges": [
            {"sourceLabel": "Perceptron",
             "targetLabel": "Activation Function", "type": "REQUIRES"},
            {"sourceLabel": "Gradient Descent",
             "targetLabel": "Backpropagation", "type": "REQUIRES"},
        ],
    }
    openrouter_http.handler = _graph_handler(overlap)
    second = await _post_build(client, "user-kg-02", "cs-neural-networks.pdf", CS_PDF)
    assert second.status_code == 200

    node_count = (
        await db_session.execute(
            select(func.count())
            .select_from(m.KGNode)
            .where(m.KGNode.user_id == "user-kg-02")
        )
    ).scalar_one()
    edge_count = (
        await db_session.execute(
            select(func.count())
            .select_from(m.KGEdge)
            .where(m.KGEdge.user_id == "user-kg-02")
        )
    ).scalar_one()
    assert node_count == 6  # 5 + 1 genuinely new; "  perceptron " merged
    assert edge_count == 4  # 3 + 1 genuinely new; duplicate edge skipped


async def test_keybert_fallback_on_llm_failure(
    client: AsyncClient,
    db_session: AsyncSession,
    openrouter_http: OpenRouterHttpMock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """D3/FR-3.2: forced LLM failure → KeyBERT fallback, WARNING log, and
    `fallbackUsed: "keybert"` in the response. Real KeyBERT, real model."""
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "ChunkGraph", {}, status=500
    )
    with caplog.at_level(logging.WARNING, logger="enjoy.kg.build"):
        response = await _post_build(
            client, "user-kg-03", "cs-neural-networks.pdf", CS_PDF
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["fallbackUsed"] == "keybert"
    assert body["nodes"], "KeyBERT must yield keyphrase nodes"
    assert body["links"] == []
    assert all(n["type"] == "Concept" for n in body["nodes"])
    assert any("KeyBERT" in rec.message for rec in caplog.records)
    assert any(rec.levelno == logging.WARNING for rec in caplog.records)


async def test_history_pdf_also_builds(
    client: AsyncClient, openrouter_http: OpenRouterHttpMock
) -> None:
    """D5: the third fixture builds too (generality, not fixture-tuning)."""
    arguments = {
        "nodes": [
            {"label": "Estates-General", "type": "Term",
             "gloss": "The assembly of the three estates called in 1789."},
            {"label": "Bastille", "type": "Concept",
             "gloss": "Fortress-prison stormed on 14 July 1789."},
        ],
        "edges": [
            {"sourceLabel": "Estates-General", "targetLabel": "Bastille",
             "type": "EXPLAINS"}
        ],
    }

    def handler(req: httpx2.Request) -> httpx2.Response:
        prompt = json.dumps(json.loads(req.content)["messages"])
        assert "French Revolution" in prompt
        return openrouter_tool_response("ChunkGraph", arguments)

    openrouter_http.handler = handler
    response = await _post_build(
        client, "user-kg-04", "history-french-revolution.pdf", HISTORY_PDF
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["nodes"]) == 2


async def test_kg_build_rejects_unsupported_extension(client: AsyncClient) -> None:
    response = await _post_build(client, "user-kg-05", "notes.exe", b"MZ")
    assert response.status_code == 415
    assert response.json()["code"] == "DOCUMENT_UNSUPPORTED"


async def test_kg_build_empty_extraction_is_loud_error_with_sse(
    client: AsyncClient, db_session: AsyncSession, openrouter_http: OpenRouterHttpMock
) -> None:
    """The LLM answers with zero concepts → KG_EXTRACTION_FAILED envelope +
    committed SSE error; nothing is persisted (§2.4/§5.2)."""
    user = "user-kg-06"
    openrouter_http.handler = lambda req: openrouter_tool_response(
        "ChunkGraph", {"nodes": [], "edges": []}
    )
    response = await _post_build(client, user, "cs-neural-networks.pdf", CS_PDF)
    assert response.status_code == 502
    assert response.json()["code"] == "KG_EXTRACTION_FAILED"
    events = (
        (await db_session.execute(
            select(m.EventOutbox.type).where(m.EventOutbox.user_id == user)
        ))
        .scalars()
        .all()
    )
    assert events == ["error"]
    nodes = (
        await db_session.execute(
            select(func.count()).select_from(m.KGNode).where(m.KGNode.user_id == user)
        )
    ).scalar_one()
    assert nodes == 0
