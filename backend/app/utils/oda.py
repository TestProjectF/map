import subprocess
from pathlib import Path

from app.core.exceptions import ConversionError


def convert_to_dxf(input_file: Path, output_dir: Path) -> Path:
    """
    Sử dụng ODA File Converter để chuyển đổi file (DWG, DGN, DXF) thành chuẩn DXF.
    ODAFileConverter <InputFolder> <OutputFolder> <OutputVersion> <OutputFileType> <RecurseFolder> <Audit> [InputFileName]
    """
    output_version = "ACAD2018"
    output_format = "DXF"

    # InputFolder và OutputFolder phải là thư mục
    input_folder = input_file.parent
    input_name = input_file.name

    command = [
        "xvfb-run",
        "-a",
        "ODAFileConverter",
        str(input_folder),
        str(output_dir),
        output_version,
        output_format,
        "0",  # Recurse = 0
        "1",  # Audit = 1
        input_name,
    ]

    try:
        # Chạy ODA File Converter thông qua xvfb
        result = subprocess.run(command, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as exc:
        raise ConversionError(f"ODAFileConverter thất bại ({exc.returncode}): {exc.stderr}\nStdout: {exc.stdout}")
    except FileNotFoundError:
        raise ConversionError("Không tìm thấy lệnh xvfb-run hoặc ODAFileConverter. Vui lòng cài đặt vào hệ thống.")

    expected_output_name = f"{input_file.stem}.dxf"
    output_file = output_dir / expected_output_name

    # ODAFileConverter có thể tạo ra file tên hơi khác (ví dụ uppercase DXF extension)
    if not output_file.exists():
        expected_output_name = f"{input_file.stem}.DXF"
        output_file = output_dir / expected_output_name

    if not output_file.exists():
        raise ConversionError(f"ODAFileConverter chạy thành công nhưng không tìm thấy file đầu ra {output_file.name} trong thư mục {output_dir}")

    return output_file
