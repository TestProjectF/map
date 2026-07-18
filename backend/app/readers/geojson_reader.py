import json
import shutil
from pathlib import Path
from typing import Any

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.core.exceptions import InvalidDatasetError
from app.core.system_properties import RESTORE_LAYER_FIELDS
from app.models.dataset import DatasetWarning, NormalizedDataset, SourceCategory
from app.models.layer import GeometryType, LayerMetadata
from app.readers.base import DatasetReader, PreviewResult
from app.utils.gdal import ogr_to_geojson


class GeoJsonReader(DatasetReader):
    format_name = "GeoJSON"
    source_category = SourceCategory.GIS
    supported_extensions = {".geojson", ".json"}

    def can_read(self, path: Path) -> bool:
        if path.suffix.lower() not in self.supported_extensions:
            return False
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False
        return payload.get("type") in {"FeatureCollection", "Feature", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"}

    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise InvalidDatasetError("GeoJSON không phải JSON hợp lệ.") from exc

        features = normalize_geojson_features(payload)
        bbox = payload.get("bbox") if isinstance(payload.get("bbox"), list) and len(payload["bbox"]) >= 4 else compute_bbox(features)
        crs = read_geojson_crs(payload)
        warnings: list[DatasetWarning] = []
        if not crs:
            crs = "EPSG:4326"
            warnings.append(
                DatasetWarning(
                    code="GEOJSON_DEFAULT_CRS",
                    message="GeoJSON hiện đại thường mặc định là EPSG:4326 khi không khai báo CRS.",
                    severity="info",
                )
            )
        layer_field = restore_layer_field(features)
        if layer_field:  #  Check if geojson come from export from CAD (uploaded - dxf then export - geojson)  to restore the layer
            grouped = group_features_by_property(features, layer_field)
            layers = [
                LayerMetadata(
                    id=f"geojson-{index}",
                    name=name,
                    geometry_type=features_geometry_type(layer_features),
                    feature_count=len(layer_features),
                    crs=crs,
                    bbox=compute_bbox(layer_features),
                    properties_schema=properties_schema(layer_features),
                    extra={"restoredLayerField": layer_field, "restoredLayerValue": name},
                )
                for index, (name, layer_features) in enumerate(sorted(grouped.items()))
            ]
        else:
            layers = [
                LayerMetadata(
                    id="geojson-0",
                    name=Path(original_file_name).stem,
                    geometry_type=features_geometry_type(features),
                    feature_count=len(features),
                    crs=crs,
                    bbox=bbox,
                    properties_schema=properties_schema(features),
                )
            ]
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
            extra={"restoredLayerField": layer_field} if layer_field else {},
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
        source_crs = source_crs or "EPSG:4326"
        payload = json.loads(path.read_text(encoding="utf-8"))
        features = normalize_geojson_features(payload)
        layer_field = restore_layer_field(features)
        if layer_id and layer_field:
            layer_value = layer_value_from_id(features, layer_field, layer_id)
            features = [feature for feature in features if str((feature.get("properties") or {}).get(layer_field)) == layer_value]
        if source_crs.upper() == target_crs.upper():
            original_count = len(features)
            features = features[:feature_limit]
            output = {"type": "FeatureCollection", "features": features}
            output_path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
            feature_count = len(features)
            truncated = original_count > feature_limit
        else:
            transform_source = path
            if layer_id and layer_field:
                transform_source = output_path.with_name(f"{output_path.stem}-source.geojson")
                transform_source.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
            feature_count, truncated = ogr_to_geojson(transform_source, output_path, None, source_crs, target_crs, feature_limit)
        return PreviewResult(output_path=output_path, feature_count=feature_count, truncated=truncated, source_crs=source_crs, target_crs=target_crs)


def normalize_geojson_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    payload_type = payload.get("type")
    if payload_type == "FeatureCollection":
        features = payload.get("features")
        if not isinstance(features, list):
            raise InvalidDatasetError("FeatureCollection thiếu danh sách features.")
        return features
    if payload_type == "Feature":
        return [payload]
    if payload_type in {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"}:
        return [{"type": "Feature", "properties": {}, "geometry": payload}]
    raise InvalidDatasetError("GeoJSON phải là FeatureCollection, Feature hoặc geometry hợp lệ.")


def geometry_type_of(geometry: dict[str, Any] | None) -> GeometryType:
    if not geometry:
        return GeometryType.UNKNOWN
    try:
        return GeometryType(geometry.get("type", "Unknown"))
    except ValueError:
        return GeometryType.UNKNOWN


def features_geometry_type(features: list[dict[str, Any]]) -> GeometryType:
    geometry_types = {geometry_type_of(feature.get("geometry")) for feature in features}
    return next(iter(geometry_types)) if len(geometry_types) == 1 else GeometryType.MIXED


def restore_layer_field(features: list[dict[str, Any]]) -> str | None:
    for field in RESTORE_LAYER_FIELDS:
        if any(isinstance(feature.get("properties"), dict) and feature["properties"].get(field) for feature in features):
            return field
    return None


def group_features_by_property(features: list[dict[str, Any]], field: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for feature in features:
        props = feature.get("properties") or {}
        value = str(props.get(field) or "Unknown")
        grouped.setdefault(value, []).append(feature)
    return grouped


def layer_value_from_id(features: list[dict[str, Any]], field: str, layer_id: str) -> str:
    grouped = group_features_by_property(features, field)
    for index, name in enumerate(sorted(grouped)):
        if f"geojson-{index}" == layer_id:
            return name
    return layer_id


def read_geojson_crs(payload: dict[str, Any]) -> str | None:
    crs = payload.get("crs")
    if isinstance(crs, dict):
        props = crs.get("properties", {})
        name = props.get("name")
        return name if isinstance(name, str) else None
    return None


def properties_schema(features: list[dict[str, Any]]) -> dict[str, str]:
    schema: dict[str, str] = {}
    for feature in features:
        props = feature.get("properties") or {}
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            schema.setdefault(key, type(value).__name__)
    return schema


def compute_bbox(features: list[dict[str, Any]]) -> list[float] | None:
    coords: list[tuple[float, float]] = []
    for feature in features:
        collect_coords(feature.get("geometry"), coords)
    if not coords:
        return None
    xs = [coord[0] for coord in coords]
    ys = [coord[1] for coord in coords]
    return [min(xs), min(ys), max(xs), max(ys)]


def collect_coords(geometry: dict[str, Any] | None, coords: list[tuple[float, float]]) -> None:
    if not geometry:
        return
    raw = geometry.get("coordinates")
    if raw is not None:
        walk_coordinates(raw, coords)
    for child in geometry.get("geometries", []) or []:
        collect_coords(child, coords)


def walk_coordinates(value: Any, coords: list[tuple[float, float]]) -> None:
    if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        coords.append((float(value[0]), float(value[1])))
        return
    if isinstance(value, list):
        for item in value:
            walk_coordinates(item, coords)
