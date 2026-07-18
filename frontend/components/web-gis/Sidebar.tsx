import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";

import type { MapLayerState, NormalizedDataset, ToolMode } from "@/types/gis";
import type { PreviewMode } from "@/hooks/useDatasetUpload";
import { DrawTab } from "./tabs/DrawTab";
import { ExportTab } from "./tabs/ExportTab";
import { FeatureDetailTab, type SelectedFeatureInfo } from "./tabs/FeatureDetailTab";
import { FeaturesTab } from "./tabs/FeaturesTab";
import { LayersTab } from "./tabs/LayersTab";
import { NavigateTab } from "./tabs/NavigateTab";
import { UploadTab } from "./tabs/UploadTab";
import type { SidebarOption } from "./types";
import type { AdminProvince, AdminWard } from "@/hooks/useAdminNavigation";

export type SidebarNavOption = { id: SidebarOption; label: string; icon: ReactNode };

export function Sidebar({
  activeOption,
  setActiveOption,
  sidebarOptions,
  dataset,
  previewMode,
  selectedSourceLayerId,
  sourceCrs,
  loading,
  error,
  adminProvinces,
  adminProvinceWards,
  selectedAdminProvinceCode,
  selectedAdminWardCode,
  selectedAdminProvince,
  selectedAdminWard,
  adminNavigationLoading,
  adminNavigationError,
  setPreviewMode,
  setSelectedSourceLayerId,
  setSourceCrs,
  selectAdminProvince,
  setSelectedAdminWardCode,
  goToAdminArea,
  handleUpload,
  handleConvert,
  cadLocalDatasetIds,
  activeCadDatasetId,
  cadDatasetLabel,
  startCadGeoreference,
  restoreCadInitialAspectRatio,
  acceptCadGeoreference,
  cancelCadGeoreference,
  layers,
  activeLayerId,
  activeLayer,
  addDrawingLayer,
  updateLayer,
  updateLayers,
  openLayerFeatures,
  zoomLayer,
  zoomLayers,
  exportLayer,
  exportLayers,
  removeLayer,
  removeLayers,
  activeLayerFeatures,
  selectedFeature,
  selectedFeatures,
  selectedFeatureInfos,
  selectFeatureFromList,
  zoomToFeature,
  editFeature,
  deleteFeature,
  properties,
  newKey,
  newValue,
  setNewKey,
  setNewValue,
  applyProperties,
  addProperty,
  drawingTargetId,
  drawingLayers,
  tool,
  toolButtons,
  snapEnabled,
  freehandClosed,
  selectMapLayer,
  clearSelectedFeature,
  setTool,
  deleteSelectedFeature,
  setSnapEnabled,
  setFreehandClosed,
  undo,
  redo,
  selectedExportLayerId,
  setExportLayerId,
  exportMergedLayers,
  exportMergedToBackend,
  exportDrawnToBackend,
}: {
  activeOption: SidebarOption | null;
  setActiveOption: Dispatch<SetStateAction<SidebarOption | null>>;
  sidebarOptions: SidebarNavOption[];
  dataset: NormalizedDataset | null;
  previewMode: PreviewMode;
  selectedSourceLayerId: string;
  sourceCrs: string;
  loading: string;
  error: string;
  adminProvinces: AdminProvince[];
  adminProvinceWards: AdminWard[];
  selectedAdminProvinceCode: string;
  selectedAdminWardCode: string;
  selectedAdminProvince: AdminProvince | null;
  selectedAdminWard: AdminWard | null;
  adminNavigationLoading: boolean;
  adminNavigationError: string;
  setPreviewMode: Dispatch<SetStateAction<PreviewMode>>;
  setSelectedSourceLayerId: Dispatch<SetStateAction<string>>;
  setSourceCrs: Dispatch<SetStateAction<string>>;
  selectAdminProvince: (code: string) => void;
  setSelectedAdminWardCode: (code: string) => void;
  goToAdminArea: () => void;
  handleUpload: (file: File | null) => void;
  handleConvert: () => void;
  cadLocalDatasetIds: string[];
  activeCadDatasetId: string | null;
  cadDatasetLabel: (datasetId: string) => string;
  startCadGeoreference: (datasetId: string) => void;
  restoreCadInitialAspectRatio: () => void;
  acceptCadGeoreference: () => void;
  cancelCadGeoreference: () => void;
  layers: MapLayerState[];
  activeLayerId: string;
  activeLayer: MapLayerState | null;
  addDrawingLayer: () => void;
  updateLayer: (id: string, patch: Partial<MapLayerState>) => void;
  updateLayers: (ids: string[], patch: Partial<MapLayerState>) => void;
  openLayerFeatures: (id: string) => void;
  zoomLayer: (id: string) => void;
  zoomLayers: (ids: string[]) => void;
  exportLayer: (id: string) => void;
  exportLayers: (ids: string[], name: string) => void;
  removeLayer: (id: string) => void;
  removeLayers: (ids: string[]) => void;
  activeLayerFeatures: Feature<Geometry>[];
  selectedFeature: Feature<Geometry> | null;
  selectedFeatures: Feature<Geometry>[];
  selectedFeatureInfos: SelectedFeatureInfo[];
  selectFeatureFromList: (feature: Feature<Geometry>, additive?: boolean) => void;
  zoomToFeature: (feature: Feature<Geometry>) => void;
  editFeature: (feature: Feature<Geometry>) => void;
  deleteFeature: (layerId: string, feature: Feature<Geometry>, featureIndex: number) => void;
  properties: Record<string, unknown>;
  newKey: string;
  newValue: string;
  setNewKey: Dispatch<SetStateAction<string>>;
  setNewValue: Dispatch<SetStateAction<string>>;
  applyProperties: (next: Record<string, unknown>) => void;
  addProperty: () => void;
  drawingTargetId: string;
  drawingLayers: MapLayerState[];
  tool: ToolMode;
  toolButtons: Array<{ id: ToolMode; label: string }>;
  snapEnabled: boolean;
  freehandClosed: boolean;
  selectMapLayer: (id: string) => void;
  clearSelectedFeature: () => void;
  setTool: Dispatch<SetStateAction<ToolMode>>;
  deleteSelectedFeature: () => void;
  setSnapEnabled: Dispatch<SetStateAction<boolean>>;
  setFreehandClosed: Dispatch<SetStateAction<boolean>>;
  undo: () => void;
  redo: () => void;
  selectedExportLayerId: string;
  setExportLayerId: Dispatch<SetStateAction<string>>;
  exportMergedLayers: () => void;
  exportMergedToBackend: () => void;
  exportDrawnToBackend: () => void;
}) {
  return (
    <aside className="relative z-20 w-[72px] border-r border-[#cfd7d2] bg-white max-lg:border-b max-lg:border-r-0">
      <nav className="flex h-full w-[72px] shrink-0 flex-col gap-2 bg-white p-2 max-lg:h-[72px] max-lg:w-full max-lg:flex-row">
        {sidebarOptions.map((option) => (
          <button
            key={option.id}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium ${activeOption === option.id ? "bg-[#dff1ed] text-[#0f5f58]" : "text-[#516158] hover:bg-[#edf2ef]"}`}
            onClick={() => setActiveOption(option.id)}
            title={option.label}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </nav>

      {activeOption && <section className="absolute left-[72px] top-2 z-30 max-h-[calc(100vh-16px)] w-[420px] overflow-y-auto rounded-md border border-[#cfd7d2] bg-panel p-4 shadow-lg max-lg:left-2 max-lg:top-[80px] max-lg:w-[calc(100vw-16px)]">
        {activeOption === "upload" && (
          <UploadTab
            dataset={dataset}
            previewMode={previewMode}
            selectedSourceLayerId={selectedSourceLayerId}
            sourceCrs={sourceCrs}
            loading={loading}
            error={error}
            setPreviewMode={setPreviewMode}
            setSelectedSourceLayerId={setSelectedSourceLayerId}
            setSourceCrs={setSourceCrs}
            handleUpload={handleUpload}
            handleConvert={handleConvert}
            cadLocalDatasetIds={cadLocalDatasetIds}
            activeCadDatasetId={activeCadDatasetId}
            cadDatasetLabel={cadDatasetLabel}
            startCadGeoreference={startCadGeoreference}
            restoreCadInitialAspectRatio={restoreCadInitialAspectRatio}
            acceptCadGeoreference={acceptCadGeoreference}
            cancelCadGeoreference={cancelCadGeoreference}
            onClose={() => setActiveOption(null)}
          />
        )}

        {activeOption === "navigate" && (
          <NavigateTab
            provinces={adminProvinces}
            provinceWards={adminProvinceWards}
            selectedProvinceCode={selectedAdminProvinceCode}
            selectedWardCode={selectedAdminWardCode}
            selectedProvince={selectedAdminProvince}
            selectedWard={selectedAdminWard}
            loading={adminNavigationLoading}
            error={adminNavigationError}
            selectProvince={selectAdminProvince}
            setSelectedWardCode={setSelectedAdminWardCode}
            goToAdminArea={goToAdminArea}
            onClose={() => setActiveOption(null)}
          />
        )}

        {activeOption === "layers" && (
          <LayersTab
            layers={layers}
            activeLayerId={activeLayerId}
            addDrawingLayer={addDrawingLayer}
            updateLayer={updateLayer}
            updateLayers={updateLayers}
            openLayerFeatures={openLayerFeatures}
            zoomLayer={zoomLayer}
            zoomLayers={zoomLayers}
            exportLayer={exportLayer}
            exportLayers={exportLayers}
            removeLayer={removeLayer}
            removeLayers={removeLayers}
            onClose={() => setActiveOption(null)}
          />
        )}

        {activeOption === "features" && (
          <FeaturesTab
            activeLayer={activeLayer}
            activeLayerFeatures={activeLayerFeatures}
            selectedFeatures={selectedFeatures}
            setActiveOption={setActiveOption}
            selectFeatureFromList={selectFeatureFromList}
            zoomToFeature={zoomToFeature}
            editFeature={editFeature}
            deleteFeature={deleteFeature}
            onClose={() => setActiveOption(null)}
          />
        )}

        {activeOption === "feature-detail" && (
          <FeatureDetailTab
            selectedFeature={selectedFeature}
            selectedFeatureInfos={selectedFeatureInfos}
            properties={properties}
            newKey={newKey}
            newValue={newValue}
            setNewKey={setNewKey}
            setNewValue={setNewValue}
            applyProperties={applyProperties}
            addProperty={addProperty}
            setActiveOption={setActiveOption}
            onClose={() => setActiveOption(null)}
          />
        )}

        {activeOption === "draw" && (
          <DrawTab
            drawingTargetId={drawingTargetId}
            drawingLayers={drawingLayers}
            activeLayer={activeLayer}
            tool={tool}
            toolButtons={toolButtons}
            snapEnabled={snapEnabled}
            freehandClosed={freehandClosed}
            selectMapLayer={selectMapLayer}
            addDrawingLayer={addDrawingLayer}
            clearSelectedFeature={clearSelectedFeature}
            setTool={setTool}
            deleteSelectedFeature={deleteSelectedFeature}
            setSnapEnabled={setSnapEnabled}
            setFreehandClosed={setFreehandClosed}
            undo={undo}
            redo={redo}
            onClose={() => setActiveOption(null)}
          />
        )}

        {activeOption === "export" && (
          <ExportTab
            layers={layers}
            selectedExportLayerId={selectedExportLayerId}
            setExportLayerId={setExportLayerId}
            exportLayer={exportLayer}
            exportMergedLayers={exportMergedLayers}
            exportMergedToBackend={exportMergedToBackend}
            exportDrawnToBackend={exportDrawnToBackend}
            onClose={() => setActiveOption(null)}
          />
        )}
      </section>}
    </aside>
  );
}
