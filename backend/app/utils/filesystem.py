import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.core.config import JOBS_DIR
from app.core.exceptions import InvalidDatasetError


def create_job_dir() -> tuple[str, Path]:
    file_id = str(uuid.uuid4())
    job_dir = JOBS_DIR / file_id
    job_dir.mkdir(parents=True, exist_ok=False)
    return file_id, job_dir


def validate_file_id(file_id: str) -> None:
    try:
        uuid.UUID(file_id)
    except ValueError as exc:
        raise InvalidDatasetError("File id không hợp lệ.") from exc


def get_job_dir(file_id: str) -> Path:
    validate_file_id(file_id)
    job_dir = JOBS_DIR / file_id
    if not job_dir.exists():
        raise InvalidDatasetError("Không tìm thấy file id.")
    return job_dir


def save_upload(upload: UploadFile, job_dir: Path) -> Path:
    suffix = Path(upload.filename or "upload").suffix.lower()
    path = job_dir / f"source{suffix}"
    with path.open("wb") as output:
        while chunk := upload.file.read(1024 * 1024):
            output.write(chunk)
    return path


def metadata_path(job_dir: Path) -> Path:
    return job_dir / "metadata.json"


def source_info_path(job_dir: Path) -> Path:
    return job_dir / "source.json"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))
