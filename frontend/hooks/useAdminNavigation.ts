"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Feature from "ol/Feature";
import Map from "ol/Map";
import { Geometry } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";

import { geojsonFormat } from "@/lib/gis/geojson";
import { makeAdminHighlightStyle } from "@/lib/gis/styles";

export type AdminProvince = {
  code: string;
  name: string;
  center: [number, number];
  bbox: [number, number, number, number];
  wardCount: number;
};

export type AdminWard = {
  code: string;
  name: string;
  type: string;
  provinceCode: string;
  provinceName: string;
  center: [number, number];
  bbox: [number, number, number, number];
};

type AdminCenters = {
  provinces: AdminProvince[];
  wards: AdminWard[];
};

type AdminBoundaries = {
  provinces: Record<string, GeoJSON.Geometry>;
  wards: Record<string, GeoJSON.Geometry>;
};

type UseAdminNavigationOptions = {
  mapRef: MutableRefObject<Map | null>;
};

export function useAdminNavigation({ mapRef }: UseAdminNavigationOptions) {
  const [provinces, setProvinces] = useState<AdminProvince[]>([]);
  const [wards, setWards] = useState<AdminWard[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const boundariesRef = useRef<AdminBoundaries | null>(null);
  const highlightLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const highlightSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const clearHighlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAdminCenters() {
      try {
        const response = await fetch("/admin-centers.json");
        if (!response.ok) throw new Error("Không tải được danh sách đơn vị hành chính.");
        const data = (await response.json()) as AdminCenters;
        if (cancelled) return;
        setProvinces(data.provinces);
        setWards(data.wards);
        setSelectedProvinceCode(data.provinces[0]?.code ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được danh sách đơn vị hành chính.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAdminCenters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (clearHighlightTimeoutRef.current) window.clearTimeout(clearHighlightTimeoutRef.current);
      highlightSourceRef.current?.clear();
    };
  }, []);

  const provinceWards = useMemo(
    () => wards.filter((ward) => ward.provinceCode === selectedProvinceCode),
    [selectedProvinceCode, wards]
  );

  const selectedProvince = useMemo(
    () => provinces.find((province) => province.code === selectedProvinceCode) ?? null,
    [provinces, selectedProvinceCode]
  );

  const selectedWard = useMemo(
    () => provinceWards.find((ward) => ward.code === selectedWardCode) ?? null,
    [provinceWards, selectedWardCode]
  );

  const selectProvince = useCallback((code: string) => {
    setSelectedProvinceCode(code);
    setSelectedWardCode("");
  }, []);

  function goToAdminArea() {
    const map = mapRef.current;
    const target = selectedWard ?? selectedProvince;
    if (!map || !target) return;
    map.getView().animate({
      center: fromLonLat(target.center),
      zoom: zoomForBbox(target.bbox, Boolean(selectedWard)),
      duration: 450
    });
    showAdminHighlight(selectedWard ? "ward" : "province", selectedWard?.code ?? selectedProvince?.code ?? "");
  }

  // Tìm tỉnh/thành + phường/xã chứa một toạ độ (lon, lat) cho trước, cập
  // nhật lựa chọn trong panel "Đi tới" và tự động zoom/highlight tới đó.
  // Dùng khi có toạ độ suy ra từ nơi khác (ví dụ vị trí phát hiện được từ
  // file CAD) và muốn hiển thị lên panel "Đi tới" như thể người dùng vừa
  // tự chọn tỉnh/xã đó.
  const locateNear = useCallback(
    (lon: number, lat: number) => {
      const province = provinces.find((candidate) => pointInBbox(lon, lat, candidate.bbox)) ?? nearestByCenter(provinces, lon, lat);
      if (!province) return false;

      const candidateWards = wards.filter((candidate) => candidate.provinceCode === province.code);
      const ward = candidateWards.find((candidate) => pointInBbox(lon, lat, candidate.bbox)) ?? nearestByCenter(candidateWards, lon, lat);

      setSelectedProvinceCode(province.code);
      setSelectedWardCode(ward?.code ?? "");

      const map = mapRef.current;
      const target = ward ?? province;
      if (map) {
        map.getView().animate({
          center: fromLonLat([lon, lat]),
          zoom: zoomForBbox(target.bbox, Boolean(ward)),
          duration: 450
        });
        showAdminHighlight(ward ? "ward" : "province", ward?.code ?? province.code);
      }
      return true;
    },
    [provinces, wards, mapRef]
  );

  return {
    provinces,
    provinceWards,
    selectedProvinceCode,
    selectedWardCode,
    selectedProvince,
    selectedWard,
    loading,
    error,
    selectProvince,
    setSelectedWardCode,
    goToAdminArea,
    locateNear
  };

  async function loadBoundaries() {
    if (boundariesRef.current) return boundariesRef.current;
    const response = await fetch("/admin-boundaries.json");
    if (!response.ok) throw new Error("Không tải được boundary đơn vị hành chính.");
    const data = (await response.json()) as AdminBoundaries;
    boundariesRef.current = data;
    return data;
  }

  function ensureHighlightLayer(map: Map) {
    if (highlightSourceRef.current && highlightLayerRef.current) return highlightSourceRef.current;
    const source = new VectorSource<Feature<Geometry>>();
    const layer = new VectorLayer({
      source,
      style: makeAdminHighlightStyle()
    });
    layer.set("selectable", false);
    layer.setZIndex(9998);
    map.addLayer(layer);
    highlightSourceRef.current = source;
    highlightLayerRef.current = layer;
    return source;
  }

  async function showAdminHighlight(kind: "province" | "ward", code: string) {
    const map = mapRef.current;
    if (!map || !code) return;
    try {
      const boundaries = await loadBoundaries();
      const geometry = kind === "ward" ? boundaries.wards[code] : boundaries.provinces[code];
      if (!geometry) return;
      const source = ensureHighlightLayer(map);
      source.clear();
      const feature = new Feature<Geometry>(
        geojsonFormat.readGeometry(geometry, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857"
        }) as Geometry
      );
      source.addFeature(feature);
      if (clearHighlightTimeoutRef.current) window.clearTimeout(clearHighlightTimeoutRef.current);
      clearHighlightTimeoutRef.current = window.setTimeout(() => {
        source.clear();
        clearHighlightTimeoutRef.current = null;
      }, 2000);
    } catch {
      // Navigation should still work if the decorative highlight cannot be loaded.
    }
  }
}

function pointInBbox(lon: number, lat: number, bbox: [number, number, number, number]): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function nearestByCenter<T extends { center: [number, number] }>(items: T[], lon: number, lat: number): T | null {
  let closest: T | null = null;
  let closestDistance = Infinity;
  for (const item of items) {
    const dx = item.center[0] - lon;
    const dy = item.center[1] - lat;
    const distance = dx * dx + dy * dy;
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = item;
    }
  }
  return closest;
}

function zoomForBbox(bbox: [number, number, number, number], isWard: boolean) {
  const width = Math.abs(bbox[2] - bbox[0]);
  const height = Math.abs(bbox[3] - bbox[1]);
  const span = Math.max(width, height);
  if (isWard) {
    if (span > 0.35) return 10;
    if (span > 0.18) return 11;
    if (span > 0.08) return 12;
    if (span > 0.035) return 13;
    return 14;
  }
  if (span > 4) return 7;
  if (span > 2) return 8;
  if (span > 1) return 9;
  return 10;
}
