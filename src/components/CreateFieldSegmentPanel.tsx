import React from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';

interface CreateFieldSegmentPanelProps {
  onBack: () => void;
  onClear: () => void;
  area: string;
}

const CreateFieldSegmentPanel: React.FC<CreateFieldSegmentPanelProps> = ({ onBack, onClear, area }) => {
  return (
    <div className="p-4 h-full flex flex-col">
      <h3 className="font-bold text-gray-800 mb-2">Create New Field Segment</h3>
      <p className="text-sm text-gray-600 mb-4">
        Click on the map to create a field segment. A field segment is a valid area to place modules.
      </p>
      <div className="flex space-x-2 mb-4">
        <button onClick={onBack} className="flex-1 px-3 py-2 bg-gray-200 text-gray-800 rounded-md text-sm font-semibold hover:bg-gray-300 flex items-center justify-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button onClick={onClear} className="flex-1 px-3 py-2 bg-gray-200 text-gray-800 rounded-md text-sm font-semibold hover:bg-gray-300 flex items-center justify-center space-x-2">
          <Trash2 className="w-4 h-4" />
          <span>Clear Shape</span>
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4">Press <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">escape</kbd> to clear the current shape.</p>
      
      <div className="space-y-2 text-sm">
        <div><span className="font-semibold text-gray-700">Area:</span> {area}</div>
        <div><span className="font-semibold text-gray-700">Modules:</span> 0</div>
        <div><span className="font-semibold text-gray-700">Nameplate:</span> 0</div>
      </div>

      <div className="mt-auto bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs p-3 rounded-lg">
        <span className="font-bold">Tip:</span> While drawing a field segment, hold down the <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-md">shift</kbd> key to have new lines automatically snap to angles.
      </div>
    </div>
  );
};

export default CreateFieldSegmentPanel;