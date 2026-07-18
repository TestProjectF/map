from abc import ABC, abstractmethod
from pathlib import Path

from pydantic import BaseModel

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.models.dataset import NormalizedDataset, SourceCategory


class PreviewResult(BaseModel):
    output_path: Path
    feature_count: int
    truncated: bool
    source_crs: str | None = None
    target_crs: str


class DatasetReader(ABC):
    format_name: str
    source_category: SourceCategory
    supported_extensions: set[str]

    def can_read(self, path: Path) -> bool:
        return path.suffix.lower() in self.supported_extensions

    @abstractmethod
    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        raise NotImplementedError

    @abstractmethod
    def create_preview(
        self,
        path: Path,
        output_path: Path,
        layer_id: str | None,
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> PreviewResult:
        raise NotImplementedError
