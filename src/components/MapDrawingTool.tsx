import React, { useEffect, useRef } from 'react';
import * as maptalks from 'maptalks';
import { FieldSegment } from '../types/project';
import { formatArea, formatDistance } from '../utils/mapUtils';

const defaultSymbol = {
  lineColor: '#f97316',
  lineWidth: 3,
  polygonFill: '#f97316',
  polygonOpacity: 0.3,
};
const closingSymbol = { ...defaultSymbol, lineColor: '#22c55e' };
const vertexSymbol = { 'markerType': 'ellipse', 'markerFill': '#ffffff', 'markerWidth': 8, 'markerHeight': 8, 'markerLineWidth': 2, 'markerLineColor': '#f97316' };
const ghostSymbol = { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 10, 'markerHeight': 10, 'markerLineWidth': 0 };
const snapGhostSymbol = { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 14, 'markerHeight': 14, 'markerLineWidth': 2, 'markerLineColor': '#ffffff' };

interface MapDrawingToolProps {
  map: maptalks.Map | null;
  enabled: boolean;
  onUpdate: (data: { area: string }) => void;
  onCreate: (segment: FieldSegment) => void;
  onCancel: () => void;
}

const MapDrawingTool: React.FC<MapDrawingToolProps> = ({ map, enabled, onUpdate, onCreate, onCancel }) => {
  const tempLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const currentCoordsRef = useRef<maptalks.Coordinate[]>([]);
  const isSnappedRef = useRef(false);

  const redrawTempLayer = (cursorCoord: maptalks.Coordinate) => {
    if (!map || !tempLayerRef.current) return;
    tempLayerRef.current.clear();

    const coords = currentCoordsRef.current;
    if (coords.length === 0) return;

    let finalCoord = cursorCoord;
    isSnappedRef.current = false;

    if (coords.length >= 3) {
      const distance = map.distanceTo(cursorCoord, coords[0]);
      const snapThreshold = map.getResolution() * 15;
      if (distance < snapThreshold) {
        finalCoord = coords[0];
        isSnappedRef.current = true;
      }
    }

    const ghostMarker = new maptalks.Marker(finalCoord, { symbol: isSnappedRef.current ? snapGhostSymbol : ghostSymbol });
    tempLayerRef.current.addGeometry(ghostMarker);

    const allPoints = [...coords, finalCoord];
    const currentSymbol = isSnappedRef.current ? closingSymbol : defaultSymbol;
    
    const previewPolygon = new maptalks.Polygon([allPoints], { symbol: currentSymbol });
    tempLayerRef.current.addGeometry(previewPolygon);

    coords.forEach(c => tempLayerRef.current?.addGeometry(new maptalks.Marker(c, { symbol: vertexSymbol })));

    for (let i = 0; i < allPoints.length - 1; i++) {
      const line = new maptalks.LineString([allPoints[i], allPoints[i + 1]]);
      const label = new maptalks.Label(formatDistance(line.getLength()), line.getCenter(), {
        'textPlacement' : 'line', 'textDy': -15,
        'boxStyle' : { 'padding' : [6, 4], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
        'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
      });
      tempLayerRef.current.addGeometry(label);
    }
    
    onUpdate({ area: formatArea(previewPolygon.getArea()) });
  };

  const finishDrawing = () => {
    if (currentCoordsRef.current.length < 3) {
      cancelDrawing();
      return;
    }
    const finalPolygon = new maptalks.Polygon([currentCoordsRef.current]);
    const newSegment: FieldSegment = {
      id: maptalks.Util.UID(),
      geometry: finalPolygon.toJSON(),
      area: finalPolygon.getArea(),
    };
    onCreate(newSegment);
    resetState();
  };

  const cancelDrawing = () => {
    resetState();
    onCancel();
  };

  const resetState = () => {
    tempLayerRef.current?.clear();
    currentCoordsRef.current = [];
    isSnappedRef.current = false;
  };

  useEffect(() => {
    if (!map) return;

    if (enabled && !tempLayerRef.current) {
      tempLayerRef.current = new maptalks.VectorLayer('custom-drawing-tool').addTo(map);
    }

    const handleMouseMove = (e: any) => redrawTempLayer(e.coordinate);
    const handleClick = () => {
      if (isSnappedRef.current) {
        finishDrawing();
      } else {
        const lastCoord = tempLayerRef.current?.getGeometries().find(g => g instanceof maptalks.Marker && g.getSymbol() === ghostSymbol || g.getSymbol() === snapGhostSymbol) as maptalks.Marker;
        if (lastCoord) {
          currentCoordsRef.current.push(lastCoord.getCoordinates());
        }
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrawing();
    };

    if (enabled) {
      map.getContainer().style.cursor = 'crosshair';
      map.on('mousemove', handleMouseMove);
      map.on('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (map && map.getContainer()) {
        map.getContainer().style.cursor = 'grab';
      }
      map.off('mousemove', handleMouseMove);
      map.off('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      if (enabled) {
        resetState();
      }
    };
  }, [map, enabled, onCancel, onCreate, onUpdate]);

  return null;
};

export default MapDrawingTool;