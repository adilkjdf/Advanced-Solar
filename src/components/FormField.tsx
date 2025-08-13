import React from 'react';

interface FormFieldProps {
  label: string;
  id: string;
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
  rows?: number;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  id,
  type = 'text',
  value,
  onChange,
  error,
  required = false,
  placeholder,
  maxLength,
  min,
  max,
  step,
  multiline = false,
  rows
}) => {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows || 3}
          className={`w-full p-3 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${
            error 
              ? 'border-red-500 bg-red-50' 
              : 'border-gray-300 focus:border-orange-500'
          }`}
        />
      ) : (
        <input
          type={type}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          min={min}
          max={max}
          step={step}
          className={`w-full p-3 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${
            error 
              ? 'border-red-500 bg-red-50' 
              : 'border-gray-300 focus:border-orange-500'
          }`}
        />
      )}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      {maxLength && (
        <p className="mt-1 text-xs text-gray-500">
          {String(value).length}/{maxLength} characters
        </p>
      )}
    </div>
  );
};

export default FormField;