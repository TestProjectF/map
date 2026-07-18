import { CAD_PROPERTY_NAMESPACE, SYSTEM_PROPERTY_PREFIX } from "./systemProperties";

type PropertyMetadata = {
  label: string;
  description: string;
};

const CAD_PROPERTY_LABELS: Record<string, PropertyMetadata> = {
  type: {
    label: "Loại entity CAD",
    description: "Kiểu entity gốc trong DXF, ví dụ LINE, LWPOLYLINE, HATCH, ATTRIB."
  },
  layer: {
    label: "Layer CAD",
    description: "Layer CAD dùng để group và hiển thị feature trong app."
  },
  handle: {
    label: "CAD handle",
    description: "Mã định danh nội bộ của entity trong file CAD."
  },
  color: {
    label: "Màu CAD",
    description: "Mã màu AutoCAD của entity, thường 256 nghĩa là BYLAYER."
  },
  linetype: {
    label: "Kiểu nét CAD",
    description: "Linetype của entity, ví dụ BYLAYER, CONTINUOUS, DASHED."
  },
  lineweight: {
    label: "Độ dày nét CAD",
    description: "Lineweight gốc của entity trong CAD."
  },
  transparency: {
    label: "Độ trong suốt CAD",
    description: "Transparency gốc của entity trong CAD."
  },
  source_file: {
    label: "File CAD nguồn",
    description: "Tên file CAD đã sinh ra feature này."
  },
  text: {
    label: "Nội dung chữ",
    description: "Text lấy từ TEXT, MTEXT, ATTRIB hoặc ATTDEF."
  },
  text_height: {
    label: "Chiều cao chữ",
    description: "Text height trong CAD."
  },
  rotation: {
    label: "Góc xoay",
    description: "Rotation của text/entity trong CAD, tính theo độ."
  },
  style: {
    label: "Text style",
    description: "Tên style chữ trong CAD."
  },
  closed: {
    label: "Đường khép kín",
    description: "Entity polyline/curve có khép kín hay không."
  },
  vertices: {
    label: "Danh sách đỉnh",
    description: "Các vertex gốc của polyline trước khi convert sang GeoJSON."
  },
  elevation: {
    label: "Cao độ",
    description: "Elevation/Z gốc của entity CAD nếu có."
  },
  radius: {
    label: "Bán kính",
    description: "Radius gốc của CIRCLE hoặc ARC."
  },
  start_angle: {
    label: "Góc bắt đầu",
    description: "Start angle của ARC trong CAD, tính theo độ."
  },
  end_angle: {
    label: "Góc kết thúc",
    description: "End angle của ARC trong CAD, tính theo độ."
  },
  solid_fill: {
    label: "Hatch solid fill",
    description: "Cho biết HATCH có phải vùng tô đặc hay không."
  },
  pattern_name: {
    label: "Tên pattern HATCH",
    description: "Tên mẫu hatch/fill gốc trong CAD."
  },
  associative: {
    label: "HATCH associative",
    description: "Cho biết HATCH có liên kết với boundary gốc hay không."
  },
  parent_type: {
    label: "Loại entity cha",
    description: "Entity cha đã sinh ra feature này, thường là INSERT hoặc DIMENSION."
  },
  parent_layer: {
    label: "Layer entity cha",
    description: "Layer đã resolve của INSERT/DIMENSION cha."
  },
  parent_raw_layer: {
    label: "Layer thô entity cha",
    description: "Layer gốc ghi trực tiếp trên INSERT/DIMENSION trước khi resolve kế thừa."
  },
  parent_handle: {
    label: "Handle entity cha",
    description: "CAD handle của INSERT/DIMENSION cha."
  },
  parent_block_name: {
    label: "Tên block cha",
    description: "Tên block gốc của INSERT đã được explode ra feature này."
  }
};

const POINT_PART_LABELS: Record<string, string> = {
  start: "Điểm bắt đầu",
  end: "Điểm kết thúc",
  insert: "Điểm chèn",
  center: "Tâm"
};

const AXIS_LABELS: Record<string, string> = {
  x: "X",
  y: "Y",
  z: "Z"
};

const MAP_PROPERTY_LABELS: Record<string, PropertyMetadata> = {
  sourceLayer: {
    label: "Layer nguồn trong app",
    description: "Tên layer nguồn khi feature được import hoặc export từ app."
  },
  sourceLayerId: {
    label: "ID layer nguồn",
    description: "ID layer nguồn trong app."
  },
  sourceLayerKind: {
    label: "Loại layer nguồn",
    description: "Nguồn layer trong app, ví dụ uploaded hoặc drawing."
  },
  sourceDatasetId: {
    label: "ID dataset nguồn",
    description: "ID dataset upload đã sinh ra feature."
  },
  sourceDatasetLayerId: {
    label: "ID layer dataset nguồn",
    description: "ID layer con trong dataset upload."
  },
  sourceCategory: {
    label: "Nhóm nguồn",
    description: "Nhóm dữ liệu nguồn, ví dụ cad hoặc gis."
  },
  georeferenceStatus: {
    label: "Trạng thái georeference",
    description: "Trạng thái georeference của feature/layer sau khi căn chỉnh CAD."
  }
};

export function propertyMetadata(key: string): PropertyMetadata {
  const mapName = stripPrefix(key, SYSTEM_PROPERTY_PREFIX);
  if (!mapName) {
    return {
      label: key,
      description: `Thuộc tính ${key}`
    };
  }

  const cadName = stripPrefix(mapName, CAD_PROPERTY_NAMESPACE);
  if (cadName) return cadPropertyMetadata(key, cadName);

  return MAP_PROPERTY_LABELS[mapName] ?? {
    label: humanizeName(mapName),
    description: `Thuộc tính hệ thống ${key}`
  };
}

function cadPropertyMetadata(key: string, cadName: string): PropertyMetadata {
  const pointPart = pointPartMetadata(cadName);
  if (pointPart) return pointPart;

  const known = CAD_PROPERTY_LABELS[cadName];
  if (known) return known;

  return {
    label: humanizeName(cadName),
    description: `Thuộc tính CAD ${key}`
  };
}

function pointPartMetadata(cadName: string): PropertyMetadata | null {
  const [part, axis] = cadName.split("_");
  if (!part || !axis || !(part in POINT_PART_LABELS) || !(axis in AXIS_LABELS)) return null;
  return {
    label: `${POINT_PART_LABELS[part]} ${AXIS_LABELS[axis]}`,
    description: `${AXIS_LABELS[axis]} coordinate của ${POINT_PART_LABELS[part].toLowerCase()} trong CAD.`
  };
}

function stripPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function humanizeName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
