import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { ProjectData, ValidationErrors } from '../types/project';
import { validateProjectForm, hasValidationErrors } from '../utils/validation';
import { geocodeAddress } from '../utils/geocoding';
import FormField from './FormField';
import SelectField from './SelectField';
import MapSection from './MapSection';

interface ProjectOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (projectData: Partial<ProjectData>) => Promise<void>;
}

const ProjectOnboarding: React.FC<ProjectOnboardingProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState<Partial<ProjectData>>({
    projectName: '',
    description: '',
    address: '',
    projectType: 'Residential',
    coordinates: undefined
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const projectTypeOptions = [
    { value: 'Residential', label: 'Residential' },
    { value: 'Commercial', label: 'Commercial' },
    { value: 'Industrial', label: 'Industrial' }
  ];

  const updateFormData = (field: keyof ProjectData, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleLocationSelect = (lat: number, lng: number) => {
    setFormData(prev => ({
      ...prev,
      coordinates: { lat, lng }
    }));
  };

  const handleAddressGeocode = async (address: string) => {
    return await geocodeAddress(address);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
  const validationErrors = validateProjectForm(formData);
    setErrors(validationErrors);
    
    if (hasValidationErrors(validationErrors)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      await onSubmit(formData);
      setSubmitStatus('success');
      // Reset form after successful submission
      setTimeout(() => {
        onClose();
        setFormData({
          projectName: '',
          description: '',
          address: '',
          projectType: 'Residential',
          coordinates: undefined
        });
        setSubmitStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Project creation failed:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleClose} />
        
        <div className="relative bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b bg-gray-50">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Create New Solar Project</h2>
              <p className="text-sm text-gray-600 mt-1">Enter project details and select location</p>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-col lg:flex-row max-h-[calc(90vh-140px)]">
            {/* Form Section */}
            <div className="lg:w-1/2 p-6 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Project Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Project Information</h3>
                  
                  <FormField
                    label="Project Name"
                    id="projectName"
                    value={formData.projectName || ''}
                    onChange={(value) => updateFormData('projectName', value)}
                    error={errors.projectName}
                    required
                    placeholder="Enter project name"
                    maxLength={50}
                  />

                  <FormField
                    label="Project Address"
                    id="address"
                    value={formData.address || ''}
                    onChange={(value) => updateFormData('address', value)}
                    error={errors.address}
                    required
                    placeholder="Enter project address"
                  />

                  <SelectField
                    label="Project Type"
                    id="projectType"
                    value={formData.projectType || ''}
                    onChange={(value) => updateFormData('projectType', value)}
                    options={projectTypeOptions}
                    error={errors.projectType}
                    required
                  />

                  <FormField
                    label="Project Description"
                    id="description"
                    value={formData.description || ''}
                    onChange={(value) => updateFormData('description', value)}
                    error={errors.description}
                    placeholder="Optional project description"
                    maxLength={200}
                    multiline
                    rows={3}
                  />
                </div>

              </form>
            </div>

            {/* Map Section */}
            <div className="lg:w-1/2 p-6 border-l border-gray-200">
              <MapSection
                address={formData.address || ''}
                coordinates={formData.coordinates}
                onLocationSelect={handleLocationSelect}
                onAddressGeocode={handleAddressGeocode}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t bg-gray-50">
            <div className="flex items-center space-x-2">
              {submitStatus === 'success' && (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">Project created successfully!</span>
                </>
              )}
              {submitStatus === 'error' && (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-red-600 font-medium">Failed to create project. Please try again.</span>
                </>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed 
                           flex items-center space-x-2"
              >
                {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
                <span>{isSubmitting ? 'Creating...' : 'Create Project'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectOnboarding;