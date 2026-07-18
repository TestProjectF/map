from pathlib import Path

from app.core.exceptions import UnsupportedFormatError
from app.readers.base import DatasetReader


class ReaderRegistry:
    def __init__(self, readers: list[DatasetReader]):
        self.readers = readers

    def resolve(self, path: Path) -> DatasetReader:
        for reader in self.readers:
            if reader.can_read(path):
                return reader
        raise UnsupportedFormatError("Định dạng file không được hỗ trợ.", {"suffix": path.suffix})
