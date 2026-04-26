"""Register app models with SQLModel metadata before init_db() runs."""

from app import models as _models  # noqa: F401
