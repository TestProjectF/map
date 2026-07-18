import json
import math
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw


DEFAULT_SIZE = 1600
PADDING = 24
SUPERSAMPLE = 4  # render 4x rồi thu nhỏ → khử răng cưa


def render_geojson_preview(
    paths: Iterable[Path],
    output_path: Path,
    size: int = DEFAULT_SIZE,
    include_points: bool = True,
    include_hatches: bool = True,
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        features.extend(payload.get("features", []))

    bbox = _bbox(features)
    if bbox is None:
        raise ValueError("CAD không có geometry hợp lệ để render preview.")

    min_x, min_y, max_x, max_y = bbox
    source_width = max(max_x - min_x, 1e-9)
    source_height = max(max_y - min_y, 1e-9)

    # Kích thước thực (output)
    usable = max(size - PADDING * 2, 1)
    scale = min(usable / source_width, usable / source_height)
    width = max(1, math.ceil(source_width * scale) + PADDING * 2)
    height = max(1, math.ceil(source_height * scale) + PADDING * 2)

    # Render ở 4x để supersampling
    ss = SUPERSAMPLE
    ss_width = width * ss
    ss_height = height * ss
    ss_scale = scale * ss
    ss_padding = PADDING * ss

    image = Image.new("RGBA", (ss_width, ss_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")

    def pixel(point: list[float]) -> tuple[float, float]:
        return ss_padding + (point[0] - min_x) * ss_scale, ss_padding + (max_y - point[1]) * ss_scale

    for feature in features:
        geometry = feature.get("geometry") or {}
        if not include_points and geometry.get("type") in {"Point", "MultiPoint"}:
            continue
        if not include_hatches and (feature.get("properties") or {}).get("MAP_CAD_type") == "HATCH":
            continue
        _draw_geometry(draw, geometry.get("type"), geometry.get("coordinates"), pixel, ss)

    # Thu nhỏ về kích thước thực với LANCZOS → anti-alias sắc nét
    image = image.resize((width, height), Image.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG", optimize=True)
    pad_units = PADDING / scale
    return {
        "bbox": [min_x - pad_units, max_y - (height - PADDING) / scale, min_x + (width - PADDING) / scale, max_y + pad_units],
        "width": width,
        "height": height,
    }


def _draw_geometry(draw: ImageDraw.ImageDraw, geometry_type: str | None, coordinates: Any, pixel: Any, ss: int = 1) -> None:
    stroke = (15, 118, 110, 235)
    fill = (20, 184, 166, 42)
    lw = max(1, round(1.5 * ss))
    r = max(1, round(1.5 * ss))
    if geometry_type == "Point" and _point(coordinates):
        x, y = pixel(coordinates)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=stroke)
    elif geometry_type == "MultiPoint":
        for point in coordinates or []:
            _draw_geometry(draw, "Point", point, pixel, ss)
    elif geometry_type == "LineString":
        points = [pixel(point) for point in coordinates or [] if _point(point)]
        if len(points) >= 2:
            draw.line(points, fill=stroke, width=lw, joint="curve")
    elif geometry_type == "MultiLineString":
        for line in coordinates or []:
            _draw_geometry(draw, "LineString", line, pixel, ss)
    elif geometry_type == "Polygon":
        rings = coordinates or []
        if rings:
            exterior = [pixel(point) for point in rings[0] if _point(point)]
            if len(exterior) >= 3:
                draw.polygon(exterior, fill=fill)
                draw.line(exterior, fill=stroke, width=lw, joint="curve")
            for ring in rings[1:]:
                points = [pixel(point) for point in ring if _point(point)]
                if len(points) >= 2:
                    draw.line(points, fill=stroke, width=lw, joint="curve")
    elif geometry_type == "MultiPolygon":
        for polygon in coordinates or []:
            _draw_geometry(draw, "Polygon", polygon, pixel, ss)


def _bbox(features: list[dict[str, Any]]) -> list[float] | None:
    points: list[list[float]] = []
    for feature in features:
        points.extend(_points((feature.get("geometry") or {}).get("coordinates")))
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _points(value: Any) -> list[list[float]]:
    if _point(value):
        return [value]
    if not isinstance(value, list):
        return []
    return [point for item in value for point in _points(item)]


def _point(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) and math.isfinite(item) for item in value[:2])
