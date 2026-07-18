import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

from app.core.config import DEFAULT_TARGET_CRS, MAX_PREVIEW_FEATURES
from app.core.exceptions import InvalidDatasetError
from app.models.dataset import DatasetWarning, NormalizedDataset, SourceCategory
from app.readers.base import DatasetReader, PreviewResult
from app.readers.kml_reader import KmlReader
from app.utils.archive import safe_extract_zip


class KmzReader(DatasetReader):
    format_name = "KMZ"
    source_category = SourceCategory.GIS
    supported_extensions = {".kmz"}
    RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".gif", ".bmp"}

    def __init__(self, kml_reader: KmlReader | None = None):
        self.kml_reader = kml_reader or KmlReader()

    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        kml_path, extracted, warnings, raster_files, raster_overlays = self._extract_and_find_kml(path)
        try:
            dataset = self.kml_reader.inspect(kml_path, dataset_id, original_file_name)
        except Exception:
            shutil.rmtree(extracted, ignore_errors=True)
            raise
        dataset.detected_format = self.format_name
        dataset.warnings.extend(warnings)
        dataset.extra["mainKml"] = str(kml_path.relative_to(extracted))
        if raster_files or raster_overlays:
            dataset.extra["hasRaster"] = True
            if raster_files:
                dataset.extra["rasterFiles"] = [str(f.relative_to(extracted)) for f in raster_files]
            if raster_overlays:
                dataset.extra["rasterOverlays"] = raster_overlays
            dataset.warnings = [w for w in dataset.warnings if w.code != "KML_GROUND_OVERLAY_UNSUPPORTED"]
        return dataset

    def create_preview(
        self,
        path: Path,
        output_path: Path,
        layer_id: str | None,
        source_crs: str | None,
        target_crs: str = DEFAULT_TARGET_CRS,
        feature_limit: int = MAX_PREVIEW_FEATURES,
    ) -> PreviewResult:
        kml_path, _extracted, _, _raster_files, _overlays = self._extract_and_find_kml(path)

        return self.kml_reader.create_preview(kml_path, output_path, layer_id, source_crs or DEFAULT_TARGET_CRS, target_crs, feature_limit)

    def _extract_and_find_kml(self, path: Path) -> tuple[Path, Path, list[DatasetWarning], list[Path], list[dict[str, object]]]:
        extracted = path.parent / "kmz"
        if extracted.exists():
            shutil.rmtree(extracted)
        paths = safe_extract_zip(path, extracted)
        kmls = [item for item in paths if item.suffix.lower() == ".kml"]
        if not kmls:
            shutil.rmtree(extracted, ignore_errors=True)
            raise InvalidDatasetError("KMZ không chứa file .kml.")
        doc_kml = [item for item in kmls if item.name.lower() == "doc.kml"]
        selected = doc_kml[0] if doc_kml else sorted(kmls)[0]
        warnings: list[DatasetWarning] = []
        if len(kmls) > 1:
            warnings.append(DatasetWarning(code="KMZ_MULTIPLE_KML", message="KMZ chứa nhiều file KML; bản demo ưu tiên doc.kml hoặc file KML đầu tiên."))
        raster_files = [item for item in paths if item.suffix.lower() in self.RASTER_EXTENSIONS]
        raster_overlays = self._parse_ground_overlays(selected)
        return selected, extracted, warnings, raster_files, raster_overlays

    def _parse_ground_overlays(self, kml_path: Path) -> list[dict[str, object]]:
        try:
            root = ET.fromstring(kml_path.read_text(encoding="utf-8", errors="ignore"))
        except ET.ParseError:
            return []

        parent_by_child = {child: parent for parent in root.iter() for child in parent}
        overlays: list[dict[str, object]] = []
        for overlay in root.findall(".//{*}GroundOverlay"):
            href = overlay.findtext(".//{*}href")
            if not href:
                continue
            latlon = overlay.find(".//{*}LatLonBox")
            if latlon is None:
                continue
            try:
                north = float(latlon.findtext("{*}north", "nan"))
                south = float(latlon.findtext("{*}south", "nan"))
                east = float(latlon.findtext("{*}east", "nan"))
                west = float(latlon.findtext("{*}west", "nan"))
            except ValueError:
                continue
            if any(map(lambda v: not isinstance(v, float) or v != v, [north, south, east, west])):
                continue
            parent = parent_by_child.get(overlay)
            max_lod_text = parent.findtext("./{*}Region/{*}Lod/{*}maxLodPixels") if parent is not None else None
            try:
                max_lod_pixels = int(max_lod_text) if max_lod_text is not None else None
            except ValueError:
                max_lod_pixels = None
            overlays.append({
                "href": href.strip(),
                "extent": [west, south, east, north],
                "maxLodPixels": max_lod_pixels,
            })

        # Raster pyramids repeat the same area at multiple resolutions. A
        # maxLodPixels of -1 identifies leaf tiles, which remain visible at the
        # highest zoom. Loading parent and leaf tiles together duplicates the
        # imagery and creates hundreds of overlapping browser layers.
        leaf_overlays = [overlay for overlay in overlays if overlay["maxLodPixels"] == -1]
        return leaf_overlays or overlays
