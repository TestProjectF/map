import zipfile
from pathlib import Path

from app.core.exceptions import UnsafeArchiveError

MAX_ARCHIVE_FILES = 512
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024


def safe_extract_zip(zip_path: Path, target_dir: Path) -> list[Path]:
    extracted: list[Path] = []
    target_dir.mkdir(parents=True, exist_ok=True)
    root = target_dir.resolve()

    with zipfile.ZipFile(zip_path) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ARCHIVE_FILES:
            raise UnsafeArchiveError(
                f"Archive có quá nhiều file, tối đa {MAX_ARCHIVE_FILES}.",
                {"fileCount": len(infos), "maxFileCount": MAX_ARCHIVE_FILES},
            )
        total_size = sum(info.file_size for info in infos)
        if total_size > MAX_UNCOMPRESSED_BYTES:
            raise UnsafeArchiveError(
                "Tổng dung lượng giải nén vượt quá giới hạn.",
                {"totalBytes": total_size, "maxBytes": MAX_UNCOMPRESSED_BYTES},
            )

        for info in infos:
            if info.is_dir():
                continue
            destination = (target_dir / info.filename).resolve()
            if root != destination.parent and root not in destination.parents:
                raise UnsafeArchiveError("Archive chứa đường dẫn không an toàn.")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, destination.open("wb") as target:
                target.write(source.read())
            extracted.append(destination)

    return extracted
