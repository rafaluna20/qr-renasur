"use client";

import { useGeolocation } from '@/hooks';

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import QRScannerModal from "@/components/QRScannerModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import UserDashboard from "@/components/UserDashboard";
import AdminPanel from "@/components/AdminPanel";
import { Field } from "@/components/ui/Field";
import Link from "next/link";
import { toast } from "sonner";

const adminSchema = z.object({
  proyecto: z.string().min(1, "El ID del proyecto es requerido"),
  tarea: z.string().min(1, "El ID de la tarea es requerido"),
});

const userSchema = z.object({
  empleado: z.string().min(1, "El ID del empleado es requerido"),
  horas: z.string().min(1, "La hora de finalizaciÃ³n es requerida"),
});

type AdminFormData = z.infer<typeof adminSchema>;
type UserFormData = z.infer<typeof userSchema>;

function formatHoursMinutes(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}h: ${String(minutes).padStart(2, '0')}m`;
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "resident" | "supervisor" | "employee" | "user" | null>(null);
  const [adminMode, setAdminMode] = useState<"proyecto" | "asistencia">("proyecto");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [userView, setUserView] = useState<"dashboard" | "tasks">("dashboard");
  const [historyView, setHistoryView] = useState<"list" | "weekly">("list");
  const [userName, setUserName] = useState<string>("");
  const [userImage, setUserImage] = useState<string>("");

  const groupedTasks = useMemo(() => {
    const groups: Record<string, { totalHours: number, tasks: any[] }> = {};

    // Sort tasks by date desc first
    const sortedTasks = [...completedTasks].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedTasks.forEach(task => {
      const date = new Date(task.date);
      // Get start of week (Sunday)
      const day = date.getDay();
      const diff = date.getDate() - day; // adjust when day is sunday
      const weekStart = new Date(date);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);

      const key = weekStart.toISOString();

      if (!groups[key]) {
        groups[key] = { totalHours: 0, tasks: [] };
      }

      groups[key].tasks.push(task);
      groups[key].totalHours += (task.unit_amount || 0);
    });

    return groups;
  }, [completedTasks]);
  const URL_PUBLIC = process.env.NEXT_PUBLIC_URL;
  const [formData, setFormData] = useState({
    proyecto: "",
    tarea: "",
    empleado: "5",
    horas: "13:45",
  });

  const [errors, setErrors] = useState<any>({});
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [taskToFinishId, setTaskToFinishId] = useState<number | null>(null);

  //tasks completed
  const tasksCompleted = async () => {
    const savedEID = localStorage.getItem("userID");
    // No consultar si es admin (userID=0) o no hay ID
    if (!savedEID || savedEID === "0") return;
    try {
      const response = await fetch('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: savedEID }),
      });
      const data = await response.json();
      if (data.success) setCompletedTasks(data.data.result ?? []);
    } catch (error) {
      console.warn("Error fetching completed tasks:", error);
    }
  }

  useEffect(() => {
    tasksCompleted();
  }, [])

  // Initialize tasks from localStorage
  useEffect(() => {
    const savedActive = localStorage.getItem("activeTasks");
    if (savedActive) setActiveTasks(JSON.parse(savedActive));
  }, []);

  // Capture params from URL and sync with localStorage
  useEffect(() => {
    const savedPID = localStorage.getItem("proyectoID");
    const savedTID = localStorage.getItem("tareaID");
    const savedEID = localStorage.getItem("userID");

    const pID = searchParams.get("proyectoID") || savedPID;
    const tID = searchParams.get("tareaID") || savedTID;
    const eID = searchParams.get("userID") || savedEID;

    if (pID) localStorage.setItem("proyectoID", pID);
    if (tID) localStorage.setItem("tareaID", tID);
    if (eID) localStorage.setItem("userID", eID);

    setFormData(prev => ({
      ...prev,
      proyecto: pID || prev.proyecto,
      tarea: tID || prev.tarea,
      empleado: eID || prev.empleado,
    }));
  }, [searchParams]);

  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated");
    const role = localStorage.getItem("userRole") as any;
    const name = localStorage.getItem("userName");
    const image = localStorage.getItem("userImage");
    if (!auth || !role) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
      setUserRole(role);
      setUserName(name || "");
      setUserImage(image || "");
    }
  }, [router]);

  useEffect(() => {
    if (userRole !== "admin" && userRole !== null) {
      const updateClock = () => {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        setFormData(prev => ({ ...prev, horas: timeString }));
      };

      updateClock(); // Initial update
      const interval = setInterval(updateClock, 1000);
      return () => clearInterval(interval);
    }
  }, [userRole]);

  const schema = useMemo(() => (userRole === "admin" ? adminSchema : userSchema), [userRole]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);

    const result = schema.safeParse(newFormData);
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0];
        if (path === name) fieldErrors[path] = issue.message;
      });
      setErrors((prev: any) => ({ ...prev, [name]: fieldErrors[name] }));
    } else {
      setErrors((prev: any) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch(e) {
      console.error(e);
    }
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userID");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userImage");
    localStorage.removeItem("userName");
    router.push("/login");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(formData);
    if (result.success) {
      if (userRole !== "admin") {
        if (activeTasks.length > 0) {
          toast.warning("Ya tienes una tarea en progreso. Termina la actual antes de iniciar una nueva.");
          return;
        }
        const newTask = {
          id: Math.floor(Math.random() * 1000),
          proyectoID: formData.proyecto,
          tareaID: formData.tarea,
          empleado: formData.empleado,
          horas: formData.horas,
        };
        const updatedTasks = [...activeTasks, newTask];
        setActiveTasks(updatedTasks);
        localStorage.setItem("activeTasks", JSON.stringify(updatedTasks));
        toast.success("Tarea iniciada correctamente.");
        setShowForm(false);
      }
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
    }
  };

  const handleFinishTask = (taskId: number) => {
    // Open QR scanner to verify before finishing
    setTaskToFinishId(taskId);
    setShowQRScanner(true);
  };

  const handleQRScanSuccess = (decodedText: string) => {
    if (!taskToFinishId) return;

    const taskToFinish = activeTasks.find(t => t.id === taskToFinishId);
    if (!taskToFinish) {
      toast.error("Tarea no encontrada.");
      setShowQRScanner(false);
      setTaskToFinishId(null);
      return;
    }

    try {
      // Extract projectId and taskId from scanned URL
      const url = new URL(decodedText);
      const scannedProjectId = url.searchParams.get("proyectoID");
      const scannedTaskId = url.searchParams.get("tareaID");

      // Validate against active task
      if (
        scannedProjectId === taskToFinish.proyectoID &&
        scannedTaskId === taskToFinish.tareaID
      ) {
        // QR code matches! Close scanner and proceed with completion
        setShowQRScanner(false);
        completeTask(taskToFinish);
      } else {
        toast.error(`CÃ³digo QR incorrecto. Esperado: Proyecto ${taskToFinish.proyectoID}, Tarea ${taskToFinish.tareaID}`);
        setShowQRScanner(false);
        setTaskToFinishId(null);
      }
    } catch (error) {
      toast.error("El cÃ³digo QR no contiene una URL vÃlida.");
      setShowQRScanner(false);
      setTaskToFinishId(null);
    }
  };

  const handleQRScanError = () => {
    setShowQRScanner(false);
    setTaskToFinishId(null);
  };

  const completeTask = async (taskToFinish: any) => {
    // Prompt for description
    const descripcion = prompt("Describe el trabajo realizado:");
    if (!descripcion || descripcion.trim() === "") {
      toast.warning("Debe proporcionar una descripciÃ³n para finalizar la tarea.");
      setTaskToFinishId(null);
      return;
    }

    // Calculate time duration
    const endTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const startParts = taskToFinish.horas.split(':');
    const endParts = endTime.split(':');

    const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

    let durationMinutes = endMinutes - startMinutes;
    if (durationMinutes < 0) durationMinutes += 24 * 60; // Handle crossing midnight

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const hoursFormatted = String(hours).padStart(2, "0");
    const minutesFormatted = String(minutes).padStart(2, "0");
    const duration = `${hoursFormatted}:${minutesFormatted}`;

    const finishedTask = {
      ...taskToFinish,
      descripcion: descripcion.trim(),
      finalizado: endTime,
      duracion: duration
    };

    // Create JSON summary
    const jsonSummary = {
      id_proyecto: taskToFinish.proyectoID,
      id_tarea: taskToFinish.tareaID,
      id_usuario: taskToFinish.empleado,
      descripcion: descripcion.trim(),
      horas: duration,
      date: new Date().toISOString(),
    };

    // Send data to webhook via API Route
    try {
      const response = await fetch("/api/complete-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonSummary),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      toast.success("Tarea completada y enviada correctamente.");
    } catch (error) {
      console.error("Error sending task data:", error);
      toast.error("Hubo un error al enviar los datos de la tarea.");
    }

    const updatedActive = activeTasks.filter(t => t.id !== taskToFinish.id);
    // const updatedCompleted = [finishedTask, ...completedTasks];

    setActiveTasks(updatedActive);
    await tasksCompleted()
    localStorage.setItem("activeTasks", JSON.stringify(updatedActive));
    // localStorage.setItem("completedTasks", JSON.stringify(updatedCompleted));
    setTaskToFinishId(null);
  };

  const isValid = useMemo(() => {
    const baseValid = schema.safeParse(formData).success;
    if (userRole !== "admin" && userRole !== null) {
      return baseValid && !!formData.proyecto && !!formData.tarea;
    }
    return baseValid;
  }, [formData, schema, userRole]);

  const missingIds = useMemo(() => {
    return userRole === "user" && (!formData.proyecto || !formData.tarea);
  }, [userRole, formData.proyecto, formData.tarea]);

  const qrData = useMemo(() => {
    if (userRole === "admin") {
      if (adminMode === "asistencia") return `${URL_PUBLIC}/login`;
      if (isValid) {
        const { proyecto, tarea } = formData;
        return `${URL_PUBLIC}/?proyectoID=${proyecto}&tareaID=${tarea}`;
      }
    }
    return "";
  }, [formData, isValid, userRole, adminMode, URL_PUBLIC]);

  const qrCodeUrl = useMemo(() => {
    return qrData
      ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`
      : "";
  }, [qrData]);

  const handleDownload = async () => {
    if (!qrCodeUrl) return;
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.body.appendChild(document.createElement("a"));
      link.href = url;
      link.download = adminMode === "asistencia" ? `qr-asistencia.png` : `qr-${formData.proyecto}-${formData.tarea}.png`;
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Codigo QR descargado");
    } catch (error) {
      toast.error("Error al descargar el cÃ³digo QR");
    }
  };


  if (!isAuthenticated || !userRole) return null;

  return (
    <>
      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => {
          setShowQRScanner(false);
          setTaskToFinishId(null);
        }}
        onScanSuccess={handleQRScanSuccess}
        onScanError={handleQRScanError}
      />
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans dark:bg-zinc-950">
        <div className={`grid w-full max-w-5xl gap-8 transition-all ${userRole === "admin" ? "lg:grid-cols-[1fr_400px]" : "lg:max-w-xl"}`}>
          {/* User Dashboard View */}
          {(userRole === "user" || userRole === "resident" || userRole === "supervisor" || userRole === "employee") && userView === "dashboard" && (
            <UserDashboard
              userName={userName}
              userImage={userImage}
              userRole={localStorage.getItem("userRole")}
              onNavigateToTasks={() => setUserView("tasks")}
              onLogout={handleLogout}
            />
          )}

          {/* Main Content (Admin Panel or User Task View) */}
          {((userRole === "admin") || ((userRole === "user" || userRole === "resident" || userRole === "supervisor" || userRole === "employee") && userView === "tasks")) && (
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl transition-all dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
              <div className="p-8">
                <div className="mb-8 flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {userRole === "admin" ? "Panel de Administrador" : "TerraField App"}
                    </h1>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      Inicia sesion en TerraField App
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {userRole === "user" && (
                      <button
                        onClick={() => setUserView("dashboard")}
                        className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Volver al Dashboard
                      </button>
                    )}
                    <button
                      onClick={handleLogout}
                      className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Cerrar Sesion
                    </button>
                  </div>
                </div>
                {userRole === "admin" ? (
                  <AdminPanel
                    adminMode={adminMode}
                    setAdminMode={setAdminMode}
                    handleSubmit={handleSubmit}
                    formData={formData}
                    errors={errors}
                    handleChange={handleChange}
                    isValid={isValid}
                    isSubmitted={isSubmitted}
                    handleDownload={handleDownload}
                    URL_PUBLIC={URL_PUBLIC}
                  />
                ) : !showForm ? (
                  <div className="space-y-6">
                    <button
                      onClick={() => activeTasks.length === 0 && setShowForm(true)}
                      disabled={activeTasks.length > 0}
                      className={`group flex w-full items-center justify-between rounded-3xl border p-6 shadow-sm transition-all ${activeTasks.length > 0
                        ? "border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-60 dark:border-zinc-800 dark:bg-zinc-800/20"
                        : "border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                        }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${activeTasks.length > 0 ? "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600" : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                        </div>
                        <div className="text-left">
                          <h3 className={`text-lg font-bold ${activeTasks.length > 0 ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-900 dark:text-zinc-100"}`}>Registrar Tarea</h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-500">
                            {activeTasks.length > 0 ? "Termina tu tarea actual primero" : "Iniciar un nuevo trabajo manual"}
                          </p>
                        </div>
                      </div>
                      {!activeTasks.length && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300 transition-transform group-hover:translate-x-1 dark:text-zinc-600"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>}
                    </button>

                    <div className="space-y-4">
                      <div className="flex border-b border-zinc-100 dark:border-zinc-800">
                        <button
                          onClick={() => setActiveTab("active")}
                          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${activeTab === "active" ? "border-black text-black dark:border-white dark:text-white" : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400"}`}
                        >
                          EN PROGRESO ({activeTasks.length})
                        </button>
                        <button
                          onClick={() => setActiveTab("history")}
                          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${activeTab === "history" ? "border-black text-black dark:border-white dark:text-white" : "border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400"}`}
                        >
                          HISTORIAL ({completedTasks.length})
                        </button>
                      </div>

                      {activeTab === "active" ? (
                        activeTasks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800">
                            <p className="text-sm text-zinc-400">No hay tareas activas</p>
                          </div>
                        ) : (
                          <div className="grid gap-3">
                            {activeTasks.map((task) => (
                              <div key={task.id} className="relative overflow-hidden rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                                <div className="absolute left-0 top-0 h-full w-1.5 bg-green-500" />
                                <div className="flex items-start justify-between">
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                                        {task.descripcion || "Tarea en progreso"}
                                      </h3>
                                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:bg-green-900/20 dark:text-green-400">ACTIVO</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="rounded-lg bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                        ID: {task.tareaID}
                                      </div>
                                      <div className="rounded-lg bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                        Proy: {task.proyectoID}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
                                      <span className="text-xs">Inicio: {task.horas}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleFinishTask(task.id)}
                                    className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                                  >
                                    <div className="h-3 w-3 rounded-sm bg-red-600 dark:bg-red-400" />
                                    Terminar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        completedTasks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800">
                            <p className="text-sm text-zinc-400">No hay tareas terminadas</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-end mb-4">
                              <div className="flex items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                                <button
                                  onClick={() => setHistoryView("list")}
                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${historyView === "list"
                                    ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                    }`}
                                >
                                  DÃ­a
                                </button>
                                <button
                                  onClick={() => setHistoryView("weekly")}
                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${historyView === "weekly"
                                    ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                    }`}
                                >
                                  Semana
                                </button>
                              </div>
                            </div>

                            {historyView === "list" ? (
                              <ScrollArea className="h-[400px]">
                                <div className="grid gap-3">
                                  {completedTasks.map((task) => (
                                    <div key={task.id} className="relative overflow-hidden rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 opacity-80">
                                      <div className="absolute left-0 top-0 h-full w-1.5 bg-zinc-300 dark:bg-zinc-700" />
                                      <div className="flex items-start justify-between">
                                        <div className="space-y-3">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{task.name}</h3>
                                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">FINALIZADO</span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <div className="rounded-lg bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                              ID: {task.id}
                                            </div>
                                            <div className="rounded-lg bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                              Proy: {task.project_id[0]}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
                                            <span className="text-xs">{task.date} â€” {formatHoursMinutes(task.unit_amount)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            ) : (
                              <ScrollArea className="h-[400px]">
                                <div className="grid gap-4">
                                  {Object.entries(groupedTasks).map(([weekStart, { totalHours, tasks }]: any) => (
                                    <div key={weekStart} className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 opacity-90">
                                      <div className="border-b border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                                              Semana del {new Date(weekStart).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                                            </h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                              {tasks.length} tareas completadas
                                            </p>
                                          </div>
                                          <div className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold shadow-sm dark:bg-zinc-800 dark:text-zinc-200">
                                            {formatHoursMinutes(totalHours)} Total
                                          </div>
                                        </div>
                                      </div>
                                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {tasks.map((task: any) => (
                                          <div key={task.id} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                            <div className="flex items-center justify-between">
                                              <div className="min-w-0 flex-1 pr-4">
                                                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-200">
                                                  {task.name}
                                                </p>
                                                <p className="mt-1 text-xs text-zinc-500">
                                                  {new Date(task.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} â€¢ ID: {task.id}
                                                </p>
                                              </div>
                                              <div className="flex-shrink-0 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                                {formatHoursMinutes(task.unit_amount)}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            )}
                          </>

                        )
                      )
                      }
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="grid gap-6">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        Volver
                      </button>
                    </div>
                    {missingIds && (
                      <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                        <p className="text-sm text-amber-800 dark:text-amber-400 font-medium">
                          Se requiere proyectoID y tareaID para enviar reportes. Por favor, acceda mediante un codigo QR valido.
                        </p>
                      </div>
                    )}
                    <Field id="empleado" readOnly={true} label="Usuario ID" value={formData.empleado} error={errors.empleado} onChange={handleChange} customClassName="bg-zinc-50 dark:bg-zinc-800/50 cursor-not-allowed opacity-80" />
                    <Field
                      id="horas"
                      label="Hora de marcado"
                      value={formData.horas}
                      error={errors.horas}
                      onChange={handleChange}
                      readOnly={true}
                      customClassName="bg-zinc-50 dark:bg-zinc-800/50 cursor-not-allowed opacity-80"
                    />
                    <button
                      type="submit"
                      disabled={!isValid || isSubmitted || missingIds}
                      className={`h-12 w-full rounded-xl font-semibold transition-all ${isSubmitted ? "bg-green-500 text-white" :
                        missingIds ? "bg-zinc-200 text-zinc-500 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500" :
                          "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                        } disabled:opacity-50`}
                    >
                      {isSubmitted ? "ÂTarea Iniciada!" : missingIds ? "Tarea Bloqueada" : "Iniciar Tarea"}
                    </button>
                  </form>
                )}
              </div>
              <div className="bg-zinc-50 px-8 py-4 dark:bg-zinc-800/50">
                <p className="text-center text-xs text-zinc-400">TerraField App {userRole === "admin" ? "Admin" : "User"}</p>
              </div>
            </div>
          )}

          {/* Admin Preview Sidebar */}
          {userRole === "admin" && (
            <div className="flex flex-col items-center justify-center gap-8 rounded-3xl bg-zinc-900 p-8 text-white shadow-2xl dark:bg-white dark:text-black lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
              <div className="relative group">
                {!!qrData && <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 opacity-25 blur transition group-hover:opacity-100" />}
                <div className="relative overflow-hidden rounded-xl bg-white p-4">
                  {!!qrData ? (
                    <img src={qrCodeUrl} alt="QR" className="h-64 w-64" />
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center border-2 border-dashed border-zinc-200 text-center">
                      <p className="px-4 text-sm text-zinc-400">Completa los campos para generar el QR</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="w-full space-y-4">
                <div className="rounded-xl bg-white/10 p-4 text-center dark:bg-black/5">
                  <p className="text-xs font-mono opacity-60">Datos:</p>
                  <p className="mt-1 font-mono text-sm break-all">{qrData || "..."}</p>
                </div>
                <button
                  onClick={handleDownload}
                  disabled={!qrData}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-white text-sm font-semibold text-black transition-all hover:bg-zinc-100 disabled:opacity-30 dark:bg-black dark:text-white dark:hover:bg-zinc-800"
                >
                  Descargar QR
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}




