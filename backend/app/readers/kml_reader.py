import re
from pathlib import Path

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.models.dataset import DatasetWarning, NormalizedDataset, SourceCategory
from app.readers.base import DatasetReader, PreviewResult
from app.utils.gdal import inspect_ogr_dataset, ogr_to_geojson


class KmlReader(DatasetReader):
    format_name = "KML"
    source_category = SourceCategory.GIS
    supported_extensions = {".kml"}

    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        layers, crs, bbox = inspect_ogr_dataset(path, "kml")
        crs = crs or "EPSG:4326"
        warnings = scan_kml_warnings(path)
        return NormalizedDataset(
            id=dataset_id,
            original_file_name=original_file_name,
            detected_format=self.format_name,
            source_category=self.source_category,
            readable=True,
            crs=crs,
            bbox=bbox,
            layers=layers,
            warnings=warnings,
        )

    def create_preview(
        self,
        path: Path,
        output_path: Path,
        layer_id: str | None,
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> PreviewResult:
        layers, _, _ = inspect_ogr_dataset(path, "kml")
        layer_name = None
        if layer_id:
            layer_name = next((layer.name for layer in layers if layer.id == layer_id), None)
        source_crs = source_crs or "EPSG:4326"
        feature_count, truncated = ogr_to_geojson(path, output_path, layer_name, source_crs, target_crs, feature_limit)
        return PreviewResult(output_path=output_path, feature_count=feature_count, truncated=truncated, source_crs=source_crs, target_crs=target_crs)


def scan_kml_warnings(path: Path) -> list[DatasetWarning]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    warnings: list[DatasetWarning] = []
    if re.search(r"<\s*GroundOverlay\b", text, re.IGNORECASE):
        warnings.append(DatasetWarning(code="KML_GROUND_OVERLAY_UNSUPPORTED", message="Bản demo chưa xử lý GroundOverlay/raster overlay trong KML."))
    if re.search(r"<\s*href\s*>\s*https?://", text, re.IGNORECASE):
        warnings.append(DatasetWarning(code="KML_EXTERNAL_REFERENCE", message="KML có ảnh hoặc tài nguyên tham chiếu ngoài; bản demo chưa tải tài nguyên ngoài."))
    return warnings
