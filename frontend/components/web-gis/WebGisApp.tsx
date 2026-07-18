"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileUp, Layers, Loader2, MapPinned, PencilRuler } from "lucide-react";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";
import VectorSource from "ol/source/Vector";

import { MapCanvas } from "@/components/web-gis/MapCanvas";
import { Sidebar, type SidebarNavOption } from "@/components/web-gis/Sidebar";
import type { SidebarOption } from "@/components/web-gis/types";
import { useDatasetUpload } from "@/hooks/useDatasetUpload";
import { useCadGeoreference } from "@/hooks/useCadGeoreference";
import { useAdminNavigation } from "@/hooks/useAdminNavigation";
import { useDrawingTools } from "@/hooks/useDrawingTools";
import { useFeatureSelection } from "@/hooks/useFeatureSelection";
import { useFeatureTransform } from "@/hooks/useFeatureTransform";
import { useLayerHistory } from "@/hooks/useLayerHistory";
import { useMapLayers } from "@/hooks/useMapLayers";
import { mergeDrawingLayers, mergeMapLayers, writeSource } from "@/lib/gis/geojson";
import { saveExport } from "@/lib/api";
import type { ToolMode } from "@/types/gis";
import { useOpenLayersMap } from "@/hooks/useOpenLayersMap";
import { findFeatureLayerId } from "@/lib/gis/transform";

const toolButtons: Array<{ id: ToolMode; label: string }> = [
  { id: "select", label: "Select" },
  { id: "draw-point", label: "Point" },
  { id: "draw-line", label: "Line" },
  { id: "draw-polygon", label: "Polygon" },
  { id: "draw-rectangle", label: "Rectangle" },
  { id: "draw-circle", label: "Circle" },
  { id: "draw-freehand", label: "Freehand" },
  { id: "modify", label: "Modify" },
  { id: "delete", label: "Delete" }
];

const sidebarOptions: SidebarNavOption[] = [
  { id: "upload", label: "Upload", icon: <FileUp size={19} /> },
  { id: "navigate", label: "Đi tới", icon: <MapPinned size={19} /> },
  { id: "layers", label: "Layer", icon: <Layers size={19} /> },
  { id: "draw", label: "Vẽ", icon: <PencilRuler size={19} /> },
  { id: "export", label: "Export", icon: <Download size={19} /> }
];

export default function WebGisApp() {
  const [activeOption, setActiveOption] = useState<SidebarOption | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ feature: Feature<Geometry> | null; additive: boolean; version: number }>({ feature: null, additive: false, version: 0 });
  const deleteSelectedFeatureRef = useRef<() => boolean>(() => false);
  const handleFeatureSelect = useCallback((feature: Feature<Geometry> | null, additive = false) => {
    setPendingSelection((current) => ({ feature, additive, version: current.version + 1 }));
  }, []);

  const map = useOpenLayersMap({
    onFeatureSelect: handleFeatureSelect
  });

  const featureSelection = useFeatureSelection({
    mapRef: map.mapRef,
    selectRef: map.selectRef,
    bboxSourceRef: map.bboxSourceRef,
    setActiveOption
  });
  const { receiveSelectedFeature } = featureSelection;

  const mapLayers = useMapLayers({
    mapRef: map.mapRef,
    layerRefs: map.layerRefs,
    setActiveLayerFeatures: featureSelection.setActiveLayerFeatures,
    clearSelectedFeature: featureSelection.clearSelectedFeature
  });

  const history = useLayerHistory({
    layerRefs: map.layerRefs,
    bboxSourceRef: map.bboxSourceRef,
    activeLayerId: mapLayers.activeLayerId,
    selectedFeatures: featureSelection.selectedFeatures,
    replaceSelectedFeatures: featureSelection.replaceSelectedFeatures,
    setActiveLayerFeatures: featureSelection.setActiveLayerFeatures,
    setLayers: mapLayers.setLayers,
    clearSelectedFeature: featureSelection.clearSelectedFeature
  });

  const drawing = useDrawingTools({
    mapRef: map.mapRef,
    layerRefs: map.layerRefs,
    activeLayer: mapLayers.activeLayer,
    captureDrawHistory: history.captureDrawHistory
  });

  const cadGeoreference = useCadGeoreference({
    mapRef: map.mapRef,
    layerRefs: map.layerRefs,
    bboxSourceRef: map.bboxSourceRef,
    selectRef: map.selectRef,
    layers: mapLayers.layers,
    layersRef: mapLayers.layersRef,
    setLayers: mapLayers.setLayers,
    activeLayerId: mapLayers.activeLayerId,
    setActiveLayerFeatures: featureSelection.setActiveLayerFeatures,
    clearSelectedFeature: featureSelection.clearSelectedFeature
  });

  const adminNavigation = useAdminNavigation({
    mapRef: map.mapRef
  });

  useEffect(() => {
    map.setFeaturePickingEnabled(drawing.tool === "select" && !cadGeoreference.activeCadDatasetId);
  }, [cadGeoreference.activeCadDatasetId, drawing.tool, map]);

  useFeatureTransform({
    mapRef: map.mapRef,
    layerRefs: map.layerRefs,
    bboxSourceRef: map.bboxSourceRef,
    selectRef: map.selectRef,
    selectedFeatures: featureSelection.selectedFeatures,
    selectedFeaturesRef: featureSelection.selectedFeaturesRef,
    activeLayerIdRef: mapLayers.activeLayerIdRef,
    layersRef: mapLayers.layersRef,
    tool: drawing.tool,
    toolRef: drawing.toolRef,
    replaceSelectedFeatures: featureSelection.replaceSelectedFeatures,
    setActiveLayerFeatures: featureSelection.setActiveLayerFeatures,
    setHistory: history.setHistory,
    setRedoStack: history.setRedoStack,
    setActiveOption,
    disabled: Boolean(cadGeoreference.activeCadDatasetId)
  });

  const datasetUpload = useDatasetUpload({
    addUploadLayer: mapLayers.addUploadLayer,
    onCadLocalDatasetReady: cadGeoreference.queueCadDatasetAutoFit,
    onCadRasterReady: cadGeoreference.registerCadRasterPreview
  });

  useEffect(() => {
    // Nếu backend phát hiện được tọa độ từ file CAD, dùng nó để căn bản đồ vào
    // vị trí đó. Nếu không có dữ liệu, bản đồ vẫn giữ vị trí khởi tạo mặc định.
    const bbox = datasetUpload.dataset?.extra?.suggestedBboxWgs84;
    if (Array.isArray(bbox) && bbox.length === 4) {
      const [west, south, east, north] = bbox as [number, number, number, number];
      adminNavigation.locateNear((west + east) / 2, (south + north) / 2);
      return;
    }

    const point = datasetUpload.dataset?.extra?.suggestedPointWgs84;
    if (Array.isArray(point) && point.length === 2) {
      const [lon, lat] = point as [number, number];
      adminNavigation.locateNear(lon, lat);
    }
  }, [datasetUpload.dataset, adminNavigation.locateNear]);

  useEffect(() => {
    receiveSelectedFeature(pendingSelection.feature, pendingSelection.additive);
  }, [pendingSelection, receiveSelectedFeature]);

  const selectedFeatureInfos = featureSelection.selectedFeatures.map((feature, index) => {
    const layerId = findFeatureLayerId(feature, map.layerRefs.current);
    const layer = mapLayers.layers.find((item) => item.id === layerId);
    const props = feature.getProperties();
    const datasetName = layer?.datasetName ?? String(props.MAP_CAD_source_file ?? "Dữ liệu trên bản đồ");
    const fallbackLayerName = layer?.name ?? "Không xác định";
    const layerName = String(props.MAP_CAD_layer ?? (datasetName && fallbackLayerName.startsWith(`${datasetName}/`) ? fallbackLayerName.slice(datasetName.length + 1) : fallbackLayerName));
    const rawSourceFileName = typeof props.MAP_CAD_source_file === "string" ? props.MAP_CAD_source_file : "";
    const sourceFileName = /^source\.dxf$/i.test(rawSourceFileName.trim()) ? "" : rawSourceFileName;
    const layerPath = datasetName && fallbackLayerName.startsWith(`${datasetName}/`) ? fallbackLayerName.slice(datasetName.length + 1) : fallbackLayerName;
    const pathSegments = compactPathSegments([datasetName, sourceFileName, layerPath, layerName]);
    const label = props.name ?? props.Name ?? props.id ?? props.ID ?? props.MAP_CAD_text ?? props.MAP_CAD_type ?? `Feature ${index + 1}`;
    return {
      label: String(label),
      geometryType: feature.getGeometry()?.getType() ?? "Geometry",
      layerName,
      datasetName,
      pathSegments
    };
  });

  function addDrawingLayer() {
    const source = mapLayers.addDrawingLayer();
    if (source) history.resetHistory(writeSource(source));
  }

  function selectMapLayer(id: string) {
    const snapshot = mapLayers.selectMapLayer(id);
    history.resetHistory(snapshot);
  }

  function openLayerFeatures(id: string) {
    selectMapLayer(id);
    setActiveOption("features");
  }

  function removeLayer(id: string) {
    const shouldReturnToLayers = mapLayers.activeLayerId === id && (activeOption === "features" || activeOption === "feature-detail");
    mapLayers.removeLayer(id);
    if (shouldReturnToLayers) setActiveOption("layers");
  }

  function removeLayers(ids: string[]) {
    const shouldReturnToLayers = ids.includes(mapLayers.activeLayerId) && (activeOption === "features" || activeOption === "feature-detail");
    mapLayers.removeLayers(ids);
    if (shouldReturnToLayers) setActiveOption("layers");
  }

  function editFeature(feature: Feature<Geometry>) {
    drawing.setTool("select");
    featureSelection.editFeature(feature);
  }

  function deleteFeatures(features: Feature<Geometry>[]) {
    if (features.length === 0) return false;
    const targets = new Set(features);
    const changedLayerIds = new Set<string>();
    for (const [id, bundle] of map.layerRefs.current.entries()) {
      if (!(bundle.source instanceof VectorSource)) continue;
      for (const feature of features) {
        if (bundle.source.hasFeature(feature)) {
          bundle.source.removeFeature(feature);
          changedLayerIds.add(id);
        }
      }
    }
    if (changedLayerIds.size === 0) return false;
    const currentSelection = featureSelection.selectedFeaturesRef.current;
    if (currentSelection.some((feature) => targets.has(feature))) {
      featureSelection.replaceSelectedFeatures(currentSelection.filter((feature) => !targets.has(feature)), false);
    }
    featureSelection.setActiveLayerFeatures((current) => current.filter((feature) => !targets.has(feature)));
    mapLayers.setLayers((current) => current.map((layer) => {
      if (!changedLayerIds.has(layer.id)) return layer;
      const source = map.layerRefs.current.get(layer.id)?.source;
      return { ...layer, featureCount: source instanceof VectorSource ? source.getFeatures().length : 0 };
    }));
    if (changedLayerIds.has(mapLayers.activeLayerId)) {
      const source = map.layerRefs.current.get(mapLayers.activeLayerId)?.source;
      if (changedLayerIds.size === 1 && source instanceof VectorSource && mapLayers.layers.find((layer) => layer.id === mapLayers.activeLayerId)?.editable) history.captureDrawHistory();
    }
    return true;
  }

  function deleteFeature(layerId: string, feature: Feature<Geometry>, featureIndex: number) {
    const source = map.layerRefs.current.get(layerId)?.source;
    if (!(source instanceof VectorSource)) return;
    const sourceFeature = source.hasFeature(feature) ? feature : source.getFeatures()[featureIndex];
    if (sourceFeature) deleteFeatures([sourceFeature]);
  }

  function deleteSelectedFeature() {
    return deleteFeatures(featureSelection.selectedFeaturesRef.current);
  }

  useEffect(() => {
    deleteSelectedFeatureRef.current = deleteSelectedFeature;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTextEditingTarget(event.target)) return;
      if (deleteSelectedFeatureRef.current()) event.preventDefault();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function exportDrawnToBackend() {
    datasetUpload.setError("");
    datasetUpload.setLoading("Đang lưu GeoJSON lên backend...");
    try {
      await saveExport("drawn-layers", mergeDrawingLayers(mapLayers.layers, map.layerRefs.current));
    } catch (err) {
      datasetUpload.setError(err instanceof Error ? err.message : "Lưu export thất bại.");
    } finally {
      datasetUpload.setLoading("");
    }
  }

  async function exportMergedToBackend() {
    datasetUpload.setError("");
    datasetUpload.setLoading("Đang lưu GeoJSON gộp lên backend...");
    try {
      await saveExport("merged-layers", mergeMapLayers(mapLayers.layers, map.layerRefs.current));
    } catch (err) {
      datasetUpload.setError(err instanceof Error ? err.message : "Lưu export gộp thất bại.");
    } finally {
      datasetUpload.setLoading("");
    }
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#eef1ef] text-ink">
      <div
        className="grid h-full min-h-0 max-lg:grid-cols-1 max-lg:grid-rows-[minmax(420px,45vh)_minmax(420px,1fr)]"
        style={{ gridTemplateColumns: "72px minmax(0, 1fr)" }}
      >
        <Sidebar
          activeOption={activeOption}
          setActiveOption={setActiveOption}
          sidebarOptions={sidebarOptions}
          dataset={datasetUpload.dataset}
          previewMode={datasetUpload.previewMode}
          selectedSourceLayerId={datasetUpload.selectedSourceLayerId}
          sourceCrs={datasetUpload.sourceCrs}
          loading={datasetUpload.loading}
          error={datasetUpload.error}
          adminProvinces={adminNavigation.provinces}
          adminProvinceWards={adminNavigation.provinceWards}
          selectedAdminProvinceCode={adminNavigation.selectedProvinceCode}
          selectedAdminWardCode={adminNavigation.selectedWardCode}
          selectedAdminProvince={adminNavigation.selectedProvince}
          selectedAdminWard={adminNavigation.selectedWard}
          adminNavigationLoading={adminNavigation.loading}
          adminNavigationError={adminNavigation.error}
          setPreviewMode={datasetUpload.setPreviewMode}
          setSelectedSourceLayerId={datasetUpload.setSelectedSourceLayerId}
          setSourceCrs={datasetUpload.setSourceCrs}
          selectAdminProvince={adminNavigation.selectProvince}
          setSelectedAdminWardCode={adminNavigation.setSelectedWardCode}
          goToAdminArea={adminNavigation.goToAdminArea}
          handleUpload={datasetUpload.handleUpload}
          handleConvert={datasetUpload.handleConvert}
          cadLocalDatasetIds={cadGeoreference.cadLocalDatasetIds}
          activeCadDatasetId={cadGeoreference.activeCadDatasetId}
          cadDatasetLabel={cadGeoreference.datasetLabel}
          startCadGeoreference={cadGeoreference.startCadGeoreference}
          restoreCadInitialAspectRatio={cadGeoreference.restoreCadInitialAspectRatio}
          acceptCadGeoreference={cadGeoreference.acceptCadGeoreference}
          cancelCadGeoreference={cadGeoreference.cancelCadGeoreference}
          layers={mapLayers.layers}
          activeLayerId={mapLayers.activeLayerId}
          activeLayer={mapLayers.activeLayer}
          addDrawingLayer={addDrawingLayer}
          updateLayer={mapLayers.updateLayer}
          updateLayers={mapLayers.updateLayers}
          openLayerFeatures={openLayerFeatures}
          zoomLayer={mapLayers.zoomLayer}
          zoomLayers={mapLayers.zoomLayers}
          exportLayer={mapLayers.exportLayer}
          exportLayers={mapLayers.exportLayers}
          removeLayer={removeLayer}
          removeLayers={removeLayers}
          activeLayerFeatures={featureSelection.activeLayerFeatures}
          selectedFeature={featureSelection.selectedFeature}
          selectedFeatures={featureSelection.selectedFeatures}
          selectedFeatureInfos={selectedFeatureInfos}
          selectFeatureFromList={featureSelection.selectFeatureFromList}
          zoomToFeature={featureSelection.zoomToFeature}
          editFeature={editFeature}
          deleteFeature={deleteFeature}
          properties={featureSelection.properties}
          newKey={featureSelection.newKey}
          newValue={featureSelection.newValue}
          setNewKey={featureSelection.setNewKey}
          setNewValue={featureSelection.setNewValue}
          applyProperties={featureSelection.applyProperties}
          addProperty={featureSelection.addProperty}
          drawingTargetId={mapLayers.drawingTargetId}
          drawingLayers={mapLayers.drawingLayers}
          tool={drawing.tool}
          toolButtons={toolButtons}
          snapEnabled={drawing.snapEnabled}
          freehandClosed={drawing.freehandClosed}
          selectMapLayer={selectMapLayer}
          clearSelectedFeature={featureSelection.clearSelectedFeature}
          setTool={drawing.setTool}
          deleteSelectedFeature={deleteSelectedFeature}
          setSnapEnabled={drawing.setSnapEnabled}
          setFreehandClosed={drawing.setFreehandClosed}
          undo={history.undo}
          redo={history.redo}
          selectedExportLayerId={mapLayers.selectedExportLayerId}
          setExportLayerId={mapLayers.setExportLayerId}
          exportMergedLayers={mapLayers.exportMergedLayers}
          exportMergedToBackend={exportMergedToBackend}
          exportDrawnToBackend={exportDrawnToBackend}
        />
        <MapCanvas
          mapElement={map.mapElement}
          cursor={map.cursor}
          featurePicker={map.featurePicker}
          chooseFeature={map.chooseFeature}
          previewFeature={map.previewFeature}
          closeFeaturePicker={map.closeFeaturePicker}
        />
      </div>
      {datasetUpload.loading && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#10231d]/35 backdrop-blur-[2px]">
          <div className="flex w-[min(420px,calc(100vw-32px))] flex-col items-center gap-3 rounded-md border border-white/80 bg-white px-5 py-4 text-center shadow-xl">
            <Loader2 className="animate-spin text-[#0f766e]" size={28} aria-hidden="true" />
            <div className="text-sm font-semibold leading-5 text-[#24342c]">{datasetUpload.loading}</div>
          </div>
        </div>
      )}
    </main>
  );
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function compactPathSegments(values: string[]) {
  const result: string[] = [];
  for (const value of values) {
    for (const segment of value.split("/").map((item) => item.trim()).filter(Boolean)) {
      if (result.at(-1) !== segment) result.push(segment);
    }
  }
  return result;
}
