import { ProjectData, ValidationErrors } from '../types/project';

export const validateProjectForm = (data: Partial<ProjectData>): ValidationErrors => {
  const errors: ValidationErrors = {};

  // Project name validation
  if (!data.projectName || !data.projectName.trim()) {
    errors.projectName = 'Project name is required';
  } else if (data.projectName.length > 50) {
    errors.projectName = 'Project name must be 50 characters or less';
  }

  // Address validation
  if (!data.address || !data.address.trim()) {
    errors.address = 'Project address is required';
  }

  // Project type validation
  if (!data.projectType) {
    errors.projectType = 'Project type is required';
  }

  // Description validation (optional but limited)
  if (data.description && data.description.length > 200) {
    errors.description = 'Description must be 200 characters or less';
  }

  return errors;
};

export const hasValidationErrors = (errors: ValidationErrors): boolean => {
  return Object.keys(errors).length > 0;
};