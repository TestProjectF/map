from pathlib import Path

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.core.exceptions import NotImplementedFormatOperationError
from app.models.dataset import DatasetWarning, NormalizedDataset, SourceCategory
from app.readers.base import DatasetReader, PreviewResult


class BaseCadReader(DatasetReader):
    source_category = SourceCategory.CAD

    def create_preview(
        self,
        path: Path,
        output_path: Path,
        layer_id: str | None,
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> PreviewResult:
        raise NotImplementedFormatOperationError(f"{self.format_name} preview chưa được triển khai.")


def cad_missing_crs_warning() -> DatasetWarning:
    return DatasetWarning(code="CRS_REQUIRED", message="File CAD thường không khai báo CRS.")


def cad_not_implemented_warning(format_name: str, message: str | None = None) -> DatasetWarning:
    return DatasetWarning(
        code="CAD_READER_NOT_IMPLEMENTED",
        message=message or f"{format_name} reader chưa được triển khai.",
    )
