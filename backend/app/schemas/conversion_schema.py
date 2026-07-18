from pydantic import BaseModel, Field

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES


class PreviewRequest(BaseModel):
    layerId: str | None = None
    sourceCrs: str | None = None
    targetCrs: str = DEFAULT_TARGET_CRS
    featureLimit: int = Field(default=MAX_PREVIEW_FEATURES, ge=1, le=MAX_PREVIEW_FEATURES)


class PreviewResponse(BaseModel):
    previewUrl: str
    sourceCrs: str | None = None
    targetCrs: str
    featureCount: int
    truncated: bool
    rasterPreviewUrl: str | None = None
    rasterOverviewUrl: str | None = None
    rasterBbox: list[float] | None = None


class PreviewLayerResponse(BaseModel):
    layerId: str | None = None
    layerName: str
    previewUrl: str
    sourceCrs: str | None = None
    targetCrs: str
    featureCount: int
    truncated: bool


class BatchPreviewResponse(BaseModel):
    status: str
    layers: list[PreviewLayerResponse]
    rasterPreviewUrl: str | None = None
    rasterOverviewUrl: str | None = None
    rasterBbox: list[float] | None = None
