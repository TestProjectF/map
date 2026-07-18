from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class DatasetError(Exception):
    code = "DATASET_ERROR"
    status_code = 400

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class UnsupportedFormatError(DatasetError):
    code = "UNSUPPORTED_FORMAT"
    status_code = 415


class InvalidDatasetError(DatasetError):
    code = "INVALID_DATASET"


class MissingCrsError(DatasetError):
    code = "CRS_REQUIRED"


class ReaderNotImplementedError(DatasetError):
    code = "READER_NOT_IMPLEMENTED"
    status_code = 501


class NotImplementedFormatOperationError(DatasetError):
    code = "FORMAT_OPERATION_NOT_IMPLEMENTED"
    status_code = 501


class UnsafeArchiveError(DatasetError):
    code = "UNSAFE_ARCHIVE"


class ConversionError(DatasetError):
    code = "CONVERSION_ERROR"


async def dataset_exception_handler(_: Request, exc: DatasetError) -> JSONResponse:
    response = JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
        },
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


async def generic_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    response = JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Lỗi máy chủ nội bộ.",
                "details": {"type": type(exc).__name__},
            },
        },
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response
