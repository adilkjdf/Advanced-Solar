import React from 'react';
import { Spline, Pencil, Trash2, Ban } from 'lucide-react';

export type EditorTool = 'none' | 'draw' | 'edit' | 'delete';

interface DrawingToolbarProps {
  activeTool: EditorTool;
  onToolSelect: (tool: EditorTool) => void;
}

const tools = [
  { id: 'draw' as EditorTool, label: 'Draw Field Segment', icon: Spline },
  { id: 'edit' as EditorTool, label: 'Edit Segments', icon: Pencil },
  { id: 'delete' as EditorTool, label: 'Delete Segments', icon: Trash2 },
];

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ activeTool, onToolSelect }) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg flex items-center space-x-1 p-1 z-10">
      {tools.map(tool => (
        <button
          key={tool.id}
          title={tool.label}
          onClick={() => onToolSelect(tool.id)}
          className={`p-2 rounded-md transition-colors ${
            activeTool === tool.id
              ? 'bg-orange-500 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          <tool.icon className="w-5 h-5" />
        </button>
      ))}
      {activeTool !== 'none' && (
        <>
          <div className="w-px h-6 bg-gray-300 mx-1"></div>
          <button
            title="Cancel"
            onClick={() => onToolSelect('none')}
            className="p-2 rounded-md transition-colors text-gray-700 hover:bg-gray-200"
          >
            <Ban className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
};

export default DrawingToolbar;