from typing import Any

from pydantic import BaseModel, Field


class NormalizedFeature(BaseModel):
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
