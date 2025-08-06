import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import DashboardHome from './components/DashboardHome';
import ProjectOnboarding from './components/ProjectOnboarding';
import ProjectPage from './components/ProjectPage';
import { ProjectData } from './types/project';
import { useAuth } from './contexts/AuthProvider';
import LoginPage from './pages/Login';
import { supabase } from './integrations/supabase/client';

function App() {
  const { session, loading } = useAuth();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'project'>('dashboard');

  useEffect(() => {
    if (session) {
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
    }
  }, [session]);

  const handleCreateProject = () => setIsOnboardingOpen(true);
  const handleCloseOnboarding = () => setIsOnboardingOpen(false);

  const handleSubmitProject = async (projectData: Partial<ProjectData>) => {
    if (!session) throw new Error("User not authenticated");

    const { data, error } = await supabase
      .from('projects')
      .insert({
        project_name: projectData.projectName,
        description: projectData.description,
        address: projectData.address,
        project_type: projectData.projectType,
        lat: projectData.coordinates?.lat,
        lng: projectData.coordinates?.lng,
        user_id: session.user.id,
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

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>
        {currentView === 'dashboard' ? (
          <DashboardHome onCreateProject={handleCreateProject} projects={projects} />
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