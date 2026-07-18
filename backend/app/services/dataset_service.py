from pathlib import Path

from fastapi import UploadFile

from app.models.dataset import NormalizedDataset
from app.readers.default_registry import build_reader_registry
from app.readers.registry import ReaderRegistry
from app.services.upload_service import UploadService
from app.utils.filesystem import get_job_dir, metadata_path, read_json, source_info_path, write_json


class DatasetService:
    def __init__(self, registry: ReaderRegistry | None = None, upload_service: UploadService | None = None):
        self.registry = registry or build_reader_registry()
        self.upload_service = upload_service or UploadService()

    def upload_and_inspect(self, upload: UploadFile) -> tuple[str, NormalizedDataset]:
        file_id, source_path = self.upload_service.save(upload)
        dataset = self.inspect_uploaded_file(file_id, Path(source_path), upload.filename or "upload")
        return file_id, dataset

    def inspect_uploaded_file(self, file_id: str, source_path: Path | None = None, original_file_name: str | None = None) -> NormalizedDataset:
        job_dir = get_job_dir(file_id)
        if source_path is None or original_file_name is None:
            info = read_json(source_info_path(job_dir))
            source_path = Path(info["sourcePath"])
            original_file_name = info["originalFileName"]
        reader = self.registry.resolve(source_path)
        dataset = reader.inspect(source_path, file_id, original_file_name)
        write_json(metadata_path(job_dir), dataset.model_dump(mode="json", by_alias=True))
        return dataset

    def get_dataset(self, file_id: str) -> NormalizedDataset:
        job_dir = get_job_dir(file_id)
        payload = read_json(metadata_path(job_dir))
        return NormalizedDataset.model_validate(payload)

    def get_source_path(self, file_id: str) -> Path:
        job_dir = get_job_dir(file_id)
        info = read_json(source_info_path(job_dir))
        return Path(info["sourcePath"])
