from pathlib import Path

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.core.exceptions import InvalidDatasetError
from app.readers.base import PreviewResult
from app.readers.default_registry import build_reader_registry
from app.readers.registry import ReaderRegistry
from app.services.dataset_service import DatasetService
from app.utils.filesystem import get_job_dir


class PreviewService:
    def __init__(self, registry: ReaderRegistry | None = None, dataset_service: DatasetService | None = None):
        self.registry = registry or build_reader_registry()
        self.dataset_service = dataset_service or DatasetService(self.registry)

    def create_preview(
        self,
        file_id: str,
        layer_id: str | None,
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> PreviewResult:
        dataset = self.dataset_service.get_dataset(file_id)
        if not dataset.readable:
            raise InvalidDatasetError("Dataset này không thể preview trong bản demo.")
        layer = next((item for item in dataset.layers if item.id == layer_id), dataset.layers[0] if dataset.layers else None)
        if layer and dataset.source_category != "cad" and not (source_crs or layer.crs or dataset.crs):
            raise InvalidDatasetError("Dataset thiếu CRS. Hãy nhập CRS nguồn trước khi tạo preview.", {"code": "CRS_REQUIRED"})
        source_path = self.dataset_service.get_source_path(file_id)
        reader = self.registry.resolve(source_path)
        output_path = get_job_dir(file_id) / "preview.geojson"
        return reader.create_preview(
            source_path,
            output_path,
            layer_id,
            source_crs or (layer.crs if layer else None) or dataset.crs,
            target_crs,
            feature_limit,
        )

    def create_layer_previews(
        self,
        file_id: str,
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> list[dict]:
        dataset = self.dataset_service.get_dataset(file_id)
        if not dataset.readable:
            raise InvalidDatasetError("Dataset này không thể preview trong bản demo.")
        source_path = self.dataset_service.get_source_path(file_id)
        reader = self.registry.resolve(source_path)
        previews_dir = get_job_dir(file_id) / "previews"
        previews_dir.mkdir(parents=True, exist_ok=True)

        results = []
        layers = dataset.layers or []
        output_names_by_layer_id = {
            layer.id: f"{layer.id or f'layer-{index}'}.geojson"
            for index, layer in enumerate(layers)
        }
        batch_preview = getattr(reader, "create_layer_previews", None)
        if callable(batch_preview):
            output_paths_by_layer_id = {
                layer_id: previews_dir / output_name
                for layer_id, output_name in output_names_by_layer_id.items()
                if layer_id is not None
            }
            preview_results = batch_preview(source_path, output_paths_by_layer_id, source_crs or dataset.crs, target_crs, feature_limit)
            for layer in layers:
                if layer.id is None:
                    continue
                result = preview_results[layer.id]
                results.append(
                    {
                        "layerId": layer.id,
                        "layerName": layer.name,
                        "previewUrl": f"/api/files/{file_id}/previews/{output_names_by_layer_id[layer.id]}",
                        "sourceCrs": result.source_crs,
                        "targetCrs": result.target_crs,
                        "featureCount": result.feature_count,
                        "truncated": result.truncated,
                    }
                )
            return results

        for index, layer in enumerate(layers):
            if dataset.source_category != "cad" and not (source_crs or layer.crs or dataset.crs):
                raise InvalidDatasetError("Dataset thiếu CRS. Hãy nhập CRS nguồn trước khi tạo preview.", {"code": "CRS_REQUIRED"})
            output_name = output_names_by_layer_id[layer.id]
            output_path = previews_dir / output_name
            result = reader.create_preview(
                source_path,
                output_path,
                layer.id,
                source_crs or layer.crs or dataset.crs,
                target_crs,
                feature_limit,
            )
            results.append(
                {
                    "layerId": layer.id,
                    "layerName": layer.name,
                    "previewUrl": f"/api/files/{file_id}/previews/{output_name}",
                    "sourceCrs": result.source_crs,
                    "targetCrs": result.target_crs,
                    "featureCount": result.feature_count,
                    "truncated": result.truncated,
                }
            )
        return results
