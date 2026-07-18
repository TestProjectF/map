"use client";

import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Feature from "ol/Feature";
import { getCenter } from "ol/extent";
import { Geometry } from "ol/geom";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { fromExtent } from "ol/geom/Polygon";
import ImageLayer from "ol/layer/Image";
import PointerInteraction from "ol/interaction/Pointer";
import Select from "ol/interaction/Select";
import Map from "ol/Map";
import VectorSource from "ol/source/Vector";
import ImageCanvas from "ol/source/ImageCanvas";

import { API_BASE } from "@/lib/api";
import { activeCorner, angle, findTransformHandleAtPixel, oppositeCorner, scaleCursor, scalesOnX, scalesOnY, toTransformExtent, updateBoundingBox } from "@/lib/gis/transform";
import type { LayerBundle, TransformHandle } from "@/lib/gis/types";
import type { MapLayerState } from "@/types/gis";

const CAD_VECTOR_MIN_ZOOM = 14;

type CadGeoreferenceOptions = {
  mapRef: MutableRefObject<Map | null>;
  layerRefs: MutableRefObject<globalThis.Map<string, LayerBundle>>;
  bboxSourceRef: MutableRefObject<VectorSource<Feature<Geometry>> | null>;
  selectRef: MutableRefObject<Select | null>;
  layers: MapLayerState[];
  layersRef: MutableRefObject<MapLayerState[]>;
  setLayers: Dispatch<SetStateAction<MapLayerState[]>>;
  activeLayerId: string;
  setActiveLayerFeatures: Dispatch<SetStateAction<Feature<Geometry>[]>>;
  clearSelectedFeature: () => void;
};

type GroupDragState = {
  mode: "translate" | "scale" | "rotate";
  handle?: TransformHandle;
  initialGeometries: Array<{ feature: Feature<Geometry>; geometry: Geometry }>;
  initialBox: Geometry;
  anchor: [number, number];
  initialActiveCorner: [number, number];
  startCoordinate: [number, number];
  initialVector: [number, number];
  initialAngle: number;
  changed: boolean;
  initialCorners?: Array<[number, number]>;
};

type RasterPreview = {
  layer: ImageLayer<ImageCanvas>;
  source: ImageCanvas;
  image: HTMLImageElement;
  overviewImage?: HTMLImageElement;
  initialCorners: Array<[number, number]>;
  corners: Array<[number, number]>;
  offscreenCanvas?: HTMLCanvasElement;
  _rafPending?: boolean;
  isDragging?: boolean;
};

export function useCadGeoreference({
  mapRef,
  layerRefs,
  bboxSourceRef,
  selectRef,
  layers,
  layersRef,
  setLayers,
  activeLayerId,
  setActiveLayerFeatures,
  clearSelectedFeature
}: CadGeoreferenceOptions) {
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [autoFitVersion, setAutoFitVersion] = useState(0);
  const activeDatasetIdRef = useRef<string | null>(null);
  const boxFeatureRef = useRef<Feature<Geometry> | null>(null);
  const dragRef = useRef<GroupDragState | null>(null);
  const pendingAutoFitRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  const completedAutoFitRef = useRef<Set<string>>(new Set());
  const initialAspectRatiosRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  const rasterPreviewsRef = useRef<globalThis.Map<string, RasterPreview>>(new globalThis.Map());

  const cadLocalDatasetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const layer of layers) {
      if (layer.kind === "uploaded" && layer.sourceCategory === "cad" && layer.datasetId && layer.georeferenceStatus !== "accepted") {
        ids.add(layer.datasetId);
      }
    }
    return [...ids];
  }, [layers]);

  useEffect(() => {
    activeDatasetIdRef.current = activeDatasetId;
    selectRef.current?.setActive(!activeDatasetId);
    if (activeDatasetId) selectRef.current?.getFeatures().clear();
    if (!activeDatasetId) {
      boxFeatureRef.current = null;
      return;
    }
    redrawDatasetBox(activeDatasetId);
  }, [activeDatasetId, layers, selectRef]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const datasetIds = new Set(layers.map((layer) => layer.datasetId).filter((id): id is string => Boolean(id)));
    for (const [datasetId, preview] of rasterPreviewsRef.current.entries()) {
      const datasetLayers = layers.filter((layer) => layer.datasetId === datasetId);
      if (!datasetIds.has(datasetId)) {
        mapRef.current?.removeLayer(preview.layer);
        rasterPreviewsRef.current.delete(datasetId);
        continue;
      }

      const accepted = datasetLayers.some((layer) => layer.georeferenceStatus === "accepted");
      preview.layer.setVisible(datasetLayers.some((layer) => layer.visible));
      preview.layer.setOpacity(Math.max(...datasetLayers.map((layer) => layer.opacity), 1));
      preview.layer.setMaxZoom(accepted ? CAD_VECTOR_MIN_ZOOM : Infinity);
      for (const state of datasetLayers) {
        layerRefs.current.get(state.id)?.layer.setMinZoom(accepted ? CAD_VECTOR_MIN_ZOOM : -Infinity);
      }
    }
  }, [layerRefs, layers, mapRef]);

  const datasetLabel = useCallback((datasetId: string) => {
    const firstLayer = layers.find((layer) => layer.datasetId === datasetId);
    return firstLayer?.name.split("/")[0] ?? datasetId;
  }, [layers]);

  const startCadGeoreference = useCallback((datasetId: string) => {
    clearSelectedFeature();
    rasterPreviewsRef.current.get(datasetId)?.layer.setVisible(true);
    setDatasetVectorsVisible(datasetId, false);
    rememberInitialAspectRatio(datasetId);
    setActiveDatasetId(datasetId);
    markDataset(datasetId, "fitting");
    redrawDatasetBox(datasetId);
    zoomToDataset(datasetId);
  }, [clearSelectedFeature]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitCadDatasetToView = useCallback((datasetId: string) => {
    const map = mapRef.current;
    const size = map?.getSize();
    if (!map || !size) return;
    const extent = datasetExtent(datasetId);
    if (!extent) return;
    const viewExtent = map.getView().calculateExtent(size);
    const sourceCenter = getCenter(extent) as [number, number];
    const viewCenter = getCenter(viewExtent) as [number, number];
    const sourceWidth = Math.max(extent[2] - extent[0], 1);
    const sourceHeight = Math.max(extent[3] - extent[1], 1);
    const viewWidth = Math.max(viewExtent[2] - viewExtent[0], 1);
    const viewHeight = Math.max(viewExtent[3] - viewExtent[1], 1);
    const scale = Math.min(viewWidth / sourceWidth, viewHeight / sourceHeight) * 0.45;
    if (!initialAspectRatiosRef.current.has(datasetId)) initialAspectRatiosRef.current.set(datasetId, sourceWidth / sourceHeight);

    transformRasterCorners(datasetId, (point) => {
      point.scale(scale, scale, sourceCenter);
      point.translate(viewCenter[0] - sourceCenter[0], viewCenter[1] - sourceCenter[1]);
    });
    rasterPreviewsRef.current.get(datasetId)?.layer.setVisible(true);
    setDatasetVectorsVisible(datasetId, false);
    markDataset(datasetId, "fitting");
    setActiveDatasetId(datasetId);
    redrawDatasetBox(datasetId);
    zoomToDataset(datasetId);
    refreshActiveLayerFeatures();
  }, [mapRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueCadDatasetAutoFit = useCallback((datasetId: string, expectedLayerCount: number) => {
    if (completedAutoFitRef.current.has(datasetId)) return;
    pendingAutoFitRef.current.set(datasetId, expectedLayerCount);
    setAutoFitVersion((version) => version + 1);
  }, []);

  const registerCadRasterPreview = useCallback((datasetId: string, _url: string, overviewUrl: string | undefined, bbox: [number, number, number, number]) => {
    const map = mapRef.current;
    if (!map) return;
    const previous = rasterPreviewsRef.current.get(datasetId);
    if (previous) map.removeLayer(previous.layer);

    const corners: Array<[number, number]> = [[bbox[0], bbox[3]], [bbox[2], bbox[3]], [bbox[2], bbox[1]], [bbox[0], bbox[1]]];
    const preview = {} as RasterPreview;
    preview.image = new Image(); // placeholder, replaced by overviewImage after accept
    preview.initialCorners = corners.map((point) => [...point] as [number, number]);
    preview.corners = corners;

    const source = new ImageCanvas({
      canvasFunction: (extent, resolution, pixelRatio, size) => {
        const canvas = document.createElement("canvas");
        canvas.width = size[0];
        canvas.height = size[1];
        const context = canvas.getContext("2d");
        if (!context) return canvas;

        const accepted = layersRef.current.some((l) => l.datasetId === datasetId && l.georeferenceStatus === "accepted");

        // Sau accept + ảnh overview đã load → dùng PNG cho zoom thấp
        if (accepted && preview.image.complete && preview.image.naturalWidth > 0) {
          const toPixel = ([x, y]: [number, number]) => [
            (x - extent[0]) / resolution * pixelRatio,
            (extent[3] - y) / resolution * pixelRatio
          ] as [number, number];
          const [tl, tr, , bl] = preview.corners.map(toPixel);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.setTransform(
            (tr[0] - tl[0]) / preview.image.naturalWidth,
            (tr[1] - tl[1]) / preview.image.naturalWidth,
            (bl[0] - tl[0]) / preview.image.naturalHeight,
            (bl[1] - tl[1]) / preview.image.naturalHeight,
            tl[0], tl[1]
          );
          context.drawImage(preview.image, 0, 0);
          return canvas;
        }

        // Trước accept → dùng offscreen canvas đã pre-render (fast drag)
        // Lần đầu: build offscreen canvas từ vector features
        if (!preview.offscreenCanvas) {
          const [s0, s1, , s3] = preview.initialCorners;
          const sw = Math.max(Math.abs(s1[0] - s0[0]), 1e-9);
          const sh = s3[1] - s0[1] || -1e-9;
          const OC = 4096;
          const datasetLayerIds = new Set(
            layersRef.current.filter((l) => l.datasetId === datasetId).map((l) => l.id)
          );
          let hasFeatures = false;
          for (const [id, bundle] of layerRefs.current.entries()) {
            if (datasetLayerIds.has(id) && bundle.source instanceof VectorSource && bundle.source.getFeatures().length > 0) { hasFeatures = true; break; }
          }
          if (hasFeatures) {
            const oc = document.createElement("canvas");
            oc.width = OC; oc.height = OC;
            const octx = oc.getContext("2d");
            if (octx) {
              const projectOC = (mx: number, my: number): [number, number] => [
                (mx - s0[0]) / sw * OC,
                (my - s0[1]) / sh * OC
              ];
              octx.strokeStyle = "rgba(15, 118, 110, 1)";
              octx.fillStyle = "rgba(20, 184, 166, 0.12)";
              octx.lineWidth = 1;
              octx.lineJoin = "round";
              octx.lineCap = "round";
              for (const [id, bundle] of layerRefs.current.entries()) {
                if (!datasetLayerIds.has(id) || !(bundle.source instanceof VectorSource)) continue;
                for (const feature of bundle.source.getFeatures()) {
                  const geometry = feature.getGeometry();
                  if (geometry) drawGeometryOnCanvas(octx, geometry, projectOC);
                }
              }
              preview.offscreenCanvas = oc;
            }
          }
        }

        // Đang drag → fast path: offscreen + setTransform
        if (preview.isDragging && preview.offscreenCanvas) {
          const oc = preview.offscreenCanvas;
          const [d0, d1, , d3] = preview.corners;
          const px0 = (d0[0] - extent[0]) / resolution * pixelRatio;
          const py0 = (extent[3] - d0[1]) / resolution * pixelRatio;
          const px1 = (d1[0] - extent[0]) / resolution * pixelRatio;
          const py1 = (extent[3] - d1[1]) / resolution * pixelRatio;
          const px3 = (d3[0] - extent[0]) / resolution * pixelRatio;
          const py3 = (extent[3] - d3[1]) / resolution * pixelRatio;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.setTransform(
            (px1 - px0) / oc.width, (py1 - py0) / oc.width,
            (px3 - px0) / oc.height, (py3 - py0) / oc.height,
            px0, py0
          );
          context.drawImage(oc, 0, 0);
          return canvas;
        }

        // Fallback: chưa có offscreen (feature chưa load) → render vector trực tiếp
        const [s0f, s1f, , s3f] = preview.initialCorners ?? preview.corners;
        const [d0f, d1f, , d3f] = preview.corners;
        const swf = (s1f[0] - s0f[0]) || 1e-9;
        const shf = (s3f[1] - s0f[1]) || 1e-9;
        const ta = (d1f[0] - d0f[0]) / swf, tb = (d1f[1] - d0f[1]) / swf;
        const tc = (d3f[0] - d0f[0]) / shf, td = (d3f[1] - d0f[1]) / shf;
        const te = d0f[0] - ta * s0f[0] - tc * s0f[1];
        const tf2 = d0f[1] - tb * s0f[0] - td * s0f[1];
        const project = (mx: number, my: number): [number, number] => [
          (ta * mx + tc * my + te - extent[0]) / resolution * pixelRatio,
          (extent[3] - (tb * mx + td * my + tf2)) / resolution * pixelRatio
        ];
        const datasetLayerIdsFb = new Set(
          layersRef.current.filter((l) => l.datasetId === datasetId).map((l) => l.id)
        );
        context.strokeStyle = "rgba(15, 118, 110, 1)";
        context.fillStyle = "rgba(20, 184, 166, 0.12)";
        context.lineWidth = pixelRatio;
        context.lineJoin = "round"; context.lineCap = "round";
        for (const [id, bundle] of layerRefs.current.entries()) {
          if (!datasetLayerIdsFb.has(id) || !(bundle.source instanceof VectorSource)) continue;
          for (const feature of bundle.source.getFeatures()) {
            const geometry = feature.getGeometry();
            if (geometry) drawGeometryOnCanvas(context, geometry, project);
          }
        }

        return canvas;
      },
      projection: map.getView().getProjection(),
      ratio: 1
    });

    const layer = new ImageLayer({ source, opacity: 1 });
    layer.set("selectable", false);
    layer.setZIndex(11);
    preview.layer = layer;
    preview.source = source;
    rasterPreviewsRef.current.set(datasetId, preview);
    map.addLayer(layer);
    setDatasetVectorsVisible(datasetId, false);
    setAutoFitVersion((version) => version + 1);

    if (overviewUrl) {
      const overviewImage = new Image();
      overviewImage.crossOrigin = "anonymous";
      overviewImage.onload = () => {
        preview.overviewImage = overviewImage;
        if (layersRef.current.some((l) => l.datasetId === datasetId && l.georeferenceStatus === "accepted")) {
          preview.image = overviewImage;
          preview.source.changed();
        }
      };
      overviewImage.src = `${API_BASE}${overviewUrl}`;
    }
  }, [mapRef, layerRefs, layersRef]); // eslint-disable-line react-hooks/exhaustive-deps


  const restoreCadInitialAspectRatio = useCallback(() => {
    const datasetId = activeDatasetIdRef.current;
    if (!datasetId) return;
    rememberInitialAspectRatio(datasetId);
    const initialAspectRatio = initialAspectRatiosRef.current.get(datasetId);
    const extent = datasetExtent(datasetId);
    if (!initialAspectRatio || !extent) return;

    const center = getCenter(extent) as [number, number];
    const width = extent[2] - extent[0];
    const height = extent[3] - extent[1];
    if (width <= 0 || height <= 0) return;

    const currentAspectRatio = width / height;
    let nextWidth = width;
    let nextHeight = height;
    if (currentAspectRatio > initialAspectRatio) {
      nextWidth = height * initialAspectRatio;
    } else {
      nextHeight = width / initialAspectRatio;
    }

    transformRasterCorners(datasetId, (point) => point.scale(nextWidth / width, nextHeight / height, center));
    markDataset(datasetId, "fitting");
    redrawDatasetBox(datasetId);
    refreshActiveLayerFeatures();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const [datasetId, expectedLayerCount] of pendingAutoFitRef.current.entries()) {
      const datasetLayers = layers.filter((layer) => layer.datasetId === datasetId && layer.sourceCategory === "cad");
      const readyLayerCount = datasetLayers.filter((layer) => layerRefs.current.has(layer.id)).length;
      if (datasetLayers.length < expectedLayerCount || readyLayerCount < expectedLayerCount || !rasterPreviewsRef.current.has(datasetId)) continue;

      pendingAutoFitRef.current.delete(datasetId);
      completedAutoFitRef.current.add(datasetId);
      window.requestAnimationFrame(() => fitCadDatasetToView(datasetId));
    }
  }, [autoFitVersion, fitCadDatasetToView, layerRefs, layers]);

  const acceptCadGeoreference = useCallback(() => {
    const datasetId = activeDatasetIdRef.current;
    if (!datasetId) return;
    applyRasterTransformToVectors(datasetId);
    const preview = rasterPreviewsRef.current.get(datasetId);
    if (preview?.overviewImage) {
      preview.image = preview.overviewImage;
      preview.source.changed();
    }
    setDatasetVectorsVisible(datasetId, true);
    markDataset(datasetId, "accepted");
    bboxSourceRef.current?.clear();
    boxFeatureRef.current = null;
    setActiveDatasetId(null);
  }, [bboxSourceRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelCadGeoreference = useCallback(() => {
    const datasetId = activeDatasetIdRef.current;
    if (datasetId) {
      markDataset(datasetId, "local");
    }
    bboxSourceRef.current?.clear();
    boxFeatureRef.current = null;
    setActiveDatasetId(null);
  }, [bboxSourceRef]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const interaction = new PointerInteraction({
      handleDownEvent: (event) => {
        const datasetId = activeDatasetIdRef.current;
        const boxFeature = boxFeatureRef.current;
        const boxGeometry = boxFeature?.getGeometry();
        if (!datasetId) return false;
        if (!boxGeometry) {
          if (clickedDatasetFeatureAtPixel(datasetId, event.pixel)) {
            redrawDatasetBox(datasetId);
            return true;
          }
          return false;
        }

        const handleFeature = findTransformHandleAtPixel(map, event.pixel);
        const handle = handleFeature?.get("transformHandle") as TransformHandle | undefined;
        const clickedBox = handle ? true : Boolean(
          map.forEachFeatureAtPixel(
            event.pixel,
            (feature) => (feature.get("transformBox") ? feature : undefined),
            {
              hitTolerance: 4,
              layerFilter: (layer) => layer.get("selectable") === false
            }
          )
        );
        if (!clickedBox) {
          if (clickedDatasetFeatureAtPixel(datasetId, event.pixel)) {
            redrawDatasetBox(datasetId);
          } else {
            bboxSourceRef.current?.clear();
            boxFeatureRef.current = null;
            return false;
          }
          return true;
        }

        const coordinate = event.coordinate as [number, number];
        const extent = toTransformExtent(boxGeometry.getExtent());
        if (!extent) return false;
        const center = getCenter(extent) as [number, number];
        const preview = rasterPreviewsRef.current.get(datasetId);
        const initialGeometries: Array<{ feature: Feature<Geometry>; geometry: Geometry }> = [];
        if (!preview) return false;

        if (handle) {
          const anchor = handle === "rotate" ? center : oppositeCorner(handle, extent);
          const initialActiveCorner = handle === "rotate" ? coordinate : activeCorner(handle, extent);
          dragRef.current = {
            mode: handle === "rotate" ? "rotate" : "scale",
            handle,
            initialGeometries,
            initialBox: boxGeometry.clone(),
            anchor,
            initialActiveCorner,
            startCoordinate: coordinate,
            initialVector: [initialActiveCorner[0] - anchor[0], initialActiveCorner[1] - anchor[1]],
            initialAngle: angle(anchor, coordinate),
            changed: false,
            initialCorners: preview.corners.map((point) => [...point] as [number, number])
          };
          map.getTargetElement().style.cursor = handle === "rotate" ? "grabbing" : scaleCursor(handle);
          return true;
        }

        dragRef.current = {
          mode: "translate",
          initialGeometries,
          initialBox: boxGeometry.clone(),
          anchor: center,
          initialActiveCorner: coordinate,
          startCoordinate: coordinate,
          initialVector: [0, 0],
          initialAngle: 0,
          changed: false,
          initialCorners: preview.corners.map((point) => [...point] as [number, number])
        };
        map.getTargetElement().style.cursor = "grabbing";
        return true;
      },
      handleDragEvent: (event) => {
        const drag = dragRef.current;
        const datasetId = activeDatasetIdRef.current;
        if (!drag || !datasetId) return;

        const coordinate = event.coordinate as [number, number];
        const transformGeometry = (geometry: Geometry) => {
          const next = geometry.clone();
          if (drag.mode === "translate") {
            next.translate(coordinate[0] - drag.startCoordinate[0], coordinate[1] - drag.startCoordinate[1]);
          } else if (drag.mode === "rotate") {
            next.rotate(angle(drag.anchor, coordinate) - drag.initialAngle, drag.anchor);
          } else {
            const targetCorner: [number, number] = [
              drag.initialActiveCorner[0] + coordinate[0] - drag.startCoordinate[0],
              drag.initialActiveCorner[1] + coordinate[1] - drag.startCoordinate[1]
            ];
            const nextVector: [number, number] = [targetCorner[0] - drag.anchor[0], targetCorner[1] - drag.anchor[1]];
            const sx = scalesOnX(drag.handle) && drag.initialVector[0] !== 0 ? nextVector[0] / drag.initialVector[0] : 1;
            const sy = scalesOnY(drag.handle) && drag.initialVector[1] !== 0 ? nextVector[1] / drag.initialVector[1] : 1;
            next.scale(sx, sy, drag.anchor);
          }
          return next;
        };

        const preview = rasterPreviewsRef.current.get(datasetId);
        if (preview && drag.initialCorners) {
          preview.isDragging = true;
          preview.corners = drag.initialCorners.map((coordinate) => {
            const point = new Point(coordinate);
            return (transformGeometry(point) as Point).getCoordinates() as [number, number];
          });
          // rAF throttle: giới hạn render tối đa 60fps khi drag
          if (!preview._rafPending) {
            preview._rafPending = true;
            requestAnimationFrame(() => {
              preview._rafPending = false;
              preview.source.changed();
            });
          }
        }
        const nextBox = transformGeometry(drag.initialBox);
        boxFeatureRef.current = new Feature<Geometry>(nextBox);
        updateBoundingBox(bboxSourceRef.current!, boxFeatureRef.current);
        drag.changed = true;
        refreshActiveLayerFeatures();
      },
      handleMoveEvent: (event) => {
        const target = map.getTargetElement();
        if (!activeDatasetIdRef.current) return;
        const handle = findTransformHandleAtPixel(map, event.pixel)?.get("transformHandle") as TransformHandle | undefined;
        if (handle === "rotate") {
          target.style.cursor = "grab";
        } else if (handle) {
          target.style.cursor = scaleCursor(handle);
        } else {
          target.style.cursor = "";
        }
      },
      handleUpEvent: () => {
        dragRef.current = null;
        map.getTargetElement().style.cursor = "";
        const datasetId = activeDatasetIdRef.current;
        if (datasetId) {
          redrawDatasetBox(datasetId);
          // Thả chuột → tắt isDragging, re-render vector sắc nét
          const preview = rasterPreviewsRef.current.get(datasetId);
          if (preview) {
            preview.isDragging = false;
            preview.source.changed();
          }
        }
        return false;
      },
      stopDown: (handled) => handled
    });
    map.addInteraction(interaction);
    return () => {
      map.removeInteraction(interaction);
    };
  }, [bboxSourceRef, layerRefs, mapRef]); // eslint-disable-line react-hooks/exhaustive-deps

  function datasetFeatures(datasetId: string) {
    const ids = new Set(layersRef.current.filter((layer) => layer.datasetId === datasetId).map((layer) => layer.id));
    return [...ids].flatMap((id) => {
      const source = layerRefs.current.get(id)?.source;
      return source instanceof VectorSource ? source.getFeatures() : [];
    });
  }

  function forEachDatasetGeometry(datasetId: string, callback: (geometry: Geometry) => void) {
    for (const feature of datasetFeatures(datasetId)) {
      const geometry = feature.getGeometry();
      if (geometry) callback(geometry);
    }
  }

  function datasetExtent(datasetId: string): [number, number, number, number] | null {
    const raster = rasterPreviewsRef.current.get(datasetId);
    if (raster) {
      const xs = raster.corners.map((point) => point[0]);
      const ys = raster.corners.map((point) => point[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    const extents = datasetFeatures(datasetId)
      .map((feature) => feature.getGeometry()?.getExtent())
      .filter((extent): extent is number[] => Array.isArray(extent) && extent.every(Number.isFinite));
    if (extents.length === 0) return null;
    const firstExtent = extents[0]!;
    return extents.reduce<[number, number, number, number]>(
      (acc, extent) => [Math.min(acc[0], extent[0]), Math.min(acc[1], extent[1]), Math.max(acc[2], extent[2]), Math.max(acc[3], extent[3])],
      [firstExtent[0], firstExtent[1], firstExtent[2], firstExtent[3]]
    );
  }

  function rememberInitialAspectRatio(datasetId: string) {
    if (initialAspectRatiosRef.current.has(datasetId)) return;
    const extent = datasetExtent(datasetId);
    if (!extent) return;
    const width = extent[2] - extent[0];
    const height = extent[3] - extent[1];
    if (width > 0 && height > 0) initialAspectRatiosRef.current.set(datasetId, width / height);
  }

  function redrawDatasetBox(datasetId: string) {
    const extent = datasetExtent(datasetId);
    const source = bboxSourceRef.current;
    if (!extent || !source) return;
    const raster = rasterPreviewsRef.current.get(datasetId);
    const boxGeometry = raster
      ? new Polygon([[...raster.corners, raster.corners[0]]])
      : fromExtent(extent);
    const box = new Feature<Geometry>(boxGeometry);
    boxFeatureRef.current = box;
    updateBoundingBox(source, box);
  }

  function zoomToDataset(datasetId: string) {
    const map = mapRef.current;
    const extent = datasetExtent(datasetId);
    if (!map || !extent) return;
    map.getView().fit(extent, { padding: [72, 72, 72, 72], maxZoom: 18, duration: 220 });
  }

  function clickedDatasetFeatureAtPixel(datasetId: string, pixel: number[]) {
    const ids = new Set(layersRef.current.filter((layer) => layer.datasetId === datasetId).map((layer) => layer.id));
    const map = mapRef.current;
    if (!map) return false;
    return Boolean(
      map.forEachFeatureAtPixel(
        pixel,
        (_feature, layer) => (layer && [...ids].some((id) => layerRefs.current.get(id)?.layer === layer) ? true : undefined),
        { hitTolerance: 6 }
      )
    );
  }

  function markDataset(datasetId: string, status: NonNullable<MapLayerState["georeferenceStatus"]>) {
    setLayers((current) => current.map((layer) => (layer.datasetId === datasetId ? { ...layer, georeferenceStatus: status } : layer)));
  }

  function refreshActiveLayerFeatures() {
    const source = layerRefs.current.get(activeLayerId)?.source;
    if (source instanceof VectorSource) setActiveLayerFeatures(source.getFeatures());
  }

  function transformRasterCorners(datasetId: string, callback: (point: Point) => void) {
    const preview = rasterPreviewsRef.current.get(datasetId);
    if (!preview) return;
    preview.corners = preview.corners.map((coordinate) => {
      const point = new Point(coordinate);
      callback(point);
      return point.getCoordinates() as [number, number];
    });
    preview.source.changed();
  }

  function setDatasetVectorsVisible(datasetId: string, visible: boolean) {
    for (const layer of layersRef.current.filter((item) => item.datasetId === datasetId)) {
      layerRefs.current.get(layer.id)?.layer.setVisible(visible && layer.visible);
    }
  }

  function applyRasterTransformToVectors(datasetId: string) {
    const preview = rasterPreviewsRef.current.get(datasetId);
    if (!preview) return;
    const [s0, s1, , s3] = preview.initialCorners;
    const [d0, d1, , d3] = preview.corners;
    const sourceWidth = s1[0] - s0[0];
    const sourceHeight = s3[1] - s0[1];
    if (!sourceWidth || !sourceHeight) return;
    const a = (d1[0] - d0[0]) / sourceWidth;
    const b = (d1[1] - d0[1]) / sourceWidth;
    const c = (d3[0] - d0[0]) / sourceHeight;
    const d = (d3[1] - d0[1]) / sourceHeight;
    const e = d0[0] - a * s0[0] - c * s0[1];
    const f = d0[1] - b * s0[0] - d * s0[1];
    forEachDatasetGeometry(datasetId, (geometry) => {
      geometry.applyTransform((input, output, stride) => {
        const target = output ?? input;
        const coordinateStride = stride ?? 2;
        for (let index = 0; index < input.length; index += coordinateStride) {
          const x = input[index];
          const y = input[index + 1];
          target[index] = a * x + c * y + e;
          target[index + 1] = b * x + d * y + f;
          for (let offset = 2; offset < coordinateStride; offset += 1) target[index + offset] = input[index + offset];
        }
        return target;
      });
    });
    refreshActiveLayerFeatures();
  }

  return {
    activeCadDatasetId: activeDatasetId,
    cadLocalDatasetIds,
    datasetLabel,
    startCadGeoreference,
    fitCadDatasetToView,
    restoreCadInitialAspectRatio,
    queueCadDatasetAutoFit,
    registerCadRasterPreview,
    acceptCadGeoreference,
    cancelCadGeoreference
  };
}

function drawGeometryOnCanvas(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  project: (mx: number, my: number) => [number, number]
): void {
  const type = geometry.getType();
  if (type === "Point") {
    const c = (geometry as Point).getCoordinates();
    const [px, py] = project(c[0], c[1]);
    ctx.beginPath();
    ctx.arc(px, py, ctx.lineWidth * 1.5, 0, Math.PI * 2);
    const prev = ctx.fillStyle;
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
    ctx.fillStyle = prev;
  } else if (type === "MultiPoint") {
    for (const c of (geometry as MultiPoint).getCoordinates()) {
      const [px, py] = project(c[0], c[1]);
      ctx.beginPath();
      ctx.arc(px, py, ctx.lineWidth * 1.5, 0, Math.PI * 2);
      const prev = ctx.fillStyle;
      ctx.fillStyle = ctx.strokeStyle as string;
      ctx.fill();
      ctx.fillStyle = prev;
    }
  } else if (type === "LineString") {
    const coords = (geometry as LineString).getCoordinates();
    if (coords.length < 2) return;
    ctx.beginPath();
    const [sx, sy] = project(coords[0][0], coords[0][1]);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < coords.length; i++) {
      const [px, py] = project(coords[i][0], coords[i][1]);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (type === "MultiLineString") {
    for (const line of (geometry as MultiLineString).getCoordinates()) {
      if (line.length < 2) continue;
      ctx.beginPath();
      const [sx, sy] = project(line[0][0], line[0][1]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < line.length; i++) {
        const [px, py] = project(line[i][0], line[i][1]);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  } else if (type === "Polygon") {
    const rings = (geometry as Polygon).getCoordinates();
    if (!rings.length || rings[0].length < 3) return;
    ctx.beginPath();
    for (const ring of rings) {
      const [sx, sy] = project(ring[0][0], ring[0][1]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < ring.length; i++) {
        const [px, py] = project(ring[i][0], ring[i][1]);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  } else if (type === "MultiPolygon") {
    for (const polygon of (geometry as MultiPolygon).getCoordinates()) {
      if (!polygon.length || polygon[0].length < 3) continue;
      ctx.beginPath();
      for (const ring of polygon) {
        const [sx, sy] = project(ring[0][0], ring[0][1]);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < ring.length; i++) {
          const [px, py] = project(ring[i][0], ring[i][1]);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    }
  }
}
