from app.readers.cad.dgn_reader import DgnReader
from app.readers.cad.dwg_reader import DwgReader
from app.readers.cad.dxf_reader import DxfReader
from app.readers.geojson_reader import GeoJsonReader
from app.readers.kml_reader import KmlReader
from app.readers.kmz_reader import KmzReader
from app.readers.registry import ReaderRegistry
from app.readers.shapefile_reader import ShapefileReader


def build_reader_registry() -> ReaderRegistry:
    kml_reader = KmlReader()
    return ReaderRegistry(
        readers=[
            GeoJsonReader(),
            kml_reader,
            KmzReader(kml_reader),
            ShapefileReader(),
            DxfReader(),
            DwgReader(),
            DgnReader(),
        ]
    )
