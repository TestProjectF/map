import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.core.system_properties import CAD_LAYER_PROPERTY, CAD_TYPE_PROPERTY, LEGACY_CAD_LAYER_PROPERTY, cad_property
from app.models.dataset import DatasetWarning, NormalizedDataset
from app.models.layer import GeometryType, LayerMetadata
from app.readers.base import PreviewResult
from app.readers.cad.base_cad_reader import BaseCadReader, cad_missing_crs_warning
from app.readers.geojson_reader import collect_coords, compute_bbox, properties_schema
from app.utils.vietnam_crs_heuristic import guess_vietnam_geo_cluster


Feature = dict[str, Any]
MAX_VIRTUAL_ENTITY_DEPTH = 8
CURVE_FLATTENING_DISTANCE = 0.5


class DxfReader(BaseCadReader):
    format_name = "DXF"
    supported_extensions = {".dxf"}

    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        warnings = [cad_missing_crs_warning()]
        try:
            features, extra = read_dxf_features(path, original_file_name)
        except Exception as exc:
            return NormalizedDataset(
                id=dataset_id,
                original_file_name=original_file_name,
                detected_format=self.format_name,
                source_category=self.source_category,
                readable=False,
                crs=None,
                bbox=None,
                layers=[],
                warnings=[
                    *warnings,
                    DatasetWarning(code="DXF_READ_FAILED", message="Không đọc được DXF.", severity="error"),
                ],
                extra={"readError": str(exc)},
            )

        grouped = group_features_by_cad_layer(features)
        layers = []
        for index, (name, layer_features) in enumerate(sorted(grouped.items())):
            geometry_types = {geometry_type_of(feature.get("geometry")) for feature in layer_features}
            geometry_type = next(iter(geometry_types)) if len(geometry_types) == 1 else GeometryType.MIXED
            bbox = compute_bbox(layer_features)
            layers.append(
                LayerMetadata(
                    id=f"dxf-{index}",
                    name=name,
                    geometry_type=geometry_type,
                    feature_count=len(layer_features),
                    crs=None,
                    bbox=bbox,
                    editable=True,
                    properties_schema=properties_schema(layer_features),
                    extra={CAD_LAYER_PROPERTY: name},
                )
            )

        all_coords: list[tuple[float, float]] = []
        for feature in features:
            collect_coords(feature.get("geometry"), all_coords)
        geo_suggestion_extra: dict[str, Any] = {}
        suggestion = guess_vietnam_geo_cluster(all_coords)
        if suggestion:
            geo_suggestion_extra = suggestion.to_extra_dict()
            warnings.append(
                DatasetWarning(
                    code="DXF_CRS_SUGGESTED",
                    message=(
                        f"Tự động phát hiện một cụm {suggestion.matched_point_count} điểm có toạ độ giống hệ "
                        f"VN-2000/UTM Việt Nam, gợi ý CRS nguồn là {suggestion.crs}. "
                        "Đây chỉ là suy đoán dựa trên biên độ toạ độ, hãy xác nhận lại với hồ sơ khảo sát/khung tên bản vẽ gốc trước khi dùng."
                    ),
                    severity="info",
                )
            )

        return NormalizedDataset(
            id=dataset_id,
            original_file_name=original_file_name,
            detected_format=self.format_name,
            source_category=self.source_category,
            readable=True,
            crs=None,
            bbox=compute_bbox(features),
            layers=layers,
            warnings=warnings,
            extra={
                **extra,
                "entityTypes": sorted({feature.get("properties", {}).get(CAD_TYPE_PROPERTY, "UNKNOWN") for feature in features}),
                "featureCount": len(features),
                "layerField": CAD_LAYER_PROPERTY,
                "hasLocalCoordinates": True,
                "modelSpace": True,
                **geo_suggestion_extra,
            },
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
        features, _ = read_dxf_features(path, preview_original_file_name(path))
        if layer_id:
            layer_name = layer_name_from_id(features, layer_id)
            features = [feature for feature in features if cad_layer_name(feature) == layer_name]

        features = features[:feature_limit]
        if source_crs:
            features = transform_features(features, source_crs, target_crs)

        write_feature_collection(output_path, features, source_crs, target_crs)
        return PreviewResult(
            output_path=output_path,
            feature_count=len(features),
            truncated=len(features) >= feature_limit,
            source_crs=source_crs,
            target_crs=target_crs,
        )

    def create_layer_previews(
        self,
        path: Path,
        output_paths_by_layer_id: dict[str, Path],
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> dict[str, PreviewResult]:
        features, _ = read_dxf_features(path, preview_original_file_name(path))
        grouped = group_features_by_cad_layer(features)
        layer_names_by_id = layer_names_from_grouped(grouped)

        results: dict[str, PreviewResult] = {}
        for layer_id, output_path in output_paths_by_layer_id.items():
            layer_name = layer_names_by_id.get(layer_id, layer_id)
            all_layer_features = grouped.get(layer_name, [])
            layer_features = all_layer_features[:feature_limit]
            if source_crs:
                layer_features = transform_features(layer_features, source_crs, target_crs)
            write_feature_collection(output_path, layer_features, source_crs, target_crs)
            results[layer_id] = PreviewResult(
                output_path=output_path,
                feature_count=len(layer_features),
                truncated=len(all_layer_features) > feature_limit,
                source_crs=source_crs,
                target_crs=target_crs,
            )
        return results


def read_dxf_features(path: Path, original_file_name: str) -> tuple[list[Feature], dict[str, Any]]:
    try:
        import ezdxf

        doc = ezdxf.readfile(path)
        return read_with_ezdxf(doc, original_file_name), {"dxfVersion": doc.dxfversion, "reader": "ezdxf"}
    except ModuleNotFoundError:
        return read_ascii_dxf(path, original_file_name), {"reader": "ascii-fallback"}


def preview_original_file_name(path: Path) -> str:
    source_info = path.parent / "source.json"
    try:
        payload = json.loads(source_info.read_text(encoding="utf-8"))
        original_file_name = payload.get("originalFileName")
        if isinstance(original_file_name, str) and original_file_name.strip():
            return original_file_name
    except (OSError, json.JSONDecodeError):
        pass
    return path.name


def read_with_ezdxf(doc: Any, original_file_name: str) -> list[Feature]:
    features = []
    for entity in doc.modelspace():
        features.extend(ezdxf_entity_to_features(entity, original_file_name))
    return features


def ezdxf_entity_to_features(entity: Any, original_file_name: str, parent: dict[str, Any] | None = None, depth: int = 0) -> list[Feature]:
    entity_type = entity.dxftype()
    if entity_type in {"INSERT", "DIMENSION"} and depth < MAX_VIRTUAL_ENTITY_DEPTH:
        features = []
        next_parent = virtual_parent_properties(entity, parent)
        for virtual_entity in virtual_entities(entity):
            features.extend(ezdxf_entity_to_features(virtual_entity, original_file_name, next_parent, depth + 1))
        if entity_type == "INSERT":
            for attrib in getattr(entity, "attribs", []) or []:
                feature = ezdxf_entity_to_feature(attrib, original_file_name, next_parent)
                if feature:
                    features.append(feature)
        return features

    feature = ezdxf_entity_to_feature(entity, original_file_name, parent)
    return [feature] if feature else []


def ezdxf_entity_to_feature(entity: Any, original_file_name: str, parent: dict[str, Any] | None = None) -> Feature | None:
    entity_type = entity.dxftype()
    layer = resolved_cad_layer(entity, parent)
    properties = cad_properties(entity, original_file_name, parent)
    geometry: dict[str, Any] | None = None

    if entity_type == "POINT":
        point = dxf_attr(entity, "location")
        geometry = point_geometry(point)
        properties.update(point_properties(point, "insert"))
    elif entity_type == "LINE":
        start = dxf_attr(entity, "start")
        end = dxf_attr(entity, "end")
        geometry = {"type": "LineString", "coordinates": [xy(start), xy(end)]}
        properties.update(point_properties(start, "start"))
        properties.update(point_properties(end, "end"))
    elif entity_type in {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}:
        insert = dxf_attr(entity, "insert")
        geometry = point_geometry(insert)
        text = entity.plain_text() if entity_type == "MTEXT" and hasattr(entity, "plain_text") else dxf_attr(entity, "text")
        properties.update(
            compact_props(
                {
                    cad_property("text"): text,
                    cad_property("text_height"): dxf_attr(entity, "char_height") or dxf_attr(entity, "height"),
                    cad_property("rotation"): dxf_attr(entity, "rotation"),
                    cad_property("style"): dxf_attr(entity, "style"),
                }
            )
        )
        properties.update(point_properties(insert, "insert"))
    elif entity_type == "LWPOLYLINE":
        points = [(item[0], item[1]) for item in entity.get_points("xyseb")]
        geometry = polyline_geometry(points, bool(entity.closed))
        properties[cad_property("closed")] = bool(entity.closed)
        properties[cad_property("vertices")] = [point_dict(point) for point in points]
        elevation = dxf_attr(entity, "elevation")
        if elevation is not None:
            properties[cad_property("elevation")] = float(elevation)
    elif entity_type in {"POLYLINE", "3DPOLYLINE"}:
        raw_points = [vertex.dxf.location for vertex in entity.vertices]
        points = [xy(point) for point in raw_points]
        closed = bool(getattr(entity, "is_closed", False))
        geometry = polyline_geometry(points, closed)
        properties[cad_property("closed")] = closed
        properties[cad_property("vertices")] = [point_dict(point) for point in raw_points]
    elif entity_type == "CIRCLE":
        center = dxf_attr(entity, "center")
        radius = float(dxf_attr(entity, "radius") or 0)
        geometry = circle_geometry(center, radius)
        properties[cad_property("radius")] = radius
        properties.update(point_properties(center, "center"))
    elif entity_type == "ARC":
        center = dxf_attr(entity, "center")
        radius = float(dxf_attr(entity, "radius") or 0)
        start_angle = float(dxf_attr(entity, "start_angle") or 0)
        end_angle = float(dxf_attr(entity, "end_angle") or 0)
        geometry = arc_geometry(center, radius, start_angle, end_angle)
        properties.update({cad_property("radius"): radius, cad_property("start_angle"): start_angle, cad_property("end_angle"): end_angle})
        properties.update(point_properties(center, "center"))
    elif entity_type == "ELLIPSE":
        points = flattened_curve_points(entity)
        geometry = line_geometry(points)
        properties.update(point_properties(dxf_attr(entity, "center"), "center"))
        properties[cad_property("closed")] = is_closed_entity(entity)
    elif entity_type == "SPLINE":
        points = flattened_curve_points(entity)
        geometry = line_geometry(points)
        properties[cad_property("closed")] = is_closed_entity(entity)
    elif entity_type == "HATCH":
        geometry = hatch_geometry(entity)
        properties.update(
            compact_props(
                {
                    cad_property("solid_fill"): dxf_attr(entity, "solid_fill"),
                    cad_property("pattern_name"): dxf_attr(entity, "pattern_name"),
                    cad_property("associative"): dxf_attr(entity, "associative"),
                }
            )
        )

    if not geometry:
        return None
    properties[CAD_LAYER_PROPERTY] = layer
    properties[CAD_TYPE_PROPERTY] = entity_type
    return {"type": "Feature", "properties": properties, "geometry": geometry}


def cad_properties(entity: Any, original_file_name: str, parent: dict[str, Any] | None = None) -> dict[str, Any]:
    props = compact_props(
        {
            CAD_TYPE_PROPERTY: entity.dxftype(),
            CAD_LAYER_PROPERTY: dxf_attr(entity, "layer"),
            cad_property("handle"): getattr(entity.dxf, "handle", None),
            cad_property("color"): dxf_attr(entity, "color"),
            cad_property("linetype"): dxf_attr(entity, "linetype"),
            cad_property("lineweight"): dxf_attr(entity, "lineweight"),
            cad_property("transparency"): dxf_attr(entity, "transparency"),
            cad_property("source_file"): original_file_name,
        }
    )
    if parent:
        props.update(compact_props({cad_property(f"parent_{key}"): value for key, value in parent.items()}))
    return props


def virtual_parent_properties(entity: Any, parent: dict[str, Any] | None = None) -> dict[str, Any]:
    data = {
        "type": entity.dxftype(),
        "layer": resolved_cad_layer(entity, parent),
        "raw_layer": dxf_attr(entity, "layer"),
        "handle": getattr(entity.dxf, "handle", None),
    }
    if entity.dxftype() == "INSERT":
        data["block_name"] = dxf_attr(entity, "name")
    if parent:
        for key, value in parent.items():
            data.setdefault(key, value)
    return compact_props(data)


def virtual_entities(entity: Any) -> list[Any]:
    try:
        return list(entity.virtual_entities())
    except Exception:
        return []


def resolved_cad_layer(entity: Any, parent: dict[str, Any] | None = None) -> str:
    layer = str(dxf_attr(entity, "layer") or "0")
    parent_layer = str(parent.get("layer")) if parent and parent.get("layer") else None
    if layer in {"", "0"} and parent_layer:
        return parent_layer
    return layer


def dxf_attr(entity: Any, name: str) -> Any:
    try:
        return getattr(entity.dxf, name)
    except Exception:
        return None


def read_ascii_dxf(path: Path, original_file_name: str) -> list[Feature]:
    entities: list[dict[str, Any]] = []
    in_entities = False
    current: dict[str, Any] | None = None

    def close_current() -> None:
        if current:
            entities.append(current.copy())

    pairs = iter_group_pairs(path)
    for code, value in pairs:
        if code == "2" and value == "ENTITIES":
            in_entities = True
            continue
        if not in_entities:
            continue
        if code == "0":
            if value == "ENDSEC":
                close_current()
                current = None
                in_entities = False
            else:
                close_current()
                current = {"type": value, "raw": defaultdict(list)}
            continue
        if current is None:
            continue
        current["raw"][code].append(value)

    close_current()
    return [feature for feature in (ascii_entity_to_feature(entity, original_file_name) for entity in entities) if feature]


def iter_group_pairs(path: Path) -> Iterable[tuple[str, str]]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    for index in range(0, len(lines) - 1, 2):
        yield lines[index].strip(), lines[index + 1].strip()


def ascii_entity_to_feature(entity: dict[str, Any], original_file_name: str) -> Feature | None:
    raw = entity["raw"]
    entity_type = entity["type"]
    layer = first(raw, "8", "0")
    properties = compact_props(
        {
            CAD_TYPE_PROPERTY: entity_type,
            CAD_LAYER_PROPERTY: layer,
            cad_property("handle"): first(raw, "5"),
            cad_property("color"): int_or_none(first(raw, "62")),
            cad_property("linetype"): first(raw, "6"),
            cad_property("lineweight"): int_or_none(first(raw, "370")),
            cad_property("source_file"): original_file_name,
        }
    )
    geometry = None

    if entity_type == "LINE":
        start = (float_or_none(first(raw, "10")), float_or_none(first(raw, "20")), float_or_none(first(raw, "30", "0")))
        end = (float_or_none(first(raw, "11")), float_or_none(first(raw, "21")), float_or_none(first(raw, "31", "0")))
        if None not in start[:2] and None not in end[:2]:
            geometry = {"type": "LineString", "coordinates": [[start[0], start[1]], [end[0], end[1]]]}
            properties.update(point_properties(start, "start"))
            properties.update(point_properties(end, "end"))
    elif entity_type == "POINT":
        point = (float_or_none(first(raw, "10")), float_or_none(first(raw, "20")), float_or_none(first(raw, "30", "0")))
        if None not in point[:2]:
            geometry = {"type": "Point", "coordinates": [point[0], point[1]]}
            properties.update(point_properties(point, "insert"))
    elif entity_type in {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}:
        point = (float_or_none(first(raw, "10")), float_or_none(first(raw, "20")), float_or_none(first(raw, "30", "0")))
        if None not in point[:2]:
            geometry = {"type": "Point", "coordinates": [point[0], point[1]]}
            text_parts = [*raw.get("1", []), *raw.get("3", [])]
            properties.update(
                compact_props(
                    {
                        cad_property("text"): "".join(text_parts),
                        cad_property("text_height"): float_or_none(first(raw, "40")),
                        cad_property("rotation"): float_or_none(first(raw, "50")),
                        cad_property("style"): first(raw, "7"),
                    }
                )
            )
            properties.update(point_properties(point, "insert"))

    if not geometry:
        return None
    return {"type": "Feature", "properties": properties, "geometry": geometry}


def first(raw: dict[str, list[str]], code: str, default: str | None = None) -> str | None:
    values = raw.get(code)
    return values[0] if values else default


def float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def compact_props(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def xy(point: Any) -> list[float]:
    return [float(point[0]), float(point[1])]


def point_geometry(point: Any) -> dict[str, Any]:
    return {"type": "Point", "coordinates": xy(point)}


def point_properties(point: Any, prefix: str) -> dict[str, float]:
    data = point_dict(point)
    return {cad_property(f"{prefix}_{axis}"): value for axis, value in data.items()}


def point_dict(point: Any) -> dict[str, float]:
    if point is None:
        return {}
    values = list(point)
    data = {"x": float(values[0]), "y": float(values[1])}
    if len(values) > 2 and values[2] is not None:
        data["z"] = float(values[2])
    return data


def polyline_geometry(points: list[list[float]] | list[tuple[float, float]], closed: bool) -> dict[str, Any] | None:
    if len(points) < 2:
        return None
    coords = [[float(point[0]), float(point[1])] for point in points]
    if closed:
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        if len(coords) >= 4:
            return {"type": "Polygon", "coordinates": [coords]}
    return {"type": "LineString", "coordinates": coords}


def circle_geometry(center: Any, radius: float, segments: int = 72) -> dict[str, Any]:
    cx, cy = xy(center)
    ring = [
        [cx + radius * math.cos(2 * math.pi * index / segments), cy + radius * math.sin(2 * math.pi * index / segments)]
        for index in range(segments)
    ]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def arc_geometry(center: Any, radius: float, start_angle: float, end_angle: float, segments: int = 36) -> dict[str, Any]:
    cx, cy = xy(center)
    if end_angle < start_angle:
        end_angle += 360
    steps = max(2, int(segments * (end_angle - start_angle) / 360))
    coords = []
    for index in range(steps + 1):
        angle = math.radians(start_angle + (end_angle - start_angle) * index / steps)
        coords.append([cx + radius * math.cos(angle), cy + radius * math.sin(angle)])
    return {"type": "LineString", "coordinates": coords}


def line_geometry(points: list[Any]) -> dict[str, Any] | None:
    if len(points) < 2:
        return None
    return {"type": "LineString", "coordinates": [xy(point) for point in points]}


def flattened_curve_points(entity: Any) -> list[Any]:
    try:
        return list(entity.flattening(CURVE_FLATTENING_DISTANCE))
    except Exception:
        pass
    try:
        construction_tool = entity.construction_tool()
        return list(construction_tool.flattening(CURVE_FLATTENING_DISTANCE))
    except Exception:
        return []


def is_closed_entity(entity: Any) -> bool:
    for name in ("closed", "is_closed"):
        value = getattr(entity, name, None)
        try:
            return bool(value() if callable(value) else value)
        except Exception:
            continue
    return False


def hatch_geometry(entity: Any) -> dict[str, Any] | None:
    rings = []
    for path in getattr(entity, "paths", []) or []:
        coords = hatch_path_coordinates(path)
        if len(coords) < 3:
            continue
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        if len(coords) >= 4:
            rings.append(coords)
    if not rings:
        return None
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": rings}
    return {"type": "MultiPolygon", "coordinates": [[ring] for ring in rings]}


def hatch_path_coordinates(path: Any) -> list[list[float]]:
    if hasattr(path, "vertices"):
        return [xy(point) for point in getattr(path, "vertices", []) or []]
    coords: list[list[float]] = []
    for edge in getattr(path, "edges", []) or []:
        edge_points = hatch_edge_points(edge)
        if not edge_points:
            continue
        if coords and coords[-1] == edge_points[0]:
            coords.extend(edge_points[1:])
        else:
            coords.extend(edge_points)
    return coords


def hatch_edge_points(edge: Any) -> list[list[float]]:
    edge_type = edge.__class__.__name__
    if edge_type == "LineEdge":
        return [xy(edge.start), xy(edge.end)]
    if edge_type == "ArcEdge":
        start_angle = float(getattr(edge, "start_angle", 0) or 0)
        end_angle = float(getattr(edge, "end_angle", 0) or 0)
        if not bool(getattr(edge, "ccw", True)):
            start_angle, end_angle = end_angle, start_angle
        return arc_coordinates(edge.center, float(edge.radius), start_angle, end_angle)
    if edge_type == "EllipseEdge":
        return ellipse_edge_coordinates(edge)
    if edge_type == "SplineEdge":
        return spline_edge_coordinates(edge)
    return []


def arc_coordinates(center: Any, radius: float, start_angle: float, end_angle: float, segments: int = 24) -> list[list[float]]:
    cx, cy = xy(center)
    if end_angle < start_angle:
        end_angle += 360
    steps = max(2, int(segments * (end_angle - start_angle) / 360))
    return [
        [cx + radius * math.cos(math.radians(start_angle + (end_angle - start_angle) * index / steps)), cy + radius * math.sin(math.radians(start_angle + (end_angle - start_angle) * index / steps))]
        for index in range(steps + 1)
    ]


def ellipse_edge_coordinates(edge: Any, segments: int = 36) -> list[list[float]]:
    center = xy(edge.center)
    major_axis = xy(edge.major_axis)
    ratio = float(getattr(edge, "ratio", 1) or 1)
    start_param = float(getattr(edge, "start_param", 0) or 0)
    end_param = float(getattr(edge, "end_param", 2 * math.pi) or 2 * math.pi)
    if end_param < start_param:
        end_param += 2 * math.pi
    if not bool(getattr(edge, "ccw", True)):
        start_param, end_param = end_param, start_param
    major_length = math.hypot(major_axis[0], major_axis[1])
    if major_length == 0:
        return []
    minor_axis = [-major_axis[1] * ratio, major_axis[0] * ratio]
    steps = max(8, int(segments * abs(end_param - start_param) / (2 * math.pi)))
    coords = []
    for index in range(steps + 1):
        param = start_param + (end_param - start_param) * index / steps
        coords.append(
            [
                center[0] + major_axis[0] * math.cos(param) + minor_axis[0] * math.sin(param),
                center[1] + major_axis[1] * math.cos(param) + minor_axis[1] * math.sin(param),
            ]
        )
    return coords


def spline_edge_coordinates(edge: Any) -> list[list[float]]:
    points = list(getattr(edge, "fit_points", []) or [])
    if len(points) >= 2:
        return [xy(point) for point in points]
    points = list(getattr(edge, "control_points", []) or [])
    return [xy(point) for point in points] if len(points) >= 2 else []


def geometry_type_of(geometry: dict[str, Any] | None) -> GeometryType:
    if not geometry:
        return GeometryType.UNKNOWN
    try:
        return GeometryType(geometry.get("type", "Unknown"))
    except ValueError:
        return GeometryType.UNKNOWN


def group_features_by_cad_layer(features: list[Feature]) -> dict[str, list[Feature]]:
    grouped: dict[str, list[Feature]] = defaultdict(list)
    for feature in features:
        layer = cad_layer_name(feature)
        grouped[layer].append(feature)
    return grouped


def cad_layer_name(feature: Feature) -> str:
    props = feature.get("properties", {})
    return str(props.get(CAD_LAYER_PROPERTY) or props.get(LEGACY_CAD_LAYER_PROPERTY) or "0")


def layer_name_from_id(features: list[Feature], layer_id: str) -> str:
    grouped = group_features_by_cad_layer(features)
    return layer_names_from_grouped(grouped).get(layer_id, layer_id)


def layer_names_from_grouped(grouped: dict[str, list[Feature]]) -> dict[str, str]:
    layer_names = {}
    for index, name in enumerate(sorted(grouped)):
        layer_names[f"dxf-{index}"] = name
    return layer_names


def write_feature_collection(output_path: Path, features: list[Feature], source_crs: str | None, target_crs: str) -> None:
    output = {
        "type": "FeatureCollection",
        "metadata": {
            "source_format": "DXF",
            "layer_field": CAD_LAYER_PROPERTY,
            "source_crs": source_crs,
            "target_crs": target_crs,
        },
        "features": features,
    }
    output_path.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")


def transform_features(features: list[Feature], source_crs: str, target_crs: str) -> list[Feature]:
    if source_crs.upper() == target_crs.upper():
        return features
    try:
        from pyproj import Transformer
    except ImportError:
        return features

    transformer = Transformer.from_crs(source_crs, target_crs, always_xy=True)
    return [transform_feature(feature, transformer) for feature in features]


def transform_feature(feature: Feature, transformer: Any) -> Feature:
    geometry = feature.get("geometry")
    if not geometry:
        return feature
    return {
        **feature,
        "geometry": {
            **geometry,
            "coordinates": transform_coordinates(geometry.get("coordinates"), transformer),
        },
    }


def transform_coordinates(value: Any, transformer: Any) -> Any:
    if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        x, y = transformer.transform(value[0], value[1])
        return [x, y, *value[2:]]
    if isinstance(value, list):
        return [transform_coordinates(item, transformer) for item in value]
    return value
