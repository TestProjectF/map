from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.schemas.conversion_schema import BatchPreviewResponse, PreviewRequest, PreviewResponse
from app.schemas.dataset_schema import UploadDatasetResponse
from app.schemas.files import ConvertRequest
from app.services.dataset_service import DatasetService
from app.services.preview_service import PreviewService
from app.services.cad_raster_service import render_geojson_preview
from app.utils.filesystem import get_job_dir

router = APIRouter()
dataset_service = DatasetService()
preview_service = PreviewService(dataset_service=dataset_service)


@router.post("/upload", response_model=UploadDatasetResponse)
def upload_file(file: UploadFile) -> dict:
    file_id, dataset = dataset_service.upload_and_inspect(file)
    return {"fileId": file_id, "dataset": dataset}

@router.post("/{file_id}/preview", response_model=PreviewResponse)
def create_preview(file_id: str, payload: PreviewRequest) -> dict:
    result = preview_service.create_preview(
        file_id=file_id,
        layer_id=payload.layerId,
        source_crs=payload.sourceCrs,
        target_crs=payload.targetCrs,
        feature_limit=payload.featureLimit,
    )
    response = {
        "previewUrl": f"/api/files/{file_id}/preview",
        "sourceCrs": result.source_crs,
        "targetCrs": result.target_crs,
        "featureCount": result.feature_count,
        "truncated": result.truncated,
    }
    dataset = dataset_service.get_dataset(file_id)
    if dataset.source_category == "cad" and not payload.sourceCrs:
        raster_path = get_job_dir(file_id) / "cad-preview.png"
        raster = render_geojson_preview([result.output_path], raster_path)
        overview_path = get_job_dir(file_id) / "cad-overview.png"
        render_geojson_preview([result.output_path], overview_path, include_points=False, include_hatches=False)
        response.update({
            "rasterPreviewUrl": f"/api/files/{file_id}/cad-preview.png",
            "rasterOverviewUrl": f"/api/files/{file_id}/cad-overview.png",
            "rasterBbox": raster["bbox"],
        })
    return response


@router.get("/{file_id}/preview")
def get_preview(file_id: str) -> FileResponse:
    job_dir = get_job_dir(file_id)
    tif_path = job_dir / "preview.tif"
    if tif_path.exists():
        return FileResponse(tif_path, media_type="image/tiff")

    preview_path = job_dir / "preview.geojson"
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview chưa được tạo.")
    return FileResponse(preview_path, media_type="application/geo+json")

@router.get("/{file_id}/rasters")
def list_raster_files(file_id: str) -> dict:
    """List raster files in KMZ dataset"""
    dataset = dataset_service.get_dataset(file_id)
    raster_files = dataset.extra.get("rasterFiles", [])
    main_kml = dataset.extra.get("mainKml", "")
    return {
        "rasterFiles": raster_files,
        "mainKml": main_kml,
        "hasRaster": dataset.extra.get("hasRaster", False),
    }


@router.get("/{file_id}/kmz/{path:path}")
def get_kmz_file(file_id: str, path: str) -> FileResponse:
    job_dir = get_job_dir(file_id)
    kmz_dir = (job_dir / "kmz").resolve()
    file_path = (kmz_dir / path).resolve()
    if not file_path.is_relative_to(kmz_dir):
        raise HTTPException(status_code=403, detail="Cấm truy cập")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy file")

    return FileResponse(file_path)

@router.post("/{file_id}/previews", response_model=BatchPreviewResponse)
def create_layer_previews(file_id: str, payload: PreviewRequest) -> dict:
    layers = preview_service.create_layer_previews(
        file_id=file_id,
        source_crs=payload.sourceCrs,
        target_crs=payload.targetCrs,
        feature_limit=payload.featureLimit,
    )
    response = {"status": "completed", "layers": layers}
    dataset = dataset_service.get_dataset(file_id)
    if dataset.source_category == "cad" and not payload.sourceCrs:
        preview_paths = [get_job_dir(file_id) / "previews" / Path(layer["previewUrl"]).name for layer in layers]
        raster_path = get_job_dir(file_id) / "cad-preview.png"
        raster = render_geojson_preview(preview_paths, raster_path)
        overview_path = get_job_dir(file_id) / "cad-overview.png"
        render_geojson_preview(preview_paths, overview_path, include_points=False, include_hatches=False)
        response.update({
            "rasterPreviewUrl": f"/api/files/{file_id}/cad-preview.png",
            "rasterOverviewUrl": f"/api/files/{file_id}/cad-overview.png",
            "rasterBbox": raster["bbox"],
        })
    return response


@router.get("/{file_id}/cad-preview.png")
def get_cad_preview(file_id: str) -> FileResponse:
    preview_path = get_job_dir(file_id) / "cad-preview.png"
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="CAD raster preview chưa được tạo.")
    return FileResponse(preview_path, media_type="image/png")


@router.get("/{file_id}/cad-overview.png")
def get_cad_overview(file_id: str) -> FileResponse:
    overview_path = get_job_dir(file_id) / "cad-overview.png"
    if not overview_path.exists():
        raise HTTPException(status_code=404, detail="CAD overview chưa được tạo.")
    return FileResponse(overview_path, media_type="image/png")


@router.get("/{file_id}/previews/{preview_name}")
def get_layer_preview(file_id: str, preview_name: str) -> FileResponse:
    if "/" in preview_name or "\\" in preview_name:
        raise HTTPException(status_code=400, detail="Tên preview không hợp lệ.")
    preview_path = get_job_dir(file_id) / "previews" / preview_name
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview chưa được tạo.")
    return FileResponse(preview_path, media_type="application/geo+json")


@router.delete("/{file_id}")
def delete_file(file_id: str) -> dict[str, bool]:
    # Demo intentionally keeps job artifacts for inspection/debugging.
    get_job_dir(file_id)
    return {"deleted": False}


@router.get("/{file_id}")
def get_file(file_id: str) -> dict:
    return {"fileId": file_id, "dataset": dataset_service.get_dataset(file_id)}
