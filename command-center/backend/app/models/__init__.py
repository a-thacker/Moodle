"""ORM models.

Importing every model here gives Alembic (and anything importing
`app.models`) a single place that registers all tables on `Base.metadata`.
Add new models to this list as they're created.
"""

from app.models.chat import ChatMessage
from app.models.eclass import Course, GradeEvent, GradeSnapshot, TimelineEvent
from app.models.grocery import GroceryItem
from app.models.task import Task
from app.models.usage import ClaudeUsage
from app.models.user import User

__all__ = [
    "ChatMessage",
    "ClaudeUsage",
    "Course",
    "GradeEvent",
    "GradeSnapshot",
    "GroceryItem",
    "Task",
    "TimelineEvent",
    "User",
]
