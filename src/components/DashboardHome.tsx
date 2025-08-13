import React from 'react';
import { Plus, FolderOpen, Trash2 } from 'lucide-react';
import { ProjectData } from '../types/project';

interface DashboardHomeProps {
  onCreateProject: () => void;
  projects: ProjectData[];
  onDeleteProject: (id: string) => void;
  onSelectProject: (project: ProjectData) => void;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({ onCreateProject, projects, onDeleteProject, onSelectProject }) => {
  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl p-8 text-white mb-8">
        <div className="max-w-4xl">
          <h1 className="text-3xl font-bold mb-2">Welcome to HelioScope</h1>
          <p className="text-orange-100 text-lg mb-6">
            Design and optimize solar projects with precision. Start by creating your first project.
          </p>
          <button
            onClick={onCreateProject}
            className="bg-white text-orange-600 px-6 py-3 rounded-lg font-semibold hover:bg-orange-50 
                       transition-colors flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Create New Project</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Projects</p>
              <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <FolderOpen className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        {/* Other stat cards can be updated later */}
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Recent Projects</h2>
        </div>
        <div className="p-6">
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
              <p className="text-gray-500 mb-6">Get started by creating your first solar project.</p>
              <button
                onClick={onCreateProject}
                className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 
                           transition-colors flex items-center space-x-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Create Project</span>
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {projects.slice(0, 5).map(project => (
                <li 
                  key={project.id} 
                  onClick={() => onSelectProject(project)}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-gray-800">{project.projectName}</p>
                      <p className="text-sm text-gray-500">{project.address}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <p className="text-sm text-gray-500">{new Date(project.created_at).toLocaleDateString()}</p>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }} 
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        aria-label="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;