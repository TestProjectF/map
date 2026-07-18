from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import files, layers
from app.core.exceptions import DatasetError, dataset_exception_handler, generic_exception_handler

app = FastAPI(title="Web GIS CAD/GIS Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(layers.router, prefix="/api/layers", tags=["layers"])
app.add_exception_handler(DatasetError, dataset_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)
