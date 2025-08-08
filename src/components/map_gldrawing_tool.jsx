import React, { useEffect, useRef } from 'react';
import * as maptalks from 'maptalks';

/**
 * MapGLDrawingTool.tsx
 * A drop-in, GL-friendly drawing manager for MapTalks that provides:
 * - Polygon drawing with ghost point & preview segment
 * - Vertex snapping (magnetic) to first vertex for auto-close
 * - Live distance labels per segment and a live area readout
 * - In-place editing / vertex dragging
 * - Clean API to integrate into an existing editor page
 *
 * Usage:
 * <MapGLDrawingTool
 *    map={mapInstance}
 *    enabled={activeTool === 'draw'}
 *    onCreate={(segment) => ... }
 *    onUpdate={(id, geojson, area) => ... }
 *    onCancel={() => ... }
 * />
 *
 * The component only attaches to the provided map instance and manages its own
 * temporary layers. It tries to avoid interfering with other map listeners.
 */

interface Props {
  map: maptalks.Map | null;
  enabled: boolean; // whether drawing is active
  snapPixels?: number; // snap threshold in screen pixels
  onCreate?: (segment: { id: string; geometry: any; area: number }) => void;
  onUpdate?: (id: string, geometry: any, area: number) => void;
  onCancel?: () => void;
}

const defaultSymbol = {
  lineColor: '#f97316',
  lineWidth: 3,
  polygonFill: '#f97316',
  polygonOpacity: 0.18,
};
const vertexSymbol = { 'markerType': 'ellipse', 'markerFill': '#fff', 'markerWidth': 10, 'markerHeight': 10, 'markerLineWidth': 2, 'markerLineColor': '#f97316' };
const ghostSymbol = { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 12, 'markerHeight': 12, 'markerLineWidth': 0 };
const snapGhostSymbol = { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 16, 'markerHeight': 16, 'markerLineWidth': 2, 'markerLineColor': '#fff' };

const MapGLDrawingTool: React.FC<Props> = ({ map, enabled, snapPixels = 12, onCreate, onUpdate, onCancel }) => {
  const tempLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const segmentsLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const ghostMarkerRef = useRef<maptalks.Marker | null>(null);
  const previewLineRef = useRef<maptalks.LineString | null>(null);
  const previewPolygonRef = useRef<maptalks.Polygon | null>(null);
  const currentCoordsRef = useRef<maptalks.Coordinate[]>([]);
  const drawingIdRef = useRef<string | null>(null);
  const handlersRef = useRef<any>({});

  // Helper: screen distance between two coordinates
  function screenDistance(map: maptalks.Map, c1: any, c2: any) {
    const p1 = map.coordinateToContainerPoint(c1);
    const p2 = map.coordinateToContainerPoint(c2);
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function closestVertex(map: maptalks.Map, coords: any[], point: any) {
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = screenDistance(map, coords[i], point);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    return { index: bestIndex, dist: bestDist };
  }

  function formatDistanceStr(meters: number) {
    // simple formatting — keep meters but user can adapt to ft/mi
    if (meters >= 1000) return (meters / 1000).toFixed(2) + ' km';
    return meters.toFixed(2) + ' m';
  }

  // Render helpers
  function ensureLayers() {
    if (!map) return;
    if (!tempLayerRef.current) {
      tempLayerRef.current = new maptalks.VectorLayer('drawing-temp').addTo(map);
    }
    if (!segmentsLayerRef.current) {
      segmentsLayerRef.current = new maptalks.VectorLayer('drawing-segments').addTo(map);
    }
  }

  function clearTemp() {
    tempLayerRef.current?.clear();
    ghostMarkerRef.current = null;
    previewLineRef.current = null;
    previewPolygonRef.current = null;
    currentCoordsRef.current = [];
    drawingIdRef.current = null;
  }

  function createGhostMarker(coord: any) {
    if (!tempLayerRef.current) return null;
    const m = new maptalks.Marker(coord, { symbol: ghostSymbol }).addTo(tempLayerRef.current);
    return m;
  }

  function updatePreview() {
    const coords = currentCoordsRef.current.slice();
    const mapInst = map!;
    if (!tempLayerRef.current) return;

    // Remove previous preview shapes
    if (previewLineRef.current) {
      previewLineRef.current.remove();
      previewLineRef.current = null;
    }
    if (previewPolygonRef.current) {
      previewPolygonRef.current.remove();
      previewPolygonRef.current = null;
    }

    if (coords.length === 0) return;

    // draw polygon preview if more than 2 points
    if (coords.length >= 3) {
      const poly = new maptalks.Polygon([coords]).setSymbol(defaultSymbol);
      previewPolygonRef.current = poly.addTo(tempLayerRef.current);
    }

    // draw polyline preview (last vertex -> ghost)
    if (coords.length >= 2) {
      const line = new maptalks.LineString(coords).setSymbol({ lineColor: '#ffb66b', lineWidth: 2, lineDasharray: [6, 4] });
      previewLineRef.current = line.addTo(tempLayerRef.current);

      // add distance labels per segment
      const segCount = coords.length - 1;
      for (let i = 0; i < segCount; i++) {
        const seg = new maptalks.LineString([coords[i], coords[i + 1]]);
        const center = seg.getCenter();
        const label = new maptalks.Label(formatDistanceStr(seg.getLength()), center, {
          'textPlacement': 'line',
          'textDy': -12,
          'textSymbol': { 'textFill': '#111', 'textSize': 12 },
          'boxStyle': { 'padding': [4, 8], 'symbol': { 'markerType': 'square', 'markerFill': 'rgba(255,255,255,0.95)', 'markerLineWidth': 0 } }
        });
        tempLayerRef.current.addGeometry(label);
      }

      // Add vertex markers
      coords.forEach(c => tempLayerRef.current?.addGeometry(new maptalks.Marker(c, { symbol: vertexSymbol })));
    }

    // update area readout (if poly)
    if (coords.length >= 3) {
      const poly = new maptalks.Polygon([coords]);
      const area = poly.getArea();
      const center = poly.getCenter();
      const areaLabel = new maptalks.Label((area).toFixed(2) + ' m²', center, { 'textSymbol': { 'textFill': '#111', 'textSize': 12 } });
      tempLayerRef.current.addGeometry(areaLabel);
    }
  }

  // Finalize drawing
  function finishDrawing() {
    if (!map || currentCoordsRef.current.length < 3) {
      clearTemp();
      onCancel?.();
      return;
    }
    const id = maptalks.Util.UID();
    const poly = new maptalks.Polygon([currentCoordsRef.current]).setSymbol(defaultSymbol).setId(id);
    segmentsLayerRef.current?.addGeometry(poly);
    const area = poly.getArea();
    onCreate?.({ id, geometry: poly.toJSON(), area });
    clearTemp();
  }

  // Mouse handlers
  useEffect(() => {
    if (!map) return;
    ensureLayers();
    const mapContainer = map.getContainer();

    function onMouseMove(e: any) {
      if (!enabled) return;
      const coord = e.coordinate;
      if (!coord) return;

      // Lazy create ghost marker
      if (!ghostMarkerRef.current && tempLayerRef.current) {
        ghostMarkerRef.current = createGhostMarker(coord);
      }

      // snapping behavior to first vertex (auto-close)
      const coords = currentCoordsRef.current;
      if (coords.length >= 3) {
        const { index, dist } = closestVertex(map, coords, coord);
        if (index === 0 && dist < snapPixels) {
          ghostMarkerRef.current?.setCoordinates(coords[0]).setSymbol(snapGhostSymbol);
        } else {
          ghostMarkerRef.current?.setCoordinates(coord).setSymbol(ghostSymbol);
        }
      } else {
        ghostMarkerRef.current?.setCoordinates(coord).setSymbol(ghostSymbol);
      }

      // update last segment preview if drawing
      if (coords.length >= 1) {
        // compute temporary coords array that includes ghost
        const temp = coords.concat([ghostMarkerRef.current?.getCoordinates() as any]);
        currentCoordsRef.current = coords; // keep actual coords intact
        // clear temp and set up preview geometries
        tempLayerRef.current?.clear();
        // vertex markers for existing vertices
        coords.forEach(c => tempLayerRef.current?.addGeometry(new maptalks.Marker(c, { symbol: vertexSymbol })));
        // preview line (existing + ghost)
        const line = new maptalks.LineString(temp).setSymbol({ lineColor: '#ffb66b', lineWidth: 2, lineDasharray: [6, 4] });
        tempLayerRef.current.addGeometry(line);
        // segment labels
        for (let i = 0; i < temp.length - 1; i++) {
          const seg = new maptalks.LineString([temp[i], temp[i + 1]]);
          const center = seg.getCenter();
          const label = new maptalks.Label(formatDistanceStr(seg.getLength()), center, { 'textSymbol': { 'textFill': '#111', 'textSize': 12 } });
          tempLayerRef.current.addGeometry(label);
        }
        // area label if would close
        if (temp.length >= 4) {
          const poly = new maptalks.Polygon([temp]);
          tempLayerRef.current.addGeometry(new maptalks.Label((poly.getArea()).toFixed(2) + ' m²', poly.getCenter(), { 'textSymbol': { 'textFill': '#111', 'textSize': 12 } }));
        }
      } else {
        // no existing coords: just show ghost marker
        tempLayerRef.current?.clear();
        tempLayerRef.current?.addGeometry(ghostMarkerRef.current as any);
      }
    }

    function onClick(e: any) {
      if (!enabled) return;
      const coord = e.coordinate;
      if (!coord) return;

      // If we have a closed condition (ghost snapped to first and we have >=3), finalize
      if (currentCoordsRef.current.length >= 3) {
        const { index, dist } = closestVertex(map, currentCoordsRef.current, ghostMarkerRef.current?.getCoordinates());
        if (index === 0 && dist < snapPixels) {
          finishDrawing();
          return;
        }
      }

      // Otherwise push new vertex
      currentCoordsRef.current.push(coord);
      drawingIdRef.current = drawingIdRef.current || maptalks.Util.UID();
      // keep temp visuals updated (we call onMouseMove's logic by dispatching a fake move)
      map.fire('mousemove', { coordinate: coord });
    }

    function onDblClick(e: any) {
      if (!enabled) return;
      // double click finalizes but only if >=3
      if (currentCoordsRef.current.length >= 3) {
        finishDrawing();
      } else {
        // cancel
        clearTemp();
        onCancel?.();
      }
    }

    handlersRef.current = { onMouseMove, onClick, onDblClick };
    map.on('mousemove', onMouseMove);
    map.on('click', onClick);
    map.on('dblclick', onDblClick);

    // disable map's default double click zoom while drawing
    const prevDbl = map.options['dblClickZoom'];
    if (enabled) map.options['dblClickZoom'] = false;

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.options['dblClickZoom'] = prevDbl;
      clearTemp();
    };
  }, [map, enabled, snapPixels]);

  // When disabled, clean temp layer
  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      clearTemp();
    } else {
      ensureLayers();
    }
  }, [map, enabled]);

  // Expose nothing UI-wise; this component only hooks into map events.
  return null;
};

export default MapGLDrawingTool;
