"""Command Center backend — a self-hosted FastAPI application.

The backend is the *only* component that talks to PostgreSQL. The frontend
and (later) the LLM reach data exclusively through this API. Postgres is the
single source of truth; the AI is just one consumer of it.
"""

__version__ = "0.1.0"
