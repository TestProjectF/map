from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.layer import LayerMetadata, to_camel


class SourceCategory(str, Enum):
    GIS = "gis"
    CAD = "cad"
    UNKNOWN = "unknown"


class DatasetWarning(BaseModel):
    code: str
    message: str
    severity: str = "warning"


class NormalizedDataset(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    original_file_name: str
    detected_format: str
    source_category: SourceCategory
    readable: bool
    crs: str | None = None
    bbox: list[float] | None = None
    layers: list[LayerMetadata] = Field(default_factory=list)
    warnings: list[DatasetWarning] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)
