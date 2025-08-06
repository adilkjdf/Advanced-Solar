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
  const drawingIdRef = useRef<string | null>(null);
  const mouseDistanceLabelRef = useRef<maptalks.Label | null>(null);

  const defaultSymbol = {
    lineColor: '#f97316',
    lineWidth: 3,
    polygonFill: '#f97316',
    polygonOpacity: 0.3,
  };
  const closingSymbol = { ...defaultSymbol, lineColor: '#22c55e' };

  const updateDistanceLabels = useCallback((geometry: maptalks.Polygon, segmentId: string) => {
    if (!geometry || !labelLayerRef.current) return;
    
    const oldLabels = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === segmentId);
    if (oldLabels.length) {
      labelLayerRef.current.removeGeometry(oldLabels);
    }
  
    const coords = geometry.getCoordinates()[0];
    if (coords.length < 2) return;
    for (let i = 0; i < coords.length - 1; i++) {
      const line = new maptalks.LineString([coords[i], coords[i + 1]]);
      const label = new maptalks.Label(formatDistance(line.getLength()), line.getCenter(), {
        'textPlacement' : 'line',
        'textDy': -15,
        'boxStyle' : { 'padding' : [6, 4], 'symbol' : { 'markerType' : 'square', 'markerFill' : 'rgba(0, 0, 0, 0.8)', 'markerLineWidth' : 0 }},
        'textSymbol': { 'textFill' : '#ffffff', 'textSize' : 12 }
      });
      label.setProperties({ isDistanceLabel: true, segmentId: segmentId });
      labelLayerRef.current.addGeometry(label);
    }
  }, []);

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
              symbol: { 'markerType': 'ellipse', 'markerFill': '#22c55e', 'markerWidth': 10, 'markerHeight': 10, 'markerLineWidth': 0 }
            }).addTo(labelLayerRef.current!);
          } else {
            ghostMarkerRef.current.setCoordinates(coord);
          }
        return;
    };

    const coords = currentGeom.getCoordinates()[0];
    let isSnapped = false;

    if (coords.length > 2) {
      const firstVertex = coords[0];
      const distance = mapInstanceRef.current.distanceTo(coord, firstVertex);
      const snapThreshold = mapInstanceRef.current.getResolution() * 15;

      if (distance < snapThreshold) {
        coord = firstVertex;
        isSnapped = true;
        currentGeom.setSymbol(closingSymbol);
      } else {
        currentGeom.setSymbol(defaultSymbol);
      }
    }

    ghostMarkerRef.current?.setCoordinates(coord);

    // Update mouse distance label
    if (coords.length > 0) {
      const lastVertex = coords[coords.length - 1];
      const distance = mapInstanceRef.current.distanceTo(lastVertex, coord);
      
      if (mouseDistanceLabelRef.current) {
        mouseDistanceLabelRef.current.setContent(formatDistance(distance));
        mouseDistanceLabelRef.current.setCoordinates(coord);
      } else {
        mouseDistanceLabelRef.current = new maptalks.Label(formatDistance(distance), coord, {
          'textPlacement': 'point',
          'textDx': 15,
          'textDy': -15,
          'boxStyle': {
            'padding': [6, 8],
            'symbol': {
              'markerType': 'square',
              'markerFill': 'rgba(0, 0, 0, 0.8)',
              'markerLineWidth': 0
            }
          },
          'textSymbol': {
            'textFill': '#ffffff',
            'textSize': 14,
            'textHaloFill': '#000000',
            'textHaloRadius': 1
          }
        }).addTo(labelLayerRef.current!);
      }
    }

    if (coords.length > 0) {
      const lastVertex = coords[coords.length - 1];
      if (tempLineRef.current) tempLineRef.current.remove();
      if (tempLabelRef.current) tempLabelRef.current.remove();

      tempLineRef.current = new maptalks.LineString([lastVertex, coord], {
        symbol: isSnapped ? closingSymbol : defaultSymbol
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

  const setupDrawingListeners = useCallback(() => {
    const drawTool = drawToolRef.current;
    if (!drawTool) return;
    drawTool.off();
    drawTool.on('drawstart', (e: any) => {
      drawingIdRef.current = maptalks.Util.UID();
      ghostMarkerRef.current?.remove();
      const startMarker = new maptalks.Marker(e.coordinate, {
        interactive: true,
        symbol: {
          markerFile: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>'),
          markerWidth: 20, markerHeight: 20,
        }
      });
      startMarker.setProperties({ isStartMarker: true });
      startMarker.on('mousedown', (evt) => {
        const currentGeom = drawToolRef.current?.getCurrentGeometry();
        if (currentGeom && currentGeom.getCoordinates()[0].length > 2) {
          evt.domEvent.stopPropagation();
          drawToolRef.current!.endDraw();
        }
      });
      labelLayerRef.current?.addGeometry(startMarker);
    });
    drawTool.on('drawvertex', (e: any) => {
      if (e.geometry && drawingIdRef.current) {
        if (tempLineRef.current) tempLineRef.current.remove();
        if (tempLabelRef.current) tempLabelRef.current.remove();
        setCurrentArea(formatArea(e.geometry.getArea()));
        updateDistanceLabels(e.geometry, drawingIdRef.current);

        const vertexMarker = new maptalks.Marker(e.coordinate, {
          symbol: { 'markerType': 'ellipse', 'markerFill': '#ffffff', 'markerWidth': 8, 'markerHeight': 8, 'markerLineWidth': 2, 'markerLineColor': '#f97316' }
        }).setProperties({ isVertex: true });
        labelLayerRef.current?.addGeometry(vertexMarker);
      }
    });
    drawTool.on('drawend', (e: any) => {
      if (!e.geometry) return;
      
      const newSegmentId = maptalks.Util.UID();
      const newSegment: FieldSegment = {
        id: newSegmentId,
        geometry: e.geometry.toJSON(),
        area: e.geometry.getArea(),
      };
      
      if (drawingIdRef.current && labelLayerRef.current) {
        const tempLabels = labelLayerRef.current.getGeometries().filter(g => g.getProperties()?.segmentId === drawingIdRef.current);
        labelLayerRef.current.removeGeometry(tempLabels);
      }
      
      updateDistanceLabels(e.geometry, newSegmentId);

      const polygon = maptalks.Geometry.fromJSON(newSegment.geometry).setSymbol(defaultSymbol).setId(newSegment.id);
      segmentLayerRef.current?.addGeometry(polygon);
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
    drawToolRef.current?.clear();
    if (labelLayerRef.current) {
        const geomsToRemove = labelLayerRef.current.getGeometries().filter(g => {
            const props = g.getProperties();
            return !props.isDistanceLabel;
        });
        labelLayerRef.current.removeGeometry(geomsToRemove);
    }
    setCurrentArea('0.0 ft²');
    setupDrawingListeners();
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

    if (activeTool === 'draw') {
      map.getContainer().style.cursor = 'crosshair';
      map.on('mousemove', handleMouseMove);
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
      map.off('mousemove', handleMouseMove);
      
      const container = map.getContainer();
      if (container) {
        container.style.cursor = 'grab';
      }

      segmentLayer.getGeometries().forEach((geom: any) => {
        if (geom.isEditing()) geom.endEdit();
        geom.off('click', handleDeleteClick);
        geom.off('editend');
      });

      if (ghostMarkerRef.current) ghostMarkerRef.current.remove();
      if (tempLineRef.current) tempLineRef.current.remove();
      if (tempLabelRef.current) tempLabelRef.current.remove();
      if (mouseDistanceLabelRef.current) mouseDistanceLabelRef.current.remove();
      ghostMarkerRef.current = tempLineRef.current = tempLabelRef.current = mouseDistanceLabelRef.current = null;
      
      if (labelLayerRef.current) {
        const geomsToRemove = labelLayerRef.current.getGeometries().filter(g => {
            const props = g.getProperties();
            return !props.isDistanceLabel;
        });
        labelLayerRef.current.removeGeometry(geomsToRemove);
      }
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