"""ORM models.

Importing every model here gives Alembic (and anything importing
`app.models`) a single place that registers all tables on `Base.metadata`.
Add new models to this list as they're created.
"""

from app.models.user import User

__all__ = ["User"]
