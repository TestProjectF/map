"""Heuristic tự phát hiện cụm toạ độ "thật" (VN-2000/UTM) trong dữ liệu CAD.

Vấn đề: DXF/DWG/DGN không lưu CRS. Một bản vẽ quy hoạch/khảo sát thực tế ở
Việt Nam thường trộn lẫn trong cùng file:
  - Các entity dùng toạ độ thật theo hệ VN-2000/UTM (easting/northing hàng
    trăm nghìn/hàng triệu mét, phản ánh đúng vị trí địa lý) — ví dụ layer
    đường giao thông, ranh giới, mốc khảo sát.
  - Các entity "trang trí"/in ấn dùng toạ độ nội bộ tuỳ ý, hoàn toàn không
    liên quan tới vị trí thật (khung tên, bảng chú thích, chi tiết phóng to)
    — thường có biên độ lệch hẳn khỏi dải toạ độ VN-2000/UTM hợp lệ.

Heuristic này lọc ra các điểm rơi vào dải easting/northing hợp lý cho lãnh
thổ Việt Nam, tìm cụm dày đặc nhất (khu vực nhiều đối tượng nhất — thường là
công trình/dự án cụ thể, không phải ranh giới hành chính trải dài), rồi thử
một danh sách CRS ứng viên phổ biến — CRS nào cho ra kinh độ/vĩ độ nằm trong
biên giới Việt Nam thì được coi là gợi ý hợp lệ.

Đây chỉ là GỢI Ý (best-effort), không phải xác thực chính thức.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Biên độ easting/northing hợp lý cho các hệ VN-2000/UTM dùng ở Việt Nam.
# Northing ứng với vĩ độ ~8°N (cực Nam) tới ~23.4°N (cực Bắc): 8 * 111320 ≈
# 890,000 và 23.4 * 111320 ≈ 2,605,000, nới biên một chút cho an toàn.
PLAUSIBLE_EASTING_RANGE = (-50_000.0, 900_000.0)
PLAUSIBLE_NORTHING_RANGE = (850_000.0, 2_650_000.0)

# Biên giới lãnh thổ Việt Nam (lon, lat), nới biên nhẹ để bao gồm cả EEZ ven bờ.
VIETNAM_LON_RANGE = (102.0, 109.6)
VIETNAM_LAT_RANGE = (8.0, 23.5)

# Danh sách CRS ứng viên hay gặp nhất cho dữ liệu khảo sát/quy hoạch VN,
# theo thứ tự ưu tiên (CRS phổ biến hơn cho CAD kỹ thuật đứng trước).
CANDIDATE_CRS_LIST = [
    "EPSG:3405",  # VN-2000 / UTM zone 48N
    "EPSG:9210",  # VN-2000 / TM-3 105-45
    "EPSG:5897",  # VN-2000 / TM-3 zone 482 (KTT 105°00')
    "EPSG:9209",  # VN-2000 / TM-3 105-30
    "EPSG:32648",  # WGS 84 / UTM zone 48N
    "EPSG:32649",  # WGS 84 / UTM zone 49N
]

MIN_CLUSTER_POINTS = 20


@dataclass
class GeoClusterSuggestion:
    crs: str
    confidence: str  # "low" | "medium"
    matched_point_count: int
    matched_point_ratio: float
    local_bbox: list[float]  # [minX, minY, maxX, maxY] trong đơn vị bản vẽ gốc
    bbox_wgs84: list[float]  # [west, south, east, north]

    def to_extra_dict(self) -> dict[str, Any]:
        return {
            "suggestedCrs": self.crs,
            "suggestedCrsConfidence": self.confidence,
            "suggestedCrsMatchedPoints": self.matched_point_count,
            "suggestedCrsMatchedRatio": round(self.matched_point_ratio, 4),
            "suggestedLocalBbox": self.local_bbox,
            "suggestedBboxWgs84": self.bbox_wgs84,
        }


def _bbox_of(points: list[tuple[float, float]]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _densest_core(points: list[tuple[float, float]], cell_size: float = 2000.0, radius: float = 8000.0) -> list[tuple[float, float]]:
    """Trả về tập con điểm nằm quanh khu vực dày đặc nhất.

    File CAD quy hoạch thường lẫn nội dung phạm vi rộng (ranh giới hành
    chính xã/huyện...) cùng với công trình cụ thể của dự án (đường nội khu,
    ranh lô đất...). Lấy bbox của TOÀN BỘ điểm khớp dải toạ độ VN-2000 sẽ bị
    kéo giãn theo nội dung phạm vi rộng, không zoom sát vào đúng công trình.
    Thay vào đó, chia lưới ô vuông `cell_size` mét, tìm ô có mật độ điểm cao
    nhất (thường là khu vực có nhiều đối tượng nhất — công trình cụ thể),
    rồi lấy toàn bộ điểm trong bán kính `radius` quanh tâm ô đó.
    """
    if len(points) < MIN_CLUSTER_POINTS:
        return points

    grid: dict[tuple[int, int], int] = {}
    for x, y in points:
        cell = (int(x // cell_size), int(y // cell_size))
        grid[cell] = grid.get(cell, 0) + 1

    peak_cell = max(grid, key=lambda cell: grid[cell])
    center_x = (peak_cell[0] + 0.5) * cell_size
    center_y = (peak_cell[1] + 0.5) * cell_size

    core = [(x, y) for x, y in points if abs(x - center_x) <= radius and abs(y - center_y) <= radius]
    return core if len(core) >= MIN_CLUSTER_POINTS else points


def guess_vietnam_geo_cluster(coords: list[tuple[float, float]]) -> GeoClusterSuggestion | None:
    """Thử tìm cụm toạ độ hợp lệ kiểu VN-2000/UTM trong danh sách điểm.

    `coords` là toàn bộ toạ độ (x, y) thô lấy trực tiếp từ entity CAD (chưa
    reproject). Trả về None nếu không tìm thấy cụm nào đủ tin cậy.
    """
    if not coords:
        return None

    x_lo, x_hi = PLAUSIBLE_EASTING_RANGE
    y_lo, y_hi = PLAUSIBLE_NORTHING_RANGE
    matched = [(x, y) for x, y in coords if x_lo <= x <= x_hi and y_lo <= y <= y_hi]
    if len(matched) < MIN_CLUSTER_POINTS:
        return None

    core = _densest_core(matched)
    local_bbox = _bbox_of(core)
    ratio = len(matched) / len(coords)

    try:
        from pyproj import Transformer
    except ImportError:
        return None

    center_x = (local_bbox[0] + local_bbox[2]) / 2
    center_y = (local_bbox[1] + local_bbox[3]) / 2

    for candidate_crs in CANDIDATE_CRS_LIST:
        try:
            transformer = Transformer.from_crs(candidate_crs, "EPSG:4326", always_xy=True)
            center_lon, center_lat = transformer.transform(center_x, center_y)
        except Exception:
            continue
        if not (VIETNAM_LON_RANGE[0] <= center_lon <= VIETNAM_LON_RANGE[1]):
            continue
        if not (VIETNAM_LAT_RANGE[0] <= center_lat <= VIETNAM_LAT_RANGE[1]):
            continue

        corners = [
            (local_bbox[0], local_bbox[1]),
            (local_bbox[2], local_bbox[1]),
            (local_bbox[2], local_bbox[3]),
            (local_bbox[0], local_bbox[3]),
        ]
        lons: list[float] = []
        lats: list[float] = []
        for cx, cy in corners:
            lon, lat = transformer.transform(cx, cy)
            lons.append(lon)
            lats.append(lat)
        bbox_wgs84 = [min(lons), min(lats), max(lons), max(lats)]

        confidence = "medium" if ratio >= 0.05 and len(matched) >= 100 else "low"
        return GeoClusterSuggestion(
            crs=candidate_crs,
            confidence=confidence,
            matched_point_count=len(matched),
            matched_point_ratio=ratio,
            local_bbox=local_bbox,
            bbox_wgs84=bbox_wgs84,
        )

    return None
