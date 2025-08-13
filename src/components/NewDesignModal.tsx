import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Design } from '../types/project';
import FormField from './FormField';
import SelectField from './SelectField';

interface NewDesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; cloneFrom?: string }) => void;
  existingDesigns: Design[];
}

const NewDesignModal: React.FC<NewDesignModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  existingDesigns,
}) => {
  const [name, setName] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Design name is required.');
      return;
    }
    onSubmit({ name, cloneFrom });
    setName('');
    setCloneFrom('');
    setError('');
  };

  const handleClose = () => {
    setName('');
    setCloneFrom('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  const designOptions = existingDesigns.map(d => ({ value: d.id, label: d.name }));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />
        
        <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full">
          <div className="flex items-center justify-between p-6 border-b bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900">Create New Design</h2>
            <button onClick={handleClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-6">
              <FormField
                label="Name of the design"
                id="designName"
                value={name}
                onChange={setName}
                error={error}
                required
                placeholder="e.g., Rooftop Array"
              />
              <SelectField
                label="Clone existing Design (optional)"
                id="cloneFrom"
                value={cloneFrom}
                onChange={setCloneFrom}
                options={designOptions}
              />
            </div>

            <div className="flex items-center justify-end p-6 border-t bg-gray-50 space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Design</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewDesignModal;