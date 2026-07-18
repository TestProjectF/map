from pydantic import BaseModel, ConfigDict

from app.models.dataset import NormalizedDataset


class UploadDatasetResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    fileId: str
    dataset: NormalizedDataset
