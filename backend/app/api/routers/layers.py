import json
import re
import uuid

from fastapi import APIRouter

from app.core.config import EXPORTS_DIR
from app.schemas.files import ExportRequest

router = APIRouter()


@router.post("/export")
def export_layer(payload: ExportRequest) -> dict[str, str]:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", payload.name).strip("-") or "drawn-layers"
    export_id = str(uuid.uuid4())
    path = EXPORTS_DIR / f"{safe_name}-{export_id}.geojson"
    path.write_text(json.dumps(payload.geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"exportId": export_id, "path": str(path)}
