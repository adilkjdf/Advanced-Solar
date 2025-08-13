import React, { useState, useEffect } from 'react';
import { FieldSegment } from '../types/project';
import { formatArea } from '../utils/mapUtils';
import { ArrowLeft, Send, Trash2, AlignLeft, AlignCenter, AlignRight, AlignJustify, Wrench, Sun } from 'lucide-react';
import FormField from './FormField';
import SelectField from './SelectField';
import NumberInputWithUnit from './NumberInputWithUnit';

interface FieldSegmentPanelProps {
  segment: FieldSegment;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<FieldSegment>) => void;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
  moduleOptions?: Array<{ value: string; label: string }>;
}

const FieldSegmentPanel: React.FC<FieldSegmentPanelProps> = ({ segment, onBack, onDelete, onUpdate, isEditing, onStartEdit, onStopEdit, moduleOptions = [] }) => {
  const [formData, setFormData] = useState(segment);
  const [activeTab, setActiveTab] = useState<'mechanical' | 'shadow'>('mechanical');

  useEffect(() => {
    setFormData(segment);
  }, [segment]);

  const handleUpdate = (field: keyof FieldSegment, value: any) => {
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    onUpdate(segment.id, { [field]: value });
  };

  const alignmentOptions = [
    { value: 'left' as const, icon: AlignLeft },
    { value: 'center' as const, icon: AlignCenter },
    { value: 'right' as const, icon: AlignRight },
    { value: 'justify' as const, icon: AlignJustify },
  ];

  const renderMechanicalTab = () => (
    <>
      <div className="space-y-4">
        <FormField
          label="Description"
          id="description"
          value={formData.description}
          onChange={(val) => handleUpdate('description', val)}
        />

        <SelectField
          label="Module"
          id="module"
          value={formData.module || ''}
          onChange={(val) => handleUpdate('module', val)}
          options={moduleOptions}
          required
        />

        <SelectField
          label="Racking"
          id="racking"
          value={formData.racking}
          onChange={(val) => handleUpdate('racking', val as 'Fixed Tilt Racking' | 'Flush Mount')}
          options={[
            { value: 'Fixed Tilt Racking', label: 'Fixed Tilt Racking' },
            { value: 'Flush Mount', label: 'Flush Mount' },
          ]}
        />

        <NumberInputWithUnit label="Surface Height" value={formData.surfaceHeight} onChange={(val) => handleUpdate('surfaceHeight', val)} unit="ft" />
        <NumberInputWithUnit label="Racking Height" value={formData.rackingHeight} onChange={(val) => handleUpdate('rackingHeight', val)} unit="ft" />
        <NumberInputWithUnit label="Parapet Height" value={formData.parapetHeight || 0} onChange={(val) => handleUpdate('parapetHeight', val)} unit="ft" />
        <NumberInputWithUnit label="Module Azimuth" value={formData.moduleAzimuth} onChange={(val) => handleUpdate('moduleAzimuth', val)} unit="°" />
        <NumberInputWithUnit label="Module Tilt" value={formData.moduleTilt} onChange={(val) => handleUpdate('moduleTilt', val)} unit="°" />
        <button className="text-sm text-blue-600 hover:underline">+ Add Independent Tilt</button>
      </div>

      <div className="mt-6 pt-4 border-t">
        <h4 className="font-semibold text-gray-800 mb-3">Automatic Layout Rules</h4>
        
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-700">Frame Size</label>
          <div className="flex items-center space-x-2">
            <input type="number" value={formData.frameSizeUp} onChange={(e) => handleUpdate('frameSizeUp', parseInt(e.target.value))} className="w-12 p-1 border rounded-md text-sm text-center" />
            <span className="text-sm text-gray-600">up</span>
            <input type="number" value={formData.frameSizeWide} onChange={(e) => handleUpdate('frameSizeWide', parseInt(e.target.value))} className="w-12 p-1 border rounded-md text-sm text-center" />
            <span className="text-sm text-gray-600">wide</span>
          </div>
        </div>

        <SelectField
          label="Default Orientation"
          id="defaultOrientation"
          value={formData.defaultOrientation}
          onChange={(val) => handleUpdate('defaultOrientation', val as 'Landscape' | 'Portrait')}
          options={[
            { value: 'Landscape', label: 'Landscape (Horizontal)' },
            { value: 'Portrait', label: 'Portrait (Vertical)' },
          ]}
        />

        <NumberInputWithUnit label="Row Spacing" value={formData.rowSpacing} onChange={(val) => handleUpdate('rowSpacing', val)} unit="ft" />
        <NumberInputWithUnit label="Module Spacing" value={formData.moduleSpacing} onChange={(val) => handleUpdate('moduleSpacing', val)} unit="ft" step={0.001} />
        <NumberInputWithUnit label="Frame Spacing" value={formData.frameSpacing} onChange={(val) => handleUpdate('frameSpacing', val)} unit="ft" />
        <NumberInputWithUnit label="Setback" value={formData.setback} onChange={(val) => handleUpdate('setback', val)} unit="ft" />

        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700">Alignment</label>
          <div className="flex rounded-md border">
            {alignmentOptions.map((opt, index) => (
              <button
                key={opt.value}
                onClick={() => handleUpdate('alignment', opt.value)}
                className={`p-2 ${index > 0 ? 'border-l' : ''} ${formData.alignment === opt.value ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              >
                <opt.icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  const renderShadowTab = () => (
    <div className="p-3 border rounded-md bg-white">
      <h4 className="font-semibold text-gray-800 mb-3">Sun timing & shadows</h4>
      <div className="space-y-2">
        <NumberInputWithUnit label="Span / rise" value={formData.spanRise} onChange={(val) => handleUpdate('spanRise', val)} unit="" step={0.01} />
        <NumberInputWithUnit label="GCR" value={formData.gcr} onChange={(val) => handleUpdate('gcr', val)} unit="" step={0.01} />
        <div className="flex flex-col">
          <label className="text-sm text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={formData.analysisDate || new Date().toISOString().slice(0,10)}
            onChange={(e) => handleUpdate('analysisDate', e.target.value)}
            className="p-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Start Time</label>
            <input
              type="time"
              value={formData.startTime || '10:00'}
              onChange={(e) => handleUpdate('startTime', e.target.value)}
              className="p-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">End Time</label>
            <input
              type="time"
              value={formData.endTime || '16:00'}
              onChange={(e) => handleUpdate('endTime', e.target.value)}
              className="p-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full"
            />
          </div>
        </div>
        <div className="mt-3 p-2 text-xs text-gray-700 border rounded bg-gray-50">
          Row Spacing: {formData.rowSpacing} ft
          <br />
          Span / Rise: {formData.spanRise}
          <br />
          GCR: {formData.gcr}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 h-full flex flex-col bg-gray-50">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline flex items-center">
          <ArrowLeft className="w-4 h-4 mr-1" />
          back to list
        </button>
        <div className="flex items-center space-x-2">
          <button
            onClick={isEditing ? onStopEdit : onStartEdit}
            className={`p-2 rounded-md ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}
          >
            {isEditing ? 'Done Editing' : 'Edit Shape'}
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-md">
            <Send className="w-5 h-5" />
          </button>
          <button onClick={() => onDelete(segment.id)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-md">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <h3 className="font-bold text-lg text-gray-800">{segment.description}</h3>
      <p className="text-sm text-gray-600 mb-1">Modules: 0 (0.00 kW) <a href="#" className="text-blue-600 text-xs">(set max kWp)</a></p>
      <p className="text-sm text-gray-600 mb-4">Area: {formatArea(segment.area)}</p>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setActiveTab('mechanical')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium ${activeTab === 'mechanical' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Wrench className="w-4 h-4" />
          <span>Mechanical</span>
        </button>
        <button
          onClick={() => setActiveTab('shadow')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium ${activeTab === 'shadow' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Sun className="w-4 h-4" />
          <span>Shadow</span>
        </button>
      </div>

      <div className="flex-grow overflow-y-auto pr-2">
        {activeTab === 'mechanical' && renderMechanicalTab()}
        {activeTab === 'shadow' && renderShadowTab()}
      </div>
    </div>
  );
};

export default FieldSegmentPanel;