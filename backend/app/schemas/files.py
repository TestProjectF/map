from pydantic import BaseModel, Field

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES


class LayerInfo(BaseModel):
    name: str
    geometryType: str | None = None
    featureCount: int | None = None


class InspectResponse(BaseModel):
    fileId: str
    fileName: str
    format: str
    dataType: str
    readable: bool
    crs: str | None = None
    bbox: list[float] | None = None
    layers: list[LayerInfo] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ConvertRequest(BaseModel):
    fileId: str
    layerName: str | None = None
    sourceCrs: str | None = None
    targetCrs: str = DEFAULT_TARGET_CRS
    limit: int = Field(default=MAX_PREVIEW_FEATURES, ge=1, le=MAX_PREVIEW_FEATURES)


class ConvertResponse(BaseModel):
    fileId: str
    previewUrl: str
    featureCount: int
    truncated: bool


class ExportRequest(BaseModel):
    name: str = "drawn-layers"
    geojson: dict
