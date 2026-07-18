import shutil
from pathlib import Path

from app.models.dataset import DatasetWarning, NormalizedDataset
from app.readers.base import PreviewResult
from app.readers.cad.base_cad_reader import BaseCadReader
from app.readers.cad.dxf_reader import DxfReader
from app.utils.filesystem import get_job_dir
from app.utils.oda import convert_to_dxf


class DgnReader(BaseCadReader):
    format_name = "DGN"
    supported_extensions = {".dgn"}

    def can_read(self, path: Path) -> bool:
        return path.suffix.lower() == ".dgn"

    def _get_or_create_dxf(self, path: Path, dataset_id: str) -> Path | None:
        """Sử dụng ODA File Converter để tạo ra file DXF tạm trong thư mục job."""
        job_dir = get_job_dir(dataset_id)
        dxf_path = job_dir / "converted.dxf"

        if dxf_path.exists():
            return dxf_path

        try:
            converted = convert_to_dxf(path, job_dir)
            if converted.name != dxf_path.name:
                shutil.move(converted, dxf_path)
            return dxf_path
        except Exception as exc:
            self.conversion_error = str(exc)
            return None

    def inspect(self, path: Path, dataset_id: str, original_file_name: str) -> NormalizedDataset:
        self.conversion_error = None
        dxf_path = self._get_or_create_dxf(path, dataset_id)

        if not dxf_path:
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
                    DatasetWarning(code="DGN_CONVERT_FAILED", message="Không thể chuyển đổi file DGN bằng ODA File Converter.", severity="error")
                ],
                extra={"convertError": self.conversion_error},
            )

        dxf_reader = DxfReader()
        dataset = dxf_reader.inspect(dxf_path, dataset_id, original_file_name)
        dataset.detected_format = self.format_name
        return dataset

    def create_preview(
        self,
        path: Path,
        output_path: Path,
        layer_id: str | None,
        source_crs: str | None,
        target_crs: str = "EPSG:4326",
        feature_limit: int = 10000,
        **kwargs
    ) -> PreviewResult:
        dataset_id = path.parent.name
        dxf_path = self._get_or_create_dxf(path, dataset_id)
        if not dxf_path:
            raise RuntimeError(f"Không thể tạo preview: không có file DXF ({self.conversion_error})")
        return DxfReader().create_preview(dxf_path, output_path, layer_id, source_crs, target_crs=target_crs, feature_limit=feature_limit, **kwargs)

    def create_layer_previews(
        self,
        path: Path,
        output_paths_by_layer_id: dict[str, Path],
        source_crs: str | None,
        target_crs: str = "EPSG:4326",
        feature_limit: int = 10000,
        **kwargs
    ) -> dict[str, PreviewResult]:
        dataset_id = path.parent.name
        dxf_path = self._get_or_create_dxf(path, dataset_id)
        if not dxf_path:
            raise RuntimeError(f"Không thể tạo preview: không có file DXF ({self.conversion_error})")
        return DxfReader().create_layer_previews(dxf_path, output_paths_by_layer_id, source_crs, target_crs=target_crs, feature_limit=feature_limit, **kwargs)
