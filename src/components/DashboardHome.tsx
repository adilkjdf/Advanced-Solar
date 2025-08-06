import React from 'react';
import { Plus, FolderOpen, Users, Zap, TrendingUp } from 'lucide-react';

interface DashboardHomeProps {
  onCreateProject: () => void;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({ onCreateProject }) => {
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
              <p className="text-2xl font-bold text-gray-900">0</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <FolderOpen className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Capacity</p>
              <p className="text-2xl font-bold text-gray-900">0 kW</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Zap className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Customers</p>
              <p className="text-2xl font-bold text-gray-900">0</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Growth</p>
              <p className="text-2xl font-bold text-gray-900">+0%</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Recent Projects</h2>
        </div>
        <div className="p-6">
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
        </div>
      </div>

      {/* Features Overview */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Solar Design</h3>
          <p className="text-gray-600 text-sm">
            Create precise solar array layouts with advanced shading analysis and performance optimization.
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Financial Analysis</h3>
          <p className="text-gray-600 text-sm">
            Generate detailed financial models with ROI calculations, payback periods, and cash flow analysis.
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Project Management</h3>
          <p className="text-gray-600 text-sm">
            Track project progress, manage customer communications, and organize project documentation.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;