"use client";

import { useGeolocation } from '@/hooks';

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import QRScannerModal from "@/components/QRScannerModal";
import { ScrollArea } from "@/components/ui/scroll-area";

const adminSchema = z.object({
  proyecto: z.string().min(1, "El ID del proyecto es requerido"),
  tarea: z.string().min(1, "El ID de la tarea es requerido"),
});

const userSchema = z.object({
  empleado: z.string().min(1, "El ID del empleado es requerido"),
  horas: z.string().min(1, "La hora de finalización es requerida"),
});

type AdminFormData = z.infer<typeof adminSchema>;
type UserFormData = z.infer<typeof userSchema>;

function formatHoursMinutes(decimalHours: number): string {
  const hours = Math.floor(decimalHours);              // parte entera → horas
  const minutes = Math.round((decimalHours - hours) * 60); // parte decimal → minutos
  return `${String(hours).padStart(2, '0')}h: ${String(minutes).padStart(2, '0')}m`;
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
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
    const role = localStorage.getItem("userRole") as "admin" | "user";
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
    if (userRole === "user") {
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

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    router.push("/login");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(formData);
    if (result.success) {
      if (userRole === "user") {
        if (activeTasks.length > 0) {
          alert("Ya tienes una tarea en progreso. Termina la actual antes de iniciar una nueva.");
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
        console.log("Tarea agregada:", JSON.stringify(updatedTasks));
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
      alert("Tarea no encontrada.");
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
        alert(
          `Código QR incorrecto.\n\nEsperado: Proyecto ${taskToFinish.proyectoID}, Tarea ${taskToFinish.tareaID}\nEscaneado: Proyecto ${scannedProjectId || "N/A"}, Tarea ${scannedTaskId || "N/A"}`
        );
        setShowQRScanner(false);
        setTaskToFinishId(null);
      }
    } catch (error) {
      alert("El código QR no contiene una URL válida.");
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
      alert("Debe proporcionar una descripción para finalizar la tarea.");
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

    // Send data to webhook
    try {
      const response = await fetch("https://n8n-n8n.2fsywk.easypanel.host/webhook/hoja_horas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonSummary),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log("Task data sent to webhook successfully:", jsonSummary);
      alert(`Tarea completada y enviada:\n\n${JSON.stringify(jsonSummary, null, 2)}`);
    } catch (error) {
      console.error("Error sending task data to webhook:", error);
      alert(`Tarea completada pero hubo un error al enviar los datos:\n\n${JSON.stringify(jsonSummary, null, 2)}\n\nError: ${error}`);
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
    if (userRole === "user") {
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
    } catch (error) {
      alert("Error al descargar el código QR");
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
          {userRole === "user" && userView === "dashboard" && (
            <UserDashboard
              userName={userName}
              userImage={userImage}
              onNavigateToTasks={() => setUserView("tasks")}
              onLogout={handleLogout}
            />
          )}

          {/* Main Content (Admin Panel or User Task View) */}
          {((userRole === "admin") || (userRole === "user" && userView === "tasks")) && (
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl transition-all dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
              <div className="p-8">
                <div className="mb-8 flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {userRole === "admin" ? "Panel de Administrador" : "Reporte de Usuario"}
                    </h1>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {userRole === "admin" ? "Genera códigos QR para proyectos o asistencia." : "Registra tu avance de hoy."}
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
                      Cerrar Sesión
                    </button>
                  </div>
                </div>

                {userRole === "admin" ? (
                  <div className="grid gap-6">
                    {/* Tabs modo admin */}
                    <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setAdminMode("proyecto")}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${adminMode === "proyecto" ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                          }`}
                      >
                        📋 Proyecto / Tarea
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminMode("asistencia")}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${adminMode === "asistencia" ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                          }`}
                      >
                        🕐 Asistencia
                      </button>
                    </div>

                    {adminMode === "proyecto" ? (
                      <form onSubmit={handleSubmit} className="grid gap-6">
                        <Field id="proyecto" label="Proyecto ID" value={formData.proyecto} error={errors.proyecto} onChange={handleChange} />
                        <Field id="tarea" label="Tarea ID" value={formData.tarea} error={errors.tarea} onChange={handleChange} />
                        <button
                          type="submit"
                          disabled={!isValid || isSubmitted}
                          className={`h-12 w-full rounded-xl font-semibold transition-all ${isSubmitted ? "bg-green-500 text-white" :
                            "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                            } disabled:opacity-50`}
                        >
                          {isSubmitted ? "¡Código Generado!" : "Generar QR de Proyecto"}
                        </button>
                      </form>
                    ) : (
                      <div className="grid gap-4">
                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
                          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">🕐 QR de Asistencia</p>
                          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                            Este QR lleva a los empleados al login del app para registrar su entrada o salida.
                          </p>
                          <p className="mt-2 font-mono text-xs text-blue-500 break-all">{URL_PUBLIC}/login</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="h-12 w-full rounded-xl bg-black font-semibold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                        >
                          ⬇️ Descargar QR de Asistencia
                        </button>
                      </div>
                    )}
                  </div>
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
                                  Día
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
                                            <span className="text-xs">{task.date} — {formatHoursMinutes(task.unit_amount)}</span>
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
                                                  {new Date(task.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} • ID: {task.id}
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
                          ⚠️ Se requiere proyectoID y tareaID para enviar reportes. Por favor, acceda mediante un código QR válido.
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
                      {isSubmitted ? "¡Tarea Iniciada!" : missingIds ? "Tarea Bloqueada" : "Iniciar Tarea"}
                    </button>
                  </form>
                )}
              </div>
              <div className="bg-zinc-50 px-8 py-4 dark:bg-zinc-800/50">
                <p className="text-center text-xs text-zinc-400">QR Generator Studio • {userRole === "admin" ? "Admin" : "User"}</p>
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

function Field({ id, label, value, error, onChange, placeholder, readOnly, customClassName }: any) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${error ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black dark:border-zinc-800 dark:focus:border-white"
          } ${customClassName || ""}`}
        placeholder={placeholder}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}


function UserDashboard({ userName, userImage, onNavigateToTasks, onLogout }: any) {
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [attendanceRecord, setAttendanceRecord] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [attendanceView, setAttendanceView] = useState<"day" | "week">("day");
  const { getLocation, error: geoError } = useGeolocation();

  const groupedAttendance = useMemo(() => {
    const groups: Record<string, { totalHours: number, records: any[] }> = {};

    // Sort by date desc
    const sortedHistory = [...attendanceHistory].sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());

    sortedHistory.forEach(record => {
      const date = new Date(record.check_in);
      const day = date.getDay();
      const diff = date.getDate() - day;
      const weekStart = new Date(date);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);

      const key = weekStart.toISOString();

      if (!groups[key]) {
        groups[key] = { totalHours: 0, records: [] };
      }

      groups[key].records.push(record);
      groups[key].totalHours += (Number(record.worked_hours) || 0);
    });

    return groups;
  }, [attendanceHistory]);

  const fetchAttendanceSummary = async () => {
    try {
      const savedEID = localStorage.getItem("userID");
      if (!savedEID) return;

      const response = await fetch('/api/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(savedEID), allHistory: true }),
      });

      const data = await response.json();
      if (response.ok && data.data.result) {
        setAttendanceHistory(data.data.result);

        // Find today's record
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = data.data.result.find((r: any) => r.check_in.startsWith(today));
        setAttendanceRecord(todayRecord || null);
      } else {
        setAttendanceHistory([]);
        setAttendanceRecord(null);
      }
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
    }
  };

  useEffect(() => {
    fetchAttendanceSummary();
  }, []);

  const executeAssistance = async () => {
    try {
      setStatus({ type: 'loading', message: 'Obteniendo ubicación...' });

      // Obtener ubicación GPS
      const coords = await getLocation();

      if (!coords) {
        // Si hay error de geolocalización, mostrar advertencia pero continuar
        console.warn('No se pudo obtener ubicación:', geoError);
        setStatus({ type: 'loading', message: 'Procesando sin ubicación...' });
      } else {
        setStatus({ type: 'loading', message: 'Procesando...' });
      }

      const savedEIDRaw = localStorage.getItem("userID");

      if (savedEIDRaw === null) {
        throw new Error("userID no existe en localStorage");
      }

      const savedEID = Number(savedEIDRaw);

      if (isNaN(savedEID)) {
        throw new Error("userID no es un número válido");
      }

      const response = await fetch('/api/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: savedEID }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error al marcar la asistencia");
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const now = new Date();
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      // Preparar datos de ubicación si están disponibles
      const locationData = coords ? {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      } : {};

      if (data.data.result) {
        if (data.data.result.length === 0) {
          await fetch('/api/assistance/in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: savedEID, ...locationData }),
          });
          const locationMsg = coords ? ` (Ubicación: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` : ' (Sin ubicación)';
          setStatus({ type: 'success', message: `¡Entrada registrada a las ${timeStr}!${locationMsg}` });
        } else {
          const lastRegistry = data.data.result[0];
          if (!lastRegistry.check_out) {
            const responseOut = await fetch('/api/assistance/out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ registryId: lastRegistry.id, ...locationData }),
            });
            const dataOut = await responseOut.json();
            if (!responseOut.ok) {
              throw new Error(dataOut.error || "Error al marcar la salida");
            }
            console.log("Salida registrada:", dataOut);
            const locationMsg = coords ? ` (Ubicación: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` : ' (Sin ubicación)';
            setStatus({ type: 'success', message: `¡Salida registrada a las ${timeStr}!${locationMsg}` });
          } else {
            const responseIn = await fetch('/api/assistance/in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: savedEID, ...locationData }),
            });
            const dataIn = await responseIn.json();
            if (!responseIn.ok) {
              throw new Error(dataIn.error || "Error al marcar nueva entrada");
            }
            console.log("Nueva entrada registrada:", dataIn);
            const locationMsg = coords ? ` (Ubicación: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` : ' (Sin ubicación)';
            setStatus({ type: 'success', message: `¡Entrada registrada a las ${timeStr}!${locationMsg}` });
          }
        }
      }

      // Refresh summary after marking attendance
      await fetchAttendanceSummary();

      // Clear success message after 5 seconds
      setTimeout(() => {
        setStatus(prev => prev.type === 'success' ? { type: 'idle', message: '' } : prev);
      }, 5000);

    } catch (error) {
      console.error("Error marking attendance:", error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : "Error desconocido al registrar asistencia"
      });

      // Clear error message after 5 seconds
      setTimeout(() => {
        setStatus(prev => prev.type === 'error' ? { type: 'idle', message: '' } : prev);
      }, 5000);
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    try {
      const url = new URL(decodedText);
      const isLoginUrl = url.pathname === '/login' || url.pathname.endsWith('/login');

      if (isLoginUrl) {
        // Es el QR de asistencia generado por el admin
        setShowQRScanner(false);
        executeAssistance();
        return;
      }

      const proyectoID = url.searchParams.get("proyectoID");
      const tareaID = url.searchParams.get("tareaID");

      if (proyectoID === process.env.NEXT_PUBLIC_PROYECTO_ID && tareaID === process.env.NEXT_PUBLIC_TAREA_ID) {
        // Es un QR de proyecto válido
        setShowQRScanner(false);
        executeAssistance();
      } else {
        alert("El código QR no es válido para asistencia.");
        setShowQRScanner(false);
      }
    } catch (e) {
      alert("El código QR escaneado no es válido.");
      setShowQRScanner(false);
    }
  };

  const handleScanError = () => {
    // console.warn(error);
  };

  return (
    <div className="w-full space-y-6">
      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScanSuccess={handleScanSuccess}
        onScanError={handleScanError}
      />
      {/* Profile Header */}
      <div className="flex flex-col items-center justify-center rounded-[40px] bg-white p-10 shadow-sm dark:bg-zinc-900 ring-1 ring-zinc-100 dark:ring-white/5">
        <div className="relative mb-6">
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-blue-500 p-1">
            <div className="h-full w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              {/* Profile Image/QR Placeholder */}
              <div className="flex h-full w-full items-center justify-center bg-white dark:bg-zinc-900">
                <div className="relative h-30 w-30 overflow-hidden rounded-lg">
                  <img
                    src={`data:image/svg+xml;base64,${userImage}`}
                    alt="Profile"
                    className="h-full w-full rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-1 right-2 h-6 w-6 rounded-full border-4 border-white bg-green-500 dark:border-zinc-900" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{userName}</h2>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-1.5 dark:bg-white/5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Colaborador</span>
        </div>
      </div>

      {/* Attendance Summary */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-[30px] border border-zinc-100 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Resumen de Asistencia</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-[10px] font-bold uppercase text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {showHistory ? 'Cerrar Historial' : 'Ver Historial'}
              </button>
              <div className={`h-2 w-2 rounded-full ${attendanceRecord ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`} />
            </div>
          </div>

          <div className="flex items-center justify-around py-2">
            <div className="text-center">
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Hoy Entrada</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {attendanceRecord?.check_in ? attendanceRecord.check_in.split(' ')[1].slice(0, 5) : '--:--'}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-zinc-100 dark:bg-zinc-800" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Hoy Salida</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {attendanceRecord?.check_out ? attendanceRecord.check_out.split(' ')[1].slice(0, 5) : '--:--'}
              </p>
            </div>
          </div>

          {showHistory && attendanceHistory.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-zinc-50 pt-4 dark:border-zinc-800/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-zinc-400 uppercase">Registros Recientes</p>
                <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 dark:bg-white/5">
                  <button
                    onClick={() => setAttendanceView("day")}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${attendanceView === "day"
                      ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                  >
                    Día
                  </button>
                  <button
                    onClick={() => setAttendanceView("week")}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${attendanceView === "week"
                      ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                  >
                    Semana
                  </button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {attendanceView === "day" ? (
                  attendanceHistory.map((record: any) => {
                    const checkInDate = new Date(record.check_in);
                    return (
                      <div key={record.id} className="flex items-center justify-between rounded-xl bg-zinc-50/50 p-3 dark:bg-white/5">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-zinc-500">
                            {checkInDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {record.check_in.split(' ')[1].slice(0, 5)} - {record.check_out ? record.check_out.split(' ')[1].slice(0, 5) : 'Pendiente'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-zinc-400">Total</span>
                          <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                            {record.worked_hours ? `${Number(record.worked_hours).toFixed(1)}h` : '--'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  Object.entries(groupedAttendance).map(([weekStart, { totalHours, records }]: any) => (
                    <div key={weekStart} className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm dark:border-white/5 dark:bg-zinc-900/50">
                      <div className="bg-zinc-50/50 p-3 dark:bg-white/5 border-b border-zinc-50 dark:border-white/5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase">
                              Semana del {new Date(weekStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">
                              {formatHoursMinutes(totalHours)} Total
                            </p>
                          </div>
                          <div className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                            {records.length} registros
                          </div>
                        </div>
                      </div>
                      <div className="divide-y divide-zinc-50 dark:divide-white/5">
                        {records.map((record: any) => (
                          <div key={record.id} className="p-2.5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-medium text-zinc-500">
                                {new Date(record.check_in).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                {record.check_in.split(' ')[1].slice(0, 5)} - {record.check_out ? record.check_out.split(' ')[1].slice(0, 5) : 'Pend'}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-zinc-500">
                              {record.worked_hours ? `${Number(record.worked_hours).toFixed(1)}h` : '--'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {!attendanceRecord && !showHistory && (
            <p className="mt-4 text-center text-xs text-zinc-400 italic">No tienes registros el día de hoy</p>
          )}
        </div>
      </div>

      {/* Main Action - Marcar Asistencia */}
      <button
        onClick={() => setShowQRScanner(true)}
        disabled={status.type === 'loading'}
        className={`group w-full relative overflow-hidden rounded-[30px] border p-8 shadow-sm transition-all text-left
          ${status.type === 'error'
            ? 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
            : status.type === 'success'
              ? 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800'
              : 'border-zinc-100 bg-white hover:shadow-md dark:border-white/5 dark:bg-zinc-900'
          }
        `}
      >
        <div className="absolute -right-4 -top-4 opacity-[0.05] transition-transform group-hover:scale-110">
          <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className={`absolute inset-0 blur-2xl opacity-20 ${status.type === 'success' ? 'bg-green-500' : status.type === 'error' ? 'bg-red-500' : 'bg-blue-600'}`} />
            <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg transition-colors
              ${status.type === 'success'
                ? 'bg-green-500 text-white shadow-green-500/40'
                : status.type === 'error'
                  ? 'bg-red-500 text-white shadow-red-500/40'
                  : 'bg-blue-600 text-white shadow-blue-500/40'
              }
            `}>
              {status.type === 'loading' ? (
                <svg className="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : status.type === 'success' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : status.type === 'error' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
              )}
            </div>
          </div>
          <div className="flex-1">
            <h3 className={`text-xl font-bold tracking-tight transition-colors ${status.type === 'error' ? 'text-red-600 dark:text-red-400' : status.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-zinc-900 dark:text-zinc-50'}`}>
              {status.type === 'idle' ? 'Marcar Asistencia' : status.message}
            </h3>
            <p className={`text-sm font-medium transition-colors ${status.type === 'error' ? 'text-red-500/80 dark:text-red-400/80' : status.type === 'success' ? 'text-green-600/80 dark:text-green-400/80' : 'text-zinc-500'}`}>
              {status.type === 'idle' ? 'Registra tu entrada o salida' : status.type === 'loading' ? 'Conectando con servidor...' : status.type === 'success' ? 'Registro exitoso' : 'Intenta nuevamente'}
            </p>
          </div>
        </div>
      </button>

      {/* Grid Menu */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onNavigateToTasks}
          className="group flex flex-col items-start rounded-[30px] border border-orange-100 bg-white p-6 transition-all hover:bg-orange-50/30 dark:border-white/5 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
        >
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-900/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Horas</h4>
          <p className="text-xs text-zinc-500">Tareo semanal</p>
        </button>

        <div className="relative flex flex-col items-start rounded-[30px] bg-zinc-100/50 p-6 dark:bg-white/5 opacity-60">
          <span className="absolute right-4 top-4 rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">PRONTO</span>
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 dark:bg-zinc-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
          <h4 className="text-lg font-bold text-zinc-400">Gastos</h4>
          <p className="text-xs text-zinc-400">Rendiciones</p>
        </div>

        <div className="relative flex flex-col items-start rounded-[30px] bg-zinc-100/50 p-6 dark:bg-white/5 opacity-60">
          <span className="absolute right-4 top-4 rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">PRONTO</span>
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 dark:bg-zinc-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2" /><path d="M9 22V12h6v10" /><path d="M8 2h8" /></svg>
          </div>
          <h4 className="text-lg font-bold text-zinc-400">Proyectos</h4>
          <p className="text-xs text-zinc-400">Mis asignaciones</p>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Akallpa Employee Portal</p>
      </div>

      <button
        onClick={onLogout}
        className="w-full rounded-2xl py-4 text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors"
      >
        Cerrar Sesión
      </button>
    </div>
  );
}
