import React, { useState } from 'react';
import Header from './components/Header';
import DashboardHome from './components/DashboardHome';
import ProjectOnboarding from './components/ProjectOnboarding';
import ProjectPage from './components/ProjectPage';
import { ProjectData } from './types/project';

function App() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'project'>('dashboard');

  const handleCreateProject = () => {
    setIsOnboardingOpen(true);
  };

  const handleCloseOnboarding = () => {
    setIsOnboardingOpen(false);
  };

  const handleSubmitProject = async (projectData: ProjectData) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In a real application, this would save to a database
    console.log('Creating project:', projectData);
    
    // For demo purposes, we'll just log the project data
    // Set the current project and navigate to project page
    setCurrentProject(projectData);
    setCurrentView('project');
    setIsOnboardingOpen(false);
    
    return Promise.resolve();
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  const renderCurrentView = () => {
    if (currentView === 'project' && currentProject) {
      return <ProjectPage project={currentProject} onBack={handleBackToDashboard} />;
    }
    
    return Promise.resolve();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        {currentView === 'dashboard' ? (
          <DashboardHome onCreateProject={handleCreateProject} />
        ) : currentProject ? (
          <ProjectPage project={currentProject} onBack={handleBackToDashboard} />
        ) : null}
        <ProjectOnboarding
          isOpen={isOnboardingOpen}
          onClose={handleCloseOnboarding}
          onSubmit={handleSubmitProject}
        />
      </main>
    </div>
  );
}

export default App;