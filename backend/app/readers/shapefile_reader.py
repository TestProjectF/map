import shutil
from collections import defaultdict
from pathlib import Path

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.core.exceptions import InvalidDatasetError
from app.models.dataset import DatasetWarning, NormalizedDataset, SourceCategory
from app.readers.base import DatasetReader, PreviewResult
from app.utils.archive import safe_extract_zip
from app.utils.gdal import inspect_ogr_dataset, merge_bbox, ogr_to_geojson


class ShapefileReader(DatasetReader):
    format_name = "ESRI Shapefile"
    source_category = SourceCategory.GIS
    supported_extensions = {".zip"}

    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        extracted = self._extract(path)
        shapefiles = find_shapefile_sets(extracted)
        warnings: list[DatasetWarning] = []
        layers = []
        dataset_crs = None
        dataset_bbox = None
        for index, shp in enumerate(shapefiles):
            missing = missing_required_parts(shp)
            if missing:
                raise InvalidDatasetError("Shapefile thiếu thành phần bắt buộc.", {"shapefile": shp.name, "missing": missing})
            if not shp.with_suffix(".prj").exists():
                warnings.append(DatasetWarning(code="SHP_MISSING_PRJ", message=f"Shapefile {shp.name} thiếu .prj; cần nhập CRS nguồn khi preview."))
            layer_infos, crs, bbox = inspect_ogr_dataset(shp, f"shp-{index}")
            if not dataset_crs and crs:
                dataset_crs = crs
            dataset_bbox = merge_bbox(dataset_bbox, bbox)
            if layer_infos:
                layer = layer_infos[0]
                layer.id = f"shp-{index}"
                layer.name = shp.stem
                layer.crs = crs
                layer.bbox = bbox
                layer.extra["relativePath"] = str(shp.relative_to(extracted))
                layers.append(layer)
        if not layers:
            raise InvalidDatasetError("ZIP không chứa Shapefile hợp lệ.")
        if not dataset_crs:
            warnings.append(DatasetWarning(code="CRS_REQUIRED", message="Không tìm thấy CRS trong Shapefile ZIP."))
        return NormalizedDataset(
            id=dataset_id,
            original_file_name=original_file_name,
            detected_format=self.format_name,
            source_category=self.source_category,
            readable=True,
            crs=dataset_crs,
            bbox=dataset_bbox,
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
        extracted = self._extract(path)
        shapefiles = find_shapefile_sets(extracted)
        if not shapefiles:
            raise InvalidDatasetError("ZIP không chứa Shapefile hợp lệ.")
        index = int(layer_id.split("-")[1]) if layer_id and layer_id.startswith("shp-") else 0
        if index >= len(shapefiles):
            raise InvalidDatasetError("Layer Shapefile không tồn tại.", {"layerId": layer_id})
        shp = shapefiles[index]
        layers, crs, _ = inspect_ogr_dataset(shp, f"shp-{index}")
        source_crs = source_crs or crs
        feature_count, truncated = ogr_to_geojson(shp, output_path, layers[0].name if layers else None, source_crs, target_crs, feature_limit)
        return PreviewResult(output_path=output_path, feature_count=feature_count, truncated=truncated, source_crs=source_crs, target_crs=target_crs)

    def _extract(self, path: Path) -> Path:
        extracted = path.parent / "shapefile"
        if extracted.exists():
            shutil.rmtree(extracted)
        safe_extract_zip(path, extracted)
        return extracted


def find_shapefile_sets(root: Path) -> list[Path]:
    return sorted(root.rglob("*.shp"))


def missing_required_parts(shp: Path) -> list[str]:
    return [ext for ext in [".shp", ".shx", ".dbf"] if not shp.with_suffix(ext).exists()]
