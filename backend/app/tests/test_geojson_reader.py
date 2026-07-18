import json
from pathlib import Path

import pytest

from app.core.exceptions import InvalidDatasetError
from app.core.system_properties import APP_SOURCE_LAYER_KIND_PROPERTY, APP_SOURCE_LAYER_PROPERTY, CAD_LAYER_PROPERTY
from app.models.layer import GeometryType
from app.readers.geojson_reader import GeoJsonReader


def write_json(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_geojson_feature_collection(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "data.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "A", "height": 1}, "geometry": {"type": "Point", "coordinates": [105, 21]}},
            ],
        },
    )
    dataset = GeoJsonReader().inspect(path, "file-id", "data.geojson")
    assert dataset.readable is True
    assert dataset.layers[0].feature_count == 1
    assert dataset.layers[0].geometry_type == GeometryType.POINT
    assert dataset.bbox == [105.0, 21.0, 105.0, 21.0]
    assert dataset.layers[0].properties_schema == {"name": "str", "height": "int"}
    assert dataset.warnings[0].code == "GEOJSON_DEFAULT_CRS"


def test_geojson_invalid_json(tmp_path: Path) -> None:
    path = tmp_path / "bad.geojson"
    path.write_text("{bad", encoding="utf-8")
    with pytest.raises(InvalidDatasetError):
        GeoJsonReader().inspect(path, "file-id", "bad.geojson")


def test_geojson_mixed_geometry(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "mixed.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [0, 0]}},
                {"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
            ],
        },
    )
    dataset = GeoJsonReader().inspect(path, "file-id", "mixed.geojson")
    assert dataset.layers[0].geometry_type == GeometryType.MIXED
    assert dataset.bbox == [0.0, 0.0, 1.0, 1.0]


def test_geojson_restores_layers_from_map_cad_layer_property(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "cad-export.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {CAD_LAYER_PROPERTY: "Bridge"}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
                {"type": "Feature", "properties": {CAD_LAYER_PROPERTY: "Labels"}, "geometry": {"type": "Point", "coordinates": [2, 2]}},
            ],
        },
    )
    dataset = GeoJsonReader().inspect(path, "file-id", "cad-export.geojson")
    assert [layer.name for layer in dataset.layers] == ["Bridge", "Labels"]
    assert dataset.extra["restoredLayerField"] == CAD_LAYER_PROPERTY

    result = GeoJsonReader().create_preview(path, tmp_path / "preview.geojson", "geojson-0", None)
    assert result.feature_count == 1
    payload = json.loads((tmp_path / "preview.geojson").read_text(encoding="utf-8"))
    assert payload["features"][0]["properties"][CAD_LAYER_PROPERTY] == "Bridge"


def test_geojson_restores_legacy_layers_from_cad_layer_property(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "legacy-cad-export.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"CAD_layer": "Bridge"}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
                {"type": "Feature", "properties": {"CAD_layer": "Labels"}, "geometry": {"type": "Point", "coordinates": [2, 2]}},
            ],
        },
    )
    dataset = GeoJsonReader().inspect(path, "file-id", "legacy-cad-export.geojson")
    assert [layer.name for layer in dataset.layers] == ["Bridge", "Labels"]
    assert dataset.extra["restoredLayerField"] == "CAD_layer"


def test_geojson_restores_merged_export_layers_from_map_source_layer(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "merged-export.geojson",
        {
            "type": "FeatureCollection",
            "metadata": {"layerField": APP_SOURCE_LAYER_PROPERTY},
            "features": [
                {
                    "type": "Feature",
                    "properties": {APP_SOURCE_LAYER_PROPERTY: "Bridge", APP_SOURCE_LAYER_KIND_PROPERTY: "uploaded", CAD_LAYER_PROPERTY: "Bridge"},
                    "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
                },
                {
                    "type": "Feature",
                    "properties": {APP_SOURCE_LAYER_PROPERTY: "Sketch layer", APP_SOURCE_LAYER_KIND_PROPERTY: "drawing"},
                    "geometry": {"type": "Point", "coordinates": [2, 2]},
                },
            ],
        },
    )
    dataset = GeoJsonReader().inspect(path, "file-id", "merged-export.geojson")
    assert [layer.name for layer in dataset.layers] == ["Bridge", "Sketch layer"]
    assert dataset.extra["restoredLayerField"] == APP_SOURCE_LAYER_PROPERTY

    result = GeoJsonReader().create_preview(path, tmp_path / "preview.geojson", "geojson-1", None)
    assert result.feature_count == 1
    payload = json.loads((tmp_path / "preview.geojson").read_text(encoding="utf-8"))
    assert payload["features"][0]["properties"][APP_SOURCE_LAYER_PROPERTY] == "Sketch layer"


def test_geojson_restores_legacy_merged_export_layers_from_source_layer(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "legacy-merged-export.geojson",
        {
            "type": "FeatureCollection",
            "metadata": {"layerField": "sourceLayer"},
            "features": [
                {"type": "Feature", "properties": {"sourceLayer": "Bridge", "CAD_layer": "Bridge"}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
                {"type": "Feature", "properties": {"sourceLayer": "Sketch layer", "sourceLayerKind": "drawing"}, "geometry": {"type": "Point", "coordinates": [2, 2]}},
            ],
        },
    )
    dataset = GeoJsonReader().inspect(path, "file-id", "legacy-merged-export.geojson")
    assert [layer.name for layer in dataset.layers] == ["Bridge", "Sketch layer"]
    assert dataset.extra["restoredLayerField"] == "sourceLayer"
