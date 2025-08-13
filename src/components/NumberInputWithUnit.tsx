import React from 'react';

interface NumberInputWithUnitProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
}

const NumberInputWithUnit: React.FC<NumberInputWithUnitProps> = ({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
}) => {
  return (
    <div className="flex items-center justify-between mb-2">
      <label className="text-sm text-gray-700">{label}</label>
      <div className="flex items-center">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-24 p-1 border rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <span className="ml-2 text-sm text-gray-600 w-6">{unit}</span>
      </div>
    </div>
  );
};

export default NumberInputWithUnit;