import React, { useRef, useState } from 'react';

interface LibraryMenuProps {
  onOpen: (page: 'modules' | 'inverters') => void;
  active?: boolean;
}

const LibraryMenu: React.FC<LibraryMenuProps> = ({ onOpen, active }) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const openMenu = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const closeMenuSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  };
  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={closeMenuSoon}>
      <button
        className={(active ? 'bg-orange-500 text-white ' : 'text-gray-300 hover:text-white ') + 'px-4 py-2 transition-colors rounded-lg'}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Library menu"
      >
        Library
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white text-gray-800 rounded-md shadow-xl z-50" onMouseEnter={openMenu} onMouseLeave={closeMenuSoon}>
          <button onClick={() => onOpen('modules')} className="w-full text-left px-4 py-2 hover:bg-gray-100">Modules</button>
          <button onClick={() => onOpen('inverters')} className="w-full text-left px-4 py-2 hover:bg-gray-100">Inverters</button>
        </div>
      )}
    </div>
  );
};

export default LibraryMenu;
