from fastapi import UploadFile

from app.utils.filesystem import create_job_dir, save_upload, source_info_path, write_json


class UploadService:
    def save(self, upload: UploadFile) -> tuple[str, str]:
        file_id, job_dir = create_job_dir()
        source_path = save_upload(upload, job_dir)
        original_file_name = upload.filename or "upload"
        write_json(
            source_info_path(job_dir),
            {
                "fileId": file_id,
                "originalFileName": original_file_name,
                "sourcePath": str(source_path),
            },
        )
        return file_id, str(source_path)
