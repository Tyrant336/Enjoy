"""Harness smoke tests — prove the pytest setup itself works (real app + DB)."""

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_database_is_real_postgres_at_migration_head(
    db_session: AsyncSession,
) -> None:
    version = (await db_session.execute(text("SELECT version()"))).scalar_one()
    assert "PostgreSQL" in version
    # The Alembic-owned schema was applied by the harness — not create_all.
    revision = (
        await db_session.execute(text("SELECT version_num FROM alembic_version"))
    ).scalar_one()
    assert revision == "001"
