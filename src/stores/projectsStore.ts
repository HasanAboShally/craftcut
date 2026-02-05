/**
 * Projects Store
 * 
 * Manages project metadata and provides CRUD operations for projects.
 * Individual project data is stored separately using the design store.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  panelCount: number;
  thumbnail?: string; // Base64 image data
}

interface ProjectsState {
  projects: ProjectMeta[];
  
  // Actions
  createProject: (name?: string) => string;
  updateProject: (id: string, updates: Partial<Omit<ProjectMeta, "id" | "createdAt">>) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => ProjectMeta | undefined;
  duplicateProject: (id: string) => string;
}

// Generate unique ID
function generateId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Generate default project name
function generateProjectName(existingProjects: ProjectMeta[]): string {
  const baseNames = existingProjects
    .map((p) => p.name)
    .filter((name) => name.startsWith("Untitled Project"));
  
  if (baseNames.length === 0) {
    return "Untitled Project";
  }
  
  // Find the highest number
  let maxNum = 0;
  for (const name of baseNames) {
    const match = name.match(/Untitled Project(?: (\d+))?$/);
    if (match) {
      const num = match[1] ? parseInt(match[1]) : 1;
      maxNum = Math.max(maxNum, num);
    }
  }
  
  return `Untitled Project ${maxNum + 1}`;
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],

      createProject: (name?: string) => {
        const id = generateId();
        const projectName = name || generateProjectName(get().projects);
        const now = Date.now();
        
        const newProject: ProjectMeta = {
          id,
          name: projectName,
          createdAt: now,
          updatedAt: now,
          panelCount: 0,
        };
        
        set((state) => ({
          projects: [newProject, ...state.projects],
        }));
        
        return id;
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: Date.now() }
              : p
          ),
        }));
      },

      deleteProject: (id) => {
        // Also delete the project data from localStorage
        try {
          localStorage.removeItem(`craftcut_project_${id}`);
        } catch {
          console.warn("Could not remove project data from storage");
        }
        
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        }));
      },

      getProject: (id) => {
        return get().projects.find((p) => p.id === id);
      },

      duplicateProject: (id) => {
        const original = get().getProject(id);
        if (!original) {
          throw new Error("Project not found");
        }
        
        const newId = generateId();
        const now = Date.now();
        
        // Copy project data
        try {
          const originalData = localStorage.getItem(`craftcut_project_${id}`);
          if (originalData) {
            localStorage.setItem(`craftcut_project_${newId}`, originalData);
          }
        } catch {
          console.warn("Could not copy project data");
        }
        
        const duplicatedProject: ProjectMeta = {
          id: newId,
          name: `${original.name} (Copy)`,
          createdAt: now,
          updatedAt: now,
          panelCount: original.panelCount,
        };
        
        set((state) => ({
          projects: [duplicatedProject, ...state.projects],
        }));
        
        return newId;
      },
    }),
    {
      name: "craftcut_projects",
      version: 1,
    }
  )
);
