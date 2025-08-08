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

const defaultSymbol = {
  lineColor: '#f97316',
  lineWidth: 3,
  polygonFill: '#f97316',
  polygonOpacity: 0.3,
};
const closingSymbol = { ...defaultSymbol, lineColor: '#22c55e' };

const defaultGhostSymbol = { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 10, 'markerHeight': 10, 'markerLineWidth': 0 };
const snapGhostSymbol = { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 14, 'markerHeight': 14, 'markerLineWidth': 2, 'markerLineColor': '#ffffff' };

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
  const drawingIdRef = useRef<string | null>(null);
  const startMarkerRef = useRef<maptalks.Marker | null>(null);
  const snapTooltipRef = useRef<maptalks.Label | null>(null);
  const isSnappedRef = useRef(false);

  const updateDistanceLabels = useCallback((geometry: maptalks.Geometry, segmentId: string) => {
    if (!geometry || !labelLayerRef.current) return;
  
    const oldLabels = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === segmentId);
    if (oldLabels.length) {
      labelLayerRef.current.removeGeometry(oldLabels);
    }
  
    let coords;
    if (geometry instanceof maptalks.Polygon) {
      coords = geometry.getShell();
    } else if (geometry instanceof maptalks.LineString) {
      coords = geometry.getCoordinates();
    } else {
      return;
    }
  
    coords.forEach(coord => {
      const vertexMarker = new maptalks.Marker(coord, {
        symbol: { 'markerType': 'ellipse', 'markerFill': '#ffffff', 'markerWidth': 8, 'markerHeight': 8, 'markerLineWidth': 2, 'markerLineColor': '#f97316' }
      }).setProperties({ isVertex: true, segmentId: segmentId });
      labelLayerRef.current?.addGeometry(vertexMarker);
    });
  
    if (coords.length < 2) return;
  
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      if (!p2 || (p1.x === p2.x && p1.y === p2.y)) continue;
  
      const line = new maptalks.LineString([p1, p2]);
      const label = new maptalks.Label(formatDistance(line.getLength()), line.getCenter(), {
        'textPlacement': 'line',
        'textDy': -15,
        'boxStyle': { 'padding': [6, 4], 'symbol': { 'markerType': 'square', 'markerFill': 'rgba(0, 0, 0, 0.8)', 'markerLineWidth': 0 } },
        'textSymbol': { 'textFill': '#ffffff', 'textSize': 12 }
      });
      label.setProperties({ isDistanceLabel: true, segmentId: segmentId });
      labelLayerRef.current.addGeometry(label);
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (activeTool !== 'draw' || !mapInstanceRef.current || !drawToolRef.current) return;
    
    const map = mapInstanceRef.current;
    const drawTool = drawToolRef.current;
    let coord = e.coordinate;
    if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
      return;
    }

    if (!ghostMarkerRef.current && labelLayerRef.current) {
        ghostMarkerRef.current = new maptalks.Marker(coord, {
          symbol: defaultGhostSymbol
        }).addTo(labelLayerRef.current);
    }

    const ghostMarker = ghostMarkerRef.current;
    if (!ghostMarker) return;

    const currentGeom = drawTool.getCurrentGeometry();
    if (!currentGeom) {
        ghostMarker.setCoordinates(coord).show();
        return;
    };

    let coords = currentGeom.getCoordinates();
    if (currentGeom instanceof maptalks.Polygon) {
        coords = coords[0] || [];
    }

    let isSnapped = false;
    
    if (coords.length > 2) {
      const firstVertex = coords[0];
      const distance = coord.distanceTo(new maptalks.Coordinate(firstVertex));
      const snapThreshold = map.getResolution() * 15;

      if (distance < snapThreshold) {
        coord = new maptalks.Coordinate(firstVertex);
        isSnapped = true;
        drawTool.setSymbol(closingSymbol);
        ghostMarker.setCoordinates(firstVertex);
        ghostMarker.setSymbol(snapGhostSymbol);
        
        if (!snapTooltipRef.current && labelLayerRef.current) {
            snapTooltipRef.current = new maptalks.Label('Click to close shape', coord, {
                'boxStyle' : { 'padding' : [8, 6], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
                'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
            }).addTo(labelLayerRef.current);
        }
        if (snapTooltipRef.current) {
            snapTooltipRef.current.setCoordinates(coord).show();
        }

      } else {
        drawTool.setSymbol(defaultSymbol);
        ghostMarker.setCoordinates(coord);
        ghostMarker.setSymbol(defaultGhostSymbol);
        if (snapTooltipRef.current) {
            snapTooltipRef.current.hide();
        }
      }
    } else {
      ghostMarker.setCoordinates(coord);
      ghostMarker.setSymbol(defaultGhostSymbol);
    }
    isSnappedRef.current = isSnapped;

    if (tempLineRef.current) tempLineRef.current.remove();
    if (tempLabelRef.current) tempLabelRef.current.remove();
    
    const lastVertex = coords.length > 0 ? coords[coords.length - 1] : null;
    if (lastVertex) {
        const tempLine = new maptalks.LineString([lastVertex, coord], {
            symbol: {
                lineColor: isSnapped ? '#22c55e' : '#f97316',
                lineWidth: 2,
                lineDasharray: [5, 5]
            }
        });
        tempLine.addTo(labelLayerRef.current!);
        tempLineRef.current = tempLine;

        const distance = tempLine.getLength();
        const tempLabel = new maptalks.Label(formatDistance(distance), tempLine.getCenter(), {
            'textPlacement' : 'line',
            'textDy': -15,
            'boxStyle' : { 'padding' : [6, 4], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
            'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
        });
        tempLabel.addTo(labelLayerRef.current!);
        tempLabelRef.current = tempLabel;
    }
  }, [activeTool]);

  const setupDrawingListeners = useCallback(() => {
    const drawTool = drawToolRef.current;
    if (!drawTool) return;
    drawTool.off();
    drawTool.on('drawstart', (e: any) => {
      drawingIdRef.current = maptalks.Util.UID();
      
      startMarkerRef.current = new maptalks.Marker(e.coordinate, {
        interactive: false,
        symbol: {
          markerFile: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>'),
          markerWidth: 20, markerHeight: 20,
        }
      });
      startMarkerRef.current.setProperties({ isStartMarker: true });
      labelLayerRef.current?.addGeometry(startMarkerRef.current);
    });
    drawTool.on('drawvertex', (e: any) => {
      if (e.geometry && drawingIdRef.current) {
        if (tempLineRef.current) tempLineRef.current.remove();
        if (tempLabelRef.current) tempLabelRef.current.remove();
        tempLineRef.current = null;
        tempLabelRef.current = null;

        setCurrentArea(formatArea(e.geometry.getArea()));
        
        const lineString = new maptalks.LineString(e.geometry.getCoordinates()[0]);
        updateDistanceLabels(lineString, drawingIdRef.current);
      }
    });
    drawTool.on('drawend', (e: any) => {
      if (tempLineRef.current) tempLineRef.current.remove();
      if (tempLabelRef.current) tempLabelRef.current.remove();
      tempLineRef.current = null;
      tempLabelRef.current = null;

      if (snapTooltipRef.current) {
        snapTooltipRef.current.remove();
        snapTooltipRef.current = null;
      }

      ghostMarkerRef.current?.hide();
      drawTool.setSymbol(defaultSymbol);
      
      if (drawingIdRef.current && labelLayerRef.current) {
        const tempLabels = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === drawingIdRef.current);
        labelLayerRef.current.removeGeometry(tempLabels);
      }
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }

      if (!e.geometry) return;
      
      let polygon = e.geometry;
      let shell = polygon.getShell();

      if (shell.length > 3 && mapInstanceRef.current) {
        const lastPoint = shell[shell.length - 2];
        const secondLastPoint = shell[shell.length - 3];
        const lastSegmentLength = new maptalks.Coordinate(lastPoint).distanceTo(new maptalks.Coordinate(secondLastPoint));
        
        if (lastSegmentLength < mapInstanceRef.current.getResolution() * 2) {
            shell.splice(shell.length - 2, 1);
            polygon.setCoordinates(shell);
        }
      }

      const newSegmentId = maptalks.Util.UID();
      const newSegment: FieldSegment = {
        id: newSegmentId,
        geometry: polygon.toJSON(),
        area: polygon.getArea(),
      };
      
      updateDistanceLabels(polygon, newSegmentId);

      const finalPolygon = maptalks.Geometry.fromJSON(newSegment.geometry).setSymbol(defaultSymbol).setId(newSegment.id);
      segmentLayerRef.current?.addGeometry(finalPolygon);
      setFieldSegments(prev => [...prev, newSegment]);
      
      drawingIdRef.current = null;
      setActiveTool('none');
    });
  }, [updateDistanceLabels]);

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && project.coordinates) {
      const map = new maptalks.Map(mapContainerRef.current, {
        center: [project.coordinates.lng, project.coordinates.lat],
        zoom: 19, pitch: 0, bearing: 0, dragRotate: true,
        baseLayer: new maptalks.TileLayer('base', { urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' }),
      });
      mapInstanceRef.current = map;
      segmentLayerRef.current = new maptalks.VectorLayer('fieldSegments').addTo(map);
      labelLayerRef.current = new maptalks.VectorLayer('labels').addTo(map);
      drawToolRef.current = new maptalks.DrawTool({ mode: 'Polygon', symbol: defaultSymbol }).addTo(map);
      setupDrawingListeners();
      const threeLayer = new ThreeLayer('three', { forceRenderOnMoving: true, forceRenderOnRotating: true });
      threeLayer.prepareToDraw = (gl, scene) => {
        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(0, -10, 10).normalize();
        scene.add(light);
      };
      map.addLayer(threeLayer);
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }
  }, [project.coordinates, setupDrawingListeners]);

  const clearCurrentShape = () => {
    const drawTool = drawToolRef.current;
    if (drawTool) {
        drawTool.endDraw();
        drawTool.setSymbol(defaultSymbol);
    }
    
    const activeDrawingId = drawingIdRef.current;
    if (labelLayerRef.current && activeDrawingId) {
        const geomsToRemove = labelLayerRef.current.getGeometries().filter(g => {
            const props = g.getProperties();
            return props && props.segmentId === activeDrawingId;
        });
        labelLayerRef.current.removeGeometry(geomsToRemove);
    }

    if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
    }
    if (tempLineRef.current) tempLineRef.current.remove();
    if (tempLabelRef.current) tempLabelRef.current.remove();
    tempLineRef.current = null;
    tempLabelRef.current = null;
    
    if (snapTooltipRef.current) {
        snapTooltipRef.current.remove();
        snapTooltipRef.current = null;
    }

    ghostMarkerRef.current?.hide();
    setCurrentArea('0.0 ft²');
  };

  const handleDeleteSegment = (segmentId: string) => {
    const segmentLayer = segmentLayerRef.current;
    if (segmentLayer) {
      const geometryToRemove = segmentLayer.getGeometryById(segmentId);
      if (geometryToRemove) geometryToRemove.remove();
    }
    if (labelLayerRef.current) {
        const labelsToRemove = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === segmentId);
        labelLayerRef.current.removeGeometry(labelsToRemove);
    }
    setFieldSegments(prev => prev.filter(s => s.id !== segmentId));
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    const drawTool = drawToolRef.current;
    const segmentLayer = segmentLayerRef.current;
    if (!map || !drawTool || !segmentLayer) return;

    const handleDeleteClick = (e: any) => handleDeleteSegment(e.target.getId());

    const handleMapClick = () => {
      if (isSnappedRef.current) {
        drawTool.endDraw();
      }
    };

    if (activeTool === 'draw') {
      map.getContainer().style.cursor = 'crosshair';
      drawTool.on('drawstart', handleMouseMove);
      map.on('mousemove', handleMouseMove);
      map.on('click', handleMapClick);
      drawTool.setMode('Polygon').enable();
    } else if (activeTool === 'edit') {
      segmentLayer.getGeometries().forEach((geom: any) => {
        geom.startEdit();
        geom.on('editend', (e: any) => {
          const editedGeoJSON = e.target.toJSON();
          updateDistanceLabels(e.target, e.target.getId());
          setFieldSegments(prev => prev.map(seg =>
            seg.id === e.target.getId()
              ? { ...seg, geometry: editedGeoJSON, area: e.target.getArea() }
              : seg
          ));
        });
      });
    } else if (activeTool === 'delete') {
      map.getContainer().style.cursor = 'pointer';
      segmentLayer.getGeometries().forEach((geom: any) => {
        geom.on('click', handleDeleteClick);
      });
    }

    return () => {
      drawTool.disable();
      drawTool.setSymbol(defaultSymbol);
      drawTool.off('drawstart', handleMouseMove);
      map.off('mousemove', handleMouseMove);
      map.off('click', handleMapClick);
      
      const container = map.getContainer();
      if (container) {
        container.style.cursor = 'grab';
      }

      segmentLayer.getGeometries().forEach((geom: any) => {
        if (geom.isEditing()) geom.endEdit();
        geom.off('click', handleDeleteClick);
        geom.off('editend');
      });

      if (ghostMarkerRef.current) {
        ghostMarkerRef.current.remove();
        ghostMarkerRef.current = null;
      }

      clearCurrentShape();
    };
  }, [activeTool, fieldSegments, handleMouseMove, updateDistanceLabels]);

  const sidebarTabs = [
    { id: 'mechanical', label: 'Mechanical', icon: LayoutGrid },
    { id: 'keepouts', label: 'Keepouts', icon: Crosshair },
    { id: 'electrical', label: 'Electrical', icon: GitBranch },
    { id: 'advanced', label: 'Advanced', icon: PlusCircle },
  ];

  return (
    <div className="w-screen h-screen flex bg-gray-800">
      <div className="w-80 bg-white shadow-2xl flex flex-col z-20">
        {activeTool === 'draw' ? (
          <CreateFieldSegmentPanel onBack={() => setActiveTool('none')} onClear={clearCurrentShape} area={currentArea} />
        ) : (
          <>
            <div className="p-4 border-b">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold text-gray-800">{design.name}</h2>
                <button className="p-1 text-gray-500 hover:text-gray-800"><Settings className="w-5 h-5" /></button>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-1 text-green-600"><Check className="w-4 h-4" /><span>Saved</span></div>
                <div className="flex items-center space-x-2">
                  <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-4 h-4" /></button>
                  <button className="p-1 text-gray-500 hover:text-gray-800"><RotateCw className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
            <div className="p-4 border-b">
              <div className="grid grid-cols-2 gap-2">
                {sidebarTabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveSidebarTab(tab.id)} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${activeSidebarTab === tab.id ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100'}`}>
                    <tab.icon className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-grow p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800">Field Segments</h3>
                <button onClick={() => setActiveTool('draw')} className="bg-orange-500 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-orange-600 flex items-center space-x-1">
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </button>
              </div>
              <div className="border-t pt-4">
                {fieldSegments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">
                    <a href="#" onClick={(e) => { e.preventDefault(); setActiveTool('draw'); }} className="text-blue-600 hover:underline">Add a field segment</a> to get started
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldSegments.map((seg, index) => (
                      <div key={seg.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-md hover:bg-gray-100">
                        <span>Field Segment {index + 1}</span>
                        <button onClick={() => handleDeleteSegment(seg.id)} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-red-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t text-sm text-gray-600 font-medium">
              0 Modules, 0 p
            </div>
          </>
        )}
      </div>
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        <button onClick={onBack} className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-gray-800 font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-white flex items-center space-x-2 z-10">
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Project</span>
        </button>
      </div>
    </div>
  );
};

export default DesignEditor;