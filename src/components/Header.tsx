import React from 'react';
import { Sun } from 'lucide-react';
import LibraryMenu from './LibraryMenu';

interface HeaderProps {
  onOpenLibrary?: (page: 'modules' | 'inverters') => void;
  onHome?: () => void;
  currentView?: 'dashboard' | 'project' | 'modules' | 'inverters';
}

const Header: React.FC<HeaderProps> = ({ onOpenLibrary, onHome, currentView }) => {
  return (
    <header className="bg-gray-800 text-white p-4 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-orange-500 rounded-lg">
            <Sun className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">HelioScope</h1>
            <p className="text-sm text-gray-300">Solar Project Designer</p>
          </div>
        </div>
        <nav className="hidden md:flex space-x-6 items-center">
          <button
            onClick={onHome}
            className={
              currentView === 'dashboard'
                ? 'px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors'
                : 'px-4 py-2 text-gray-300 hover:text-white transition-colors'
            }
            aria-current={currentView === 'dashboard' ? 'page' : undefined}
          >
            Home
          </button>
          <button className="px-4 py-2 text-gray-300 hover:text-white transition-colors">
            Projects
          </button>
          <LibraryMenu active={currentView === 'modules' || currentView === 'inverters'} onOpen={(p) => onOpenLibrary?.(p)} />
          <button className="px-4 py-2 text-gray-300 hover:text-white transition-colors">
            Help
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;