import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MapPin, Settings, Eye, Share2, FileText, Plus, Trash2, Edit } from 'lucide-react';
import { ProjectData, Design } from '../types/project';
import * as maptalks from 'maptalks';
import NewDesignModal from './NewDesignModal';
import DesignEditor from './DesignEditor';
import { supabase } from '../integrations/supabase/client';

interface ProjectPageProps {
  project: ProjectData;
  onBack: () => void;
}

type TabType = 'designs' | 'conditions' | 'shading' | 'sharing' | 'reports';

const ProjectPage: React.FC<ProjectPageProps> = ({ project, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('designs');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maptalks.Map | null>(null);

  const [designs, setDesigns] = useState<Design[]>([]);
  const [isNewDesignModalOpen, setIsNewDesignModalOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<Design | null>(null);

  useEffect(() => {
    const fetchDesigns = async () => {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });
      
      if (error) console.error("Error fetching designs", error);
      else setDesigns(data as Design[]);
    };
    fetchDesigns();
  }, [project.id]);

  const tabs = [
    { id: 'designs' as TabType, label: 'Designs', icon: Settings },
    { id: 'conditions' as TabType, label: 'Conditions', icon: Eye },
    { id: 'shading' as TabType, label: 'Shading', icon: MapPin },
    { id: 'sharing' as TabType, label: 'Sharing', icon: Share2 },
    { id: 'reports' as TabType, label: 'Reports', icon: FileText },
  ];

  const handleCreateDesign = async (data: { name: string; cloneFrom?: string }) => {
    const { data: newDesign, error } = await supabase
      .from('designs')
      .insert({
        name: data.name,
        project_id: project.id,
        cloned_from: data.cloneFrom || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating design", error);
    } else if (newDesign) {
      setDesigns(prev => [newDesign as Design, ...prev]);
      setIsNewDesignModalOpen(false);
    }
  };

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && project.coordinates) {
      const map = new maptalks.Map(mapContainerRef.current, {
        center: [project.coordinates.lng, project.coordinates.lat],
        zoom: 18,
        baseLayer: new maptalks.TileLayer('base', {
          urlTemplate: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        }),
        draggable: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      });

      const layer = new maptalks.VectorLayer('markerLayer').addTo(map);
      const marker = new maptalks.Marker([project.coordinates.lng, project.coordinates.lat]);
      layer.addGeometry(marker);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [project.coordinates]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'designs':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Designs</h3>
                <p className="text-sm text-gray-600">Each Design encompasses all the components of a solar array.</p>
              </div>
              <button 
                onClick={() => setIsNewDesignModalOpen(true)}
                className="bg-cyan-500 text-white px-4 py-2 rounded-lg hover:bg-cyan-600 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
              </button>
            </div>

            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b">
                <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-700">
                  <div>Name</div>
                  <div>Last Modified</div>
                  <div>Nameplate</div>
                  <div className="text-right">Actions</div>
                </div>
              </div>
              {designs.length === 0 ? (
                <div className="text-center p-12 text-gray-500">
                  No designs created yet. Click 'New' to get started.
                </div>
              ) : (
                designs.map(design => (
                  <div key={design.id} className="px-6 py-4 border-b last:border-b-0">
                    <div className="grid grid-cols-4 gap-4 items-center">
                      <a 
                        href="#" 
                        onClick={(e) => { e.preventDefault(); setEditingDesign(design); }}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {design.name}
                      </a>
                      <div className="text-sm text-gray-600">{new Date(design.created_at).toLocaleDateString()}</div>
                      <div className="text-sm text-gray-600">-</div>
                      <div className="flex space-x-2 justify-end">
                        <button onClick={() => setEditingDesign(design)} className="p-2 text-gray-500 hover:text-blue-600 rounded-md hover:bg-gray-100">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (editingDesign) {
    return <DesignEditor project={project} design={editingDesign} onBack={() => setEditingDesign(null)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.projectName}</h1>
                <p className="text-sm text-gray-600">{project.address}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border">
              <div ref={mapContainerRef} className="h-64 w-full rounded-t-lg" />
              <div className="p-4">
                <h3 className="font-semibold text-gray-800">{project.address}</h3>
                <p className="text-sm text-gray-600">{project.coordinates?.lat.toFixed(4)}, {project.coordinates?.lng.toFixed(4)}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-orange-500" />
                Project Overview
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Project</label>
                  <p className="text-sm text-gray-900">{project.projectName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Address</label>
                  <p className="text-sm text-gray-900">{project.address}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Last Modified</label>
                  <p className="text-sm text-gray-900">{new Date(project.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm border mb-6">
              <div className="border-b">
                <nav className="flex space-x-8 px-6">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === tab.id
                            ? 'border-orange-500 text-orange-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Icon className="w-4 h-4" />
                          <span>{tab.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>
              <div className="p-6">
                {renderTabContent()}
              </div>
            </div>
          </div>
        </div>
      </div>
      <NewDesignModal 
        isOpen={isNewDesignModalOpen}
        onClose={() => setIsNewDesignModalOpen(false)}
        onSubmit={handleCreateDesign}
        existingDesigns={designs}
      />
    </div>
  );
};

export default ProjectPage;