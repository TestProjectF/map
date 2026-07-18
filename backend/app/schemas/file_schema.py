from pydantic import BaseModel


class ErrorPayload(BaseModel):
    success: bool = False
    error: dict
