import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Task {
  id: number;
  proyectoID: string;
  tareaID: string;
  empleado: string;
  horas: string;
  descripcion?: string;
  finalizado?: string;
  duracion?: string;
}

export interface CompletedTask {
  id: number;
  name: string;
  project_id: [number, string];
  date: string;
  unit_amount: number;
  // Anadir mas campos segun responda el backend de Odoo
}

interface TaskState {
  activeTasks: Task[];
  completedTasks: CompletedTask[];
  setActiveTasks: (tasks: Task[]) => void;
  setCompletedTasks: (tasks: CompletedTask[]) => void;
  addTask: (task: Task) => void;
  removeTask: (taskId: number) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      activeTasks: [],
      completedTasks: [],
      setActiveTasks: (tasks) => set({ activeTasks: tasks }),
      setCompletedTasks: (tasks) => set({ completedTasks: tasks }),
      addTask: (task) => set((state) => ({ activeTasks: [...state.activeTasks, task] })),
      removeTask: (taskId) => set((state) => ({
        activeTasks: state.activeTasks.filter((t) => t.id !== taskId)
      })),
    }),
    {
      name: 'terra-field-task-storage',
      // Solo persistimos las tareas activas en localStorage para sincronizacion,
      // completedTasks tipicamente se hace fetch del servidor
      partialize: (state) => ({ activeTasks: state.activeTasks }),
    }
  )
);
