from pathlib import Path

import pytest

from app.core.exceptions import UnsupportedFormatError
from app.readers.cad.dgn_reader import DgnReader
from app.readers.cad.dwg_reader import DwgReader
from app.readers.cad.dxf_reader import DxfReader
from app.readers.default_registry import build_reader_registry
from app.readers.geojson_reader import GeoJsonReader
from app.readers.kml_reader import KmlReader
from app.readers.kmz_reader import KmzReader
from app.readers.shapefile_reader import ShapefileReader


def touch(path: Path, content: str = "") -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def test_registry_resolves_supported_readers(tmp_path: Path) -> None:
    registry = build_reader_registry()
    cases = [
        (touch(tmp_path / "a.geojson", '{"type":"FeatureCollection","features":[]}'), GeoJsonReader),
        (touch(tmp_path / "a.kml", "<kml></kml>"), KmlReader),
        (touch(tmp_path / "a.kmz"), KmzReader),
        (touch(tmp_path / "a.zip"), ShapefileReader),
        (touch(tmp_path / "a.dxf"), DxfReader),
        (touch(tmp_path / "a.dwg"), DwgReader),
        (touch(tmp_path / "a.dgn"), DgnReader),
    ]
    for path, expected in cases:
        assert isinstance(registry.resolve(path), expected)


def test_registry_rejects_unknown(tmp_path: Path) -> None:
    registry = build_reader_registry()
    with pytest.raises(UnsupportedFormatError):
        registry.resolve(touch(tmp_path / "a.txt", "hello"))
