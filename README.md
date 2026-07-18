# Web GIS & CAD Portal

Đây là một nền tảng Web GIS chuyên nghiệp, mạnh mẽ cho phép người dùng tải lên, phân tích, xem trước, chỉnh sửa và chuyển đổi các định dạng dữ liệu GIS và CAD phức tạp. Ứng dụng tích hợp backend FastAPI tốc độ cao, frontend Next.js hiện đại, kết hợp với sức mạnh của OpenLayers, GDAL và ODA File Converter.

## 🚀 Tính năng nổi bật

### 1. Hỗ trợ đa dạng định dạng GIS & CAD
- **Dữ liệu Vector GIS**: GeoJSON, KML, KMZ, Shapefile (ZIP), GeoPackage.
- **Dữ liệu Raster GIS**: KMZ Raster (SuperOverlay) - Tự động chuyển đổi sang định dạng Cloud Optimized GeoTIFF (COG) để tối ưu hiệu suất hiển thị (sử dụng `WebGLTileLayer`).
- **Dữ liệu CAD Phức tạp**: DXF, DWG, và DGN v8.
  - Tích hợp **ODA File Converter** (Local fallback) và **Zamzar API** (Cloud service) để đảm bảo chuyển đổi thành công các file CAD độc quyền.

### 2. Tự động Georeferencing (Tham chiếu không gian)
- Tự động nhận diện và chuyển đổi hệ tọa độ VN2000 (EPSG:9205-9218 cho các múi chiếu TM-3).
- Phát hiện và gợi ý hệ tọa độ tự động bằng cách sử dụng UTM 48N (EPSG:3405) làm tham chiếu không gian.
- **Tương tác Georeference cho CAD**: Cung cấp bộ công cụ mạnh mẽ trên giao diện để nắn chỉnh bản vẽ CAD:
  - Công cụ **BBox**: Chọn vùng bao (bounding box) trực tiếp trên bản đồ.
  - **Manual Translation & Scaling**: Hỗ trợ kéo thả, xoay và thay đổi tỷ lệ bản vẽ thủ công trên bản đồ.
  - **Khôi phục tỷ lệ (Restore Aspect Ratio)**: Đưa bản vẽ về tỷ lệ gốc một cách độc lập mà không làm thay đổi các phép biến đổi không gian (vị trí đã được nắn chỉnh).

### 3. Tương tác và Chỉnh sửa Bản đồ (OpenLayers)
- Hiển thị mượt mà các tập dữ liệu lớn bằng OpenLayers và OpenStreetMap.
- Vẽ, chỉnh sửa và xóa các đối tượng không gian (Point, LineString, Polygon).
- Chức năng **Snap** vào các đối tượng có sẵn để vẽ chính xác.
- Hỗ trợ Undo/Redo khi thao tác vẽ/chỉnh sửa.
- Chỉnh sửa thuộc tính (Attributes) của dữ liệu theo dạng Key-Value.
- Quản lý Layer nâng cao: Bật/tắt, tùy chỉnh độ mờ (opacity), sắp xếp và xóa.

### 4. Quản trị Dữ liệu & Lưu trữ
- Trích xuất và phân tích siêu dữ liệu (Metadata): CRS, Bounding Box, số lượng feature, loại geometry, v.v.
- Lưu trữ dữ liệu hệ thống an toàn thông qua **MinIO (S3-based storage)**.
- Xuất dữ liệu đã xử lý/chỉnh sửa sang định dạng chuẩn GeoJSON.

## 🛠 Công nghệ sử dụng

### Backend (Python/FastAPI)
- **FastAPI** & **Uvicorn**: Hiệu năng cao, framework API không đồng bộ (async).
- **GDAL/OGR** (Python bindings): Xử lý mạnh mẽ dữ liệu không gian (Raster & Vector, chuyển đổi hệ tọa độ).
- **ODA File Converter**: Xử lý các định dạng CAD độc quyền (DWG, DGN).
- **MinIO**: Lưu trữ object lưu trữ S3-compatible, quản lý file đầu vào và dữ liệu sinh ra.
- **ezdxf**: Phân tích cú pháp và xử lý linh hoạt định dạng DXF.

### Frontend (React/Next.js)
- **Next.js** (App Router) & **React**.
- **TypeScript**: Đảm bảo an toàn kiểu dữ liệu (type-safe) trong toàn dự án.
- **OpenLayers**: Rendering bản đồ tương tác mạnh mẽ, hỗ trợ WebGLTileLayer để hiển thị COG mượt mà.
- **Tailwind CSS** & **Lucide React**: Xây dựng giao diện người dùng hiện đại, responsive.

## 📦 Yêu cầu hệ thống

### Môi trường Docker (Khuyên dùng)
Chỉ cần cài đặt:
- Docker
- Docker Compose

### Môi trường phát triển cục bộ (Local Development)
Yêu cầu hệ thống phải có:
- Python 3.10+
- Node.js 20+
- GDAL/OGR (Tương thích với `gdal-config --version`)
- ODA File Converter (Yêu cầu nếu cần xử lý trực tiếp DGN/DWG trên máy cá nhân)

**Cài đặt nhanh GDAL trên Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y gdal-bin libgdal-dev
```

## 🚀 Hướng dẫn khởi chạy

### Chạy nhanh bằng Docker (Khuyên dùng)
Từ thư mục gốc của dự án, chạy lệnh:
```bash
docker compose up --build
```
Hệ thống sẽ khởi động các container (Backend, Frontend, MinIO). Sau khi khởi động xong, các dịch vụ khả dụng tại:
- **Frontend (Giao diện web)**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **MinIO Console**: http://localhost:9001 (Nếu có cấu hình port này)
- **API Health check**: http://localhost:8000/api/health

### Chạy ở môi trường phát triển cục bộ

**1. Khởi động Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install "GDAL==$(gdal-config --version)"
uvicorn app.main:app --reload --port 8000
```

**2. Khởi động Frontend**
```bash
cd frontend
npm install
npm run dev
```

Sau đó mở trình duyệt và truy cập http://localhost:3000.

## 📁 Cấu trúc thư mục

```text
├── backend/
│   ├── app/
│   │   ├── api/          # Các API routers (endpoints)
│   │   ├── core/         # Cấu hình hệ thống (Settings, Logger, Dependencies)
│   │   ├── models/       # Các mô hình dữ liệu (Pydantic models)
│   │   ├── readers/      # Core logic phân tích/đọc file (CAD, GIS, Raster)
│   │   ├── services/     # Business logic & Giao tiếp dịch vụ ngoài (Zamzar, ODA)
│   │   └── utils/        # Utilities hỗ trợ (Xử lý Spatial, GDAL, v.v.)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/              # Next.js App Router (Pages, Layouts)
│   ├── components/       # Các UI Component (Bản đồ OpenLayers, Sidebar, Upload)
│   ├── hooks/            # Custom React Hooks quản lý State & Logic tương tác bản đồ
│   ├── lib/gis/          # Helper functions thuần xử lý logic GIS
│   └── types/            # TypeScript Interfaces & Data Types
├── docker-compose.yml
└── README.md
```

## 🔄 Luồng xử lý dữ liệu chính (Backend Pipeline)
Dữ liệu đầu vào đi qua quy trình nghiêm ngặt:
1. **Upload & Xác thực**: Kiểm tra tính toàn vẹn và bảo mật (ngăn chặn path traversal, đặc biệt với các file nén ZIP, KMZ).
2. **Nhận dạng định dạng (Format Detection)**: Định tuyến linh hoạt luồng xử lý tùy thuộc vào đó là dữ liệu vector, raster hay bản vẽ CAD.
3. **Chuyển đổi (Conversion)**:
   - DGN/DWG -> ODA Converter / Zamzar API -> DXF/GeoJSON.
   - Raster KMZ -> GDAL -> COG.
4. **Phân tích (Inspection)**: Trích xuất các siêu dữ liệu không gian cốt lõi (Bounding box, Hệ tọa độ CRS nguyên thủy, cấu trúc layer).
5. **Tiền xử lý & Rendering (Preview Generation)**:
   - Xử lý chuyển đổi hệ tọa độ về **EPSG:4326** để tương thích tốt nhất cho việc hiển thị trực tuyến.
   - Trả dữ liệu tinh chỉnh về cho Frontend để OpenLayers render lên bản đồ.

## 🤝 Đóng góp & Mở rộng
Cấu trúc dự án được thiết kế dễ dàng để mở rộng:
- **Hỗ trợ định dạng file mới**: Tạo một class `Reader` mới kế thừa kiến trúc có sẵn trong thư mục `backend/app/readers/`.
- **Thêm tính năng bản đồ**: Xây dựng logic GIS cốt lõi tại `frontend/lib/gis/` (thuần TypeScript) trước khi tích hợp vào UI thông qua custom `hooks`.

## ⚠️ Khắc phục sự cố thường gặp
- **Lỗi không cài đặt/build được Backend (GDAL)**: Đảm bảo version của thư viện Python GDAL hoàn toàn khớp với phiên bản hệ điều hành máy host đang sử dụng (kiểm tra qua `gdal-config --version`).
- **Lỗi khi tải hoặc xử lý file CAD**: Đảm bảo ODA File Converter đã được cài đặt đúng, có trong `PATH` hoặc đã được mount chính xác trong Docker container. Nếu dùng Cloud API, hãy kiểm tra khóa API của Zamzar.
- **Frontend không hiển thị dữ liệu hoặc lỗi kết nối API**: Kiểm tra biến môi trường `NEXT_PUBLIC_API_BASE` trong frontend (local hoặc Docker) và đảm bảo backend đang chạy đúng cổng 8000.
- **Lỗi nén Shapefile**: Shapefile nén ZIP phải chứa đủ các file tối thiểu: `.shp`, `.shx`, và `.dbf` để được hệ thống chấp nhận xử lý.
# map
