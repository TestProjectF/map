import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.system_properties import CAD_LAYER_PROPERTY, CAD_TYPE_PROPERTY, cad_property
from app.core.exceptions import InvalidDatasetError, UnsafeArchiveError
from app.readers.cad.dgn_reader import DgnReader
from app.readers.cad.dwg_reader import DwgReader
from app.readers.cad.dxf_reader import DxfReader, read_with_ezdxf
from app.readers.kmz_reader import KmzReader
from app.readers.shapefile_reader import ShapefileReader, missing_required_parts
from app.utils.archive import MAX_ARCHIVE_FILES, safe_extract_zip


def make_zip(path: Path, files: dict[str, bytes]) -> Path:
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return path


class FakeEntity:
    def __init__(self, entity_type: str, **attrs: object):
        self._entity_type = entity_type
        self.dxf = SimpleNamespace(**attrs)
        self.attribs = attrs.get("attribs", [])
        self.paths = attrs.get("paths", [])
        self._virtual_entities = attrs.get("virtual_entities", [])

    def dxftype(self) -> str:
        return self._entity_type

    def virtual_entities(self) -> list["FakeEntity"]:
        return list(self._virtual_entities)


class FakeDoc:
    def __init__(self, entities: list[FakeEntity]):
        self._entities = entities

    def modelspace(self) -> list[FakeEntity]:
        return self._entities


class LineEdge:
    def __init__(self, start: tuple[float, float], end: tuple[float, float]):
        self.start = start
        self.end = end


def test_zip_path_traversal(tmp_path: Path) -> None:
    archive = make_zip(tmp_path / "bad.zip", {"../evil.txt": b"no"})
    with pytest.raises(UnsafeArchiveError):
        safe_extract_zip(archive, tmp_path / "out")


def test_zip_too_many_files(tmp_path: Path) -> None:
    archive = make_zip(tmp_path / "many.zip", {f"{i}.txt": b"x" for i in range(MAX_ARCHIVE_FILES + 1)})
    with pytest.raises(UnsafeArchiveError):
        safe_extract_zip(archive, tmp_path / "out")


def test_kmz_without_kml(tmp_path: Path) -> None:
    kmz = make_zip(tmp_path / "data.kmz", {"image.png": b"fake"})
    with pytest.raises(InvalidDatasetError):
        KmzReader().inspect(kmz, "file-id", "data.kmz")


def test_kmz_raster_pyramid_keeps_only_leaf_overlays(tmp_path: Path) -> None:
    kml = tmp_path / "doc.kml"
    kml.write_text(
        """<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Folder><Region><Lod><maxLodPixels>2049</maxLodPixels></Lod></Region>
          <GroundOverlay><Icon><href>parent.png</href></Icon><LatLonBox>
            <north>2</north><south>0</south><east>2</east><west>0</west>
          </LatLonBox></GroundOverlay>
        </Folder>
        <Folder><Region><Lod><maxLodPixels>-1</maxLodPixels></Lod></Region>
          <GroundOverlay><Icon><href>leaf.png</href></Icon><LatLonBox>
            <north>1</north><south>0</south><east>1</east><west>0</west>
          </LatLonBox></GroundOverlay>
        </Folder>
        </Document></kml>""",
        encoding="utf-8",
    )

    assert KmzReader()._parse_ground_overlays(kml) == [
        {"href": "leaf.png", "extent": [0.0, 0.0, 1.0, 1.0], "maxLodPixels": -1}
    ]


def test_shapefile_missing_dbf(tmp_path: Path) -> None:
    shp = tmp_path / "roads.shp"
    shp.write_bytes(b"fake")
    shp.with_suffix(".shx").write_bytes(b"fake")
    assert missing_required_parts(shp) == [".dbf"]


def test_shapefile_missing_prj_warning_or_invalid_parts(tmp_path: Path) -> None:
    archive = make_zip(
        tmp_path / "shape.zip",
        {
            "roads.shp": b"fake",
            "roads.shx": b"fake",
            "roads.dbf": b"fake",
        },
    )
    try:
        ShapefileReader().inspect(archive, "file-id", "shape.zip")
    except InvalidDatasetError as exc:
        assert "GDAL" in exc.message or "đọc" in exc.message or "dataset" in exc.message


def test_dwg_signature_and_unreadable(tmp_path: Path) -> None:
    path = tmp_path / "drawing.dwg"
    path.write_bytes(b"AC1032rest")
    dataset = DwgReader().inspect(path, "file-id", "drawing.dwg")
    assert dataset.readable is False
    assert dataset.layers == []
    assert dataset.extra["dwgSignature"] == "AC1032"
    assert dataset.warnings[0].code == "CAD_READER_NOT_IMPLEMENTED"


def test_dgn_not_implemented(tmp_path: Path) -> None:
    path = tmp_path / "drawing.dgn"
    path.write_bytes(b"fake")
    dataset = DgnReader().inspect(path, "file-id", "drawing.dgn")
    assert dataset.readable is False
    assert dataset.layers == []
    assert dataset.warnings[0].code == "CAD_READER_NOT_IMPLEMENTED"


def test_dxf_missing_crs_and_preview_geojson(tmp_path: Path) -> None:
    path = tmp_path / "drawing.dxf"
    path.write_text(
        "0\nSECTION\n2\nENTITIES\n"
        "0\nLINE\n8\nBridge\n10\n0\n20\n0\n30\n1\n11\n1\n21\n1\n31\n2\n"
        "0\nTEXT\n8\nLabels\n10\n2\n20\n3\n30\n0\n40\n1.5\n1\nHello\n50\n30\n"
        "0\nENDSEC\n0\nEOF\n",
        encoding="utf-8",
    )
    dataset = DxfReader().inspect(path, "file-id", "drawing.dxf")
    assert any(warning.code == "CRS_REQUIRED" for warning in dataset.warnings)
    assert [layer.name for layer in dataset.layers] == ["Bridge", "Labels"]
    result = DxfReader().create_preview(path, tmp_path / "preview.geojson", "dxf-1", None)
    assert result.feature_count == 1
    payload = (tmp_path / "preview.geojson").read_text(encoding="utf-8")
    assert f'"{CAD_LAYER_PROPERTY}": "Labels"' in payload
    assert '"type": "Point"' in payload


def test_dxf_preview_keeps_original_upload_file_name(tmp_path: Path) -> None:
    path = tmp_path / "source.dxf"
    path.write_text(
        "0\nSECTION\n2\nENTITIES\n"
        "0\nLINE\n8\nRoad\n10\n0\n20\n0\n11\n1\n21\n1\n"
        "0\nENDSEC\n0\nEOF\n",
        encoding="utf-8",
    )
    (tmp_path / "source.json").write_text(
        '{"originalFileName":"civil_example-imperial.dxf"}',
        encoding="utf-8",
    )

    DxfReader().create_preview(path, tmp_path / "preview.geojson", None, None)

    payload = (tmp_path / "preview.geojson").read_text(encoding="utf-8")
    assert '"MAP_CAD_source_file": "civil_example-imperial.dxf"' in payload


def test_dxf_explodes_insert_and_keeps_resolved_cad_layers() -> None:
    line = FakeEntity("LINE", layer="0", start=(0, 0, 0), end=(1, 1, 0), handle="LINE1")
    attrib = FakeEntity("ATTRIB", layer="0", insert=(2, 3, 0), text="A1", height=1.2, handle="ATTR1")
    insert = FakeEntity("INSERT", layer="BlockLayer", name="BlockA", handle="INS1", virtual_entities=[line], attribs=[attrib])

    features = read_with_ezdxf(FakeDoc([insert]), "drawing.dxf")

    assert [feature["properties"][CAD_TYPE_PROPERTY] for feature in features] == ["LINE", "ATTRIB"]
    assert {feature["properties"][CAD_LAYER_PROPERTY] for feature in features} == {"BlockLayer"}
    assert features[0]["properties"][cad_property("parent_type")] == "INSERT"
    assert features[0]["properties"][cad_property("parent_block_name")] == "BlockA"
    assert features[1]["properties"][cad_property("text")] == "A1"


def test_dxf_dimension_uses_virtual_entities() -> None:
    dim_line = FakeEntity("LINE", layer="DimParts", start=(0, 0, 0), end=(4, 0, 0), handle="L1")
    dimension = FakeEntity("DIMENSION", layer="Dims", handle="D1", virtual_entities=[dim_line])

    features = read_with_ezdxf(FakeDoc([dimension]), "drawing.dxf")

    assert len(features) == 1
    assert features[0]["properties"][CAD_LAYER_PROPERTY] == "DimParts"
    assert features[0]["properties"][cad_property("parent_type")] == "DIMENSION"


def test_dxf_hatch_boundary_becomes_polygon() -> None:
    path = SimpleNamespace(
        edges=[
            LineEdge((0, 0), (1, 0)),
            LineEdge((1, 0), (1, 1)),
            LineEdge((1, 1), (0, 1)),
            LineEdge((0, 1), (0, 0)),
        ]
    )
    hatch = FakeEntity("HATCH", layer="HatchLayer", paths=[path], solid_fill=1, pattern_name="SOLID", handle="H1")

    features = read_with_ezdxf(FakeDoc([hatch]), "drawing.dxf")

    assert features[0]["geometry"]["type"] == "Polygon"
    assert features[0]["properties"][CAD_LAYER_PROPERTY] == "HatchLayer"
    assert features[0]["properties"][CAD_TYPE_PROPERTY] == "HATCH"
