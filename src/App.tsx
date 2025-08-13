import { useState, useEffect } from 'react';
import Header from './components/Header';
import ModulesPage from './components/ModulesPage';
import InvertersPage from './components/InvertersPage';
import DashboardHome from './components/DashboardHome';
import ProjectOnboarding from './components/ProjectOnboarding';
import ProjectPage from './components/ProjectPage';
import { ProjectData } from './types/project';
import { supabase } from './integrations/supabase/client';

function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'project' | 'modules' | 'inverters'>('dashboard');

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
      } else if (data) {
        const formattedData = data.map(p => ({
          ...p,
          projectName: p.project_name,
          coordinates: (p.lat && p.lng) ? { lat: p.lat, lng: p.lng } : undefined,
        })) as ProjectData[];
        setProjects(formattedData);
      }
    };
    fetchProjects();
  }, []);

  const handleCreateProject = () => setIsOnboardingOpen(true);
  const handleCloseOnboarding = () => setIsOnboardingOpen(false);

  const handleSubmitProject = async (projectData: Partial<ProjectData>) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        project_name: projectData.projectName,
        description: projectData.description,
        address: projectData.address,
        project_type: projectData.projectType,
        lat: projectData.coordinates?.lat,
        lng: projectData.coordinates?.lng,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      throw error;
    }
    
    const newProject = {
      ...data,
      projectName: data.project_name,
      coordinates: (data.lat && data.lng) ? { lat: data.lat, lng: data.lng } : undefined,
    } as ProjectData;

    setProjects(prev => [newProject, ...prev]);
    setCurrentProject(newProject);
    setCurrentView('project');
    setIsOnboardingOpen(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
    } else {
      setProjects(prev => prev.filter(p => p.id !== projectId));
    }
  };

  const handleSelectProject = (project: ProjectData) => {
    setCurrentProject(project);
    setCurrentView('project');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        onOpenLibrary={(p) => setCurrentView(p)}
        onHome={() => setCurrentView('dashboard')}
        currentView={currentView}
      />
      <main>
        {currentView === 'dashboard' ? (
          <DashboardHome 
            onCreateProject={handleCreateProject} 
            projects={projects}
            onDeleteProject={handleDeleteProject}
            onSelectProject={handleSelectProject}
          />
        ) : currentView === 'project' ? (
          currentProject ? (
          <ProjectPage project={currentProject} onBack={handleBackToDashboard} />
          ) : null
        ) : currentView === 'modules' ? (
          <ModulesPage />
        ) : currentView === 'inverters' ? (
          <InvertersPage />
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