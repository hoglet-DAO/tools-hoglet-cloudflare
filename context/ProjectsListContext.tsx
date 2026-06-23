// d:\SupraSpike\src\app\context\ProjectsListContext.tsx
"use client";

import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';

interface ProjectsListContextType {
  refreshTrigger: number;
  refreshProjects: () => void;
}

const ProjectsListContext = createContext<ProjectsListContextType | undefined>(undefined);

export const ProjectListProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshProjects = useCallback(() => {
    console.log("Forzando actualización de la lista de Projects...");
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <ProjectsListContext.Provider value={{ refreshTrigger, refreshProjects }}>
      {children}
    </ProjectsListContext.Provider>
  );
};

export const useProjectList = (): ProjectsListContextType => {
  const context = useContext(ProjectsListContext);
  if (context === undefined) {
    throw new Error('useProjectList must be used within a ProjectListProvider');
  }
  return context;
};
