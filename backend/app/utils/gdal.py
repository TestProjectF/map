import json
import subprocess
from pathlib import Path
from typing import Any

from app.core.exceptions import ConversionError, InvalidDatasetError
from app.models.layer import GeometryType, LayerMetadata


def ogr_module():
    try:
        from osgeo import ogr
    except ImportError as exc:
        raise InvalidDatasetError("Không tìm thấy GDAL Python bindings.") from exc
    return ogr


def inspect_ogr_dataset(path: Path, layer_id_prefix: str = "layer") -> tuple[list[LayerMetadata], str | None, list[float] | None]:
    ogr = ogr_module()
    ds = ogr.Open(str(path))
    if ds is None:
        raise InvalidDatasetError("GDAL/OGR không đọc được dataset.", {"path": str(path)})

    layers: list[LayerMetadata] = []
    dataset_crs: str | None = None
    dataset_bbox: list[float] | None = None
    for index in range(ds.GetLayerCount()):
        layer = ds.GetLayerByIndex(index)
        spatial_ref = layer.GetSpatialRef()
        crs = spatial_ref_to_string(spatial_ref)
        if crs and not dataset_crs:
            dataset_crs = crs
        extent = layer.GetExtent(can_return_null=True)
        bbox = [extent[0], extent[2], extent[1], extent[3]] if extent else None
        dataset_bbox = merge_bbox(dataset_bbox, bbox)
        layers.append(
            LayerMetadata(
                id=f"{layer_id_prefix}-{index}",
                name=layer.GetName(),
                geometry_type=map_ogr_geometry_type(layer.GetGeomType()),
                feature_count=layer.GetFeatureCount(),
                crs=crs,
                bbox=bbox,
                properties_schema=read_properties_schema(layer),
            )
        )
    return layers, dataset_crs, dataset_bbox


def ogr_to_geojson(
    source_path: Path,
    output_path: Path,
    layer_name: str | None,
    source_crs: str | None,
    target_crs: str,
    feature_limit: int,
) -> tuple[int, bool]:
    if output_path.exists():
        output_path.unlink()

    args = [
        "ogr2ogr",
        "-f",
        "GeoJSON",
        str(output_path),
        str(source_path),
        "-t_srs",
        target_crs,
        "-limit",
        str(feature_limit),
    ]
    if source_crs:
        args.extend(["-s_srs", source_crs])
    if layer_name:
        args.append(layer_name)

    try:
        subprocess.run(args, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise ConversionError("Không tìm thấy ogr2ogr. Hãy cài GDAL.") from exc
    except subprocess.CalledProcessError as exc:
        raise ConversionError(exc.stderr.strip() or "GDAL convert thất bại.") from exc

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    feature_count = len(payload.get("features", []))
    return feature_count, feature_count >= feature_limit


def gdal_translate_to_cog(
    source_path: Path | str,
    output_path: Path,
    outsize: str = "8192 0",
) -> None:
    if output_path.exists():
        output_path.unlink()

    args = [
        "gdal_translate",
        "-of",
        "COG",
        "-co",
        "COMPRESS=LZW",
        "-outsize",
        *outsize.split(),
        str(source_path),
        str(output_path),
    ]

    try:
        subprocess.run(args, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise ConversionError("Không tìm thấy gdal_translate. Hãy cài GDAL.") from exc
    except subprocess.CalledProcessError as exc:
        raise ConversionError(exc.stderr.strip() or "GDAL translate thất bại.") from exc


def spatial_ref_to_string(spatial_ref: Any) -> str | None:
    if not spatial_ref:
        return None
    code = spatial_ref.GetAuthorityCode(None)
    name = spatial_ref.GetAuthorityName(None)
    if name and code:
        return f"{name}:{code}"
    return spatial_ref.ExportToWkt() or None


def map_ogr_geometry_type(ogr_type: int) -> GeometryType:
    ogr = ogr_module()
    flat = ogr.GT_Flatten(ogr_type)
    mapping = {
        ogr.wkbPoint: GeometryType.POINT,
        ogr.wkbMultiPoint: GeometryType.MULTI_POINT,
        ogr.wkbLineString: GeometryType.LINE_STRING,
        ogr.wkbMultiLineString: GeometryType.MULTI_LINE_STRING,
        ogr.wkbPolygon: GeometryType.POLYGON,
        ogr.wkbMultiPolygon: GeometryType.MULTI_POLYGON,
        ogr.wkbGeometryCollection: GeometryType.MIXED,
    }
    return mapping.get(flat, GeometryType.UNKNOWN)


def read_properties_schema(layer: Any) -> dict[str, str]:
    schema: dict[str, str] = {}
    definition = layer.GetLayerDefn()
    for index in range(definition.GetFieldCount()):
        field = definition.GetFieldDefn(index)
        schema[field.GetName()] = field.GetFieldTypeName(field.GetType())
    return schema


def merge_bbox(a: list[float] | None, b: list[float] | None) -> list[float] | None:
    if a is None:
        return b
    if b is None:
        return a
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
