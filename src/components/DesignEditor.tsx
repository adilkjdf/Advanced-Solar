import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maptalks from 'maptalks';
import { ThreeLayer } from 'maptalks.three';
import * as THREE from 'three';
import { ProjectData, Design, FieldSegment } from '../types/project';
import { ArrowLeft, Check, RotateCcw, RotateCw, Settings, LayoutGrid, Crosshair, GitBranch, PlusCircle, Plus, Trash2 } from 'lucide-react';
import { formatArea, formatDistance } from '../utils/mapUtils';
import CreateFieldSegmentPanel from './CreateFieldSegmentPanel';

interface DesignEditorProps {
  project: ProjectData;
  design: Design;
  onBack: () => void;
}

type EditorTool = 'none' | 'draw' | 'edit' | 'delete';

const DesignEditor: React.FC<DesignEditorProps> = ({ project, design, onBack }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maptalks.Map | null>(null);
  
  const [activeSidebarTab, setActiveSidebarTab] = useState('mechanical');
  const [activeTool, setActiveTool] = useState<EditorTool>('none');
  
  const [fieldSegments, setFieldSegments] = useState<FieldSegment[]>([]);
  const [currentArea, setCurrentArea] = useState('0.0 ft²');

  const drawToolRef = useRef<maptalks.DrawTool | null>(null);
  const segmentLayerRef = useRef<maptalks.VectorLayer | null>(null);
  const labelLayerRef = useRef<maptalks.VectorLayer | null>(null);
  
  const ghostMarkerRef = useRef<maptalks.Marker | null>(null);
  const tempLineRef = useRef<maptalks.LineString | null>(null);
  const tempLabelRef = useRef<maptalks.Label | null>(null);
  const startMarkerRef = useRef<maptalks.Marker | null>(null);
  const isClosingRef = useRef(false);
  const vertexMarkersRef = useRef<maptalks.Marker[]>([]);

  const defaultSymbol = {
    lineColor: '#f97316',
    lineWidth: 3,
    polygonFill: '#f97316',
    polygonOpacity: 0.3,
  };
  const closingSymbol = { ...defaultSymbol, lineColor: '#22c55e' };
  const startMarkerSymbol = {
    markerFile: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>'),
    markerWidth: 20, 
    markerHeight: 20,
  };
  const startMarkerHoverSymbol = {
    markerFile: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>'),
    markerWidth: 20, 
    markerHeight: 20,
  };
  const vertexMarkerSymbol = {
    markerType: 'ellipse',
    markerFill: '#22c55e',
    markerWidth: 10,
    markerHeight: 10,
    markerLineWidth: 0
  };

  const handleMouseMove = useCallback((e: any) => {
    if (activeTool !== 'draw' || !mapInstanceRef.current) return;
    let coord = e.coordinate;
    if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
      return;
    }

    const currentGeom = drawToolRef.current?.getCurrentGeometry();
    if (!currentGeom) {
        if (!ghostMarkerRef.current) {
            ghostMarkerRef.current = new maptalks.Marker(coord, {
              symbol: vertexMarkerSymbol
            }).addTo(labelLayerRef.current!);
          } else {
            ghostMarkerRef.current.setCoordinates(coord);
          }
        return;
    };

    const coords = currentGeom.getCoordinates()[0];
    if (coords.length < 1) return;

    // Check if we're close to the starting point for closure
    const firstVertex = coords[0];
    if (firstVertex && typeof firstVertex.x === 'number' && typeof firstVertex.y === 'number' &&
        coord && typeof coord.x === 'number' && typeof coord.y === 'number') {
      const distance = firstVertex.distanceTo(coord);
      const snapThreshold = 15 * mapInstanceRef.current.getScale() / 1000;

      if (coords.length > 2 && distance < snapThreshold) {
        coord = firstVertex;
        isClosingRef.current = true;
        currentGeom.setSymbol(closingSymbol);
        if (startMarkerRef.current) {
          startMarkerRef.current.setSymbol(startMarkerHoverSymbol);
        }
      } else {
        isClosingRef.current = false;
        currentGeom.setSymbol(defaultSymbol);
        if (startMarkerRef.current) {
          startMarkerRef.current.setSymbol(startMarkerSymbol);
        }
      }
    }

    ghostMarkerRef.current?.setCoordinates(coord);

    if (coords.length > 0) {
      const lastVertex = coords[coords.length - 1];
      if (tempLineRef.current) tempLineRef.current.remove();
      if (tempLabelRef.current) tempLabelRef.current.remove();

      tempLineRef.current = new maptalks.LineString([lastVertex, coord], {
        symbol: isClosingRef.current ? closingSymbol : defaultSymbol
      }).addTo(labelLayerRef.current!);
      
      const distance = tempLineRef.current.getLength();
      tempLabelRef.current = new maptalks.Label(formatDistance(distance), tempLineRef.current.getCenter(), {
        'textPlacement' : 'line',
        'textDy': -15,
        'boxStyle' : { 'padding' : [6, 4], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
        'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
      }).addTo(labelLayerRef.current!);
    }
  }, [activeTool]);

  const updateDistanceLabels = useCallback((geometry: maptalks.Polygon) => {
    if (!geometry || !labelLayerRef.current) return;
    
    // Clear existing labels and vertex markers
    const oldLabels = labelLayerRef.current.getGeometries().filter(g => g.getProperties() && g.getProperties().isDistanceLabel);
    if (oldLabels.length) {
      labelLayerRef.current.removeGeometry(oldLabels);
    }
    vertexMarkersRef.current.forEach(marker => marker.remove());
    vertexMarkersRef.current = [];
  
    const coords = geometry.getCoordinates()[0];
    if (coords.length < 2) return;
    
    // Add green vertex markers
    coords.forEach((coord, index) => {
      const marker = new maptalks.Marker(coord, {
        symbol: vertexMarkerSymbol
      }).addTo(labelLayerRef.current!);
      vertexMarkersRef.current.push(marker);
    });

    // Add distance labels for each segment
    for (let i = 0; i < coords.length - 1; i++) {
      const line = new maptalks.LineString([coords[i], coords[i + 1]]);
      const label = new maptalks.Label(formatDistance(line.getLength()), line.getCenter(), {
        'textPlacement' : 'line',
        'textDy': -15,
        'boxStyle' : { 'padding' : [6, 4], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
        'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
      });
      label.setProperties({ isDistanceLabel: true });
      labelLayerRef.current.addGeometry(label);
    }
  }, []);

  // ... rest of the component remains the same ...

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      {/* ... existing JSX ... */}
    </div>
  );
};

export default DesignEditor;