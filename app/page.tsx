"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

const adminSchema = z.object({
  proyecto: z.string().min(1, "El ID del proyecto es requerido"),
  tarea: z.string().min(1, "El ID de la tarea es requerido"),
});

const userSchema = z.object({
  empleado: z.string().min(1, "El ID del empleado es requerido"),
  horas: z.string().min(1, "La hora de finalización es requerida"),
  descripcion: z.string().min(1, "La descripción es requerida"),
});

type AdminFormData = z.infer<typeof adminSchema>;
type UserFormData = z.infer<typeof userSchema>;

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const URL_PUBLIC = process.env.NEXT_PUBLIC_URL;
  const [formData, setFormData] = useState({
    proyecto: "",
    tarea: "",
    empleado: "5",
    horas: "13:45",
    descripcion: "Avance de obra en sector 4",
  });

  const [errors, setErrors] = useState<any>({});

  // Capture params from URL and sync with localStorage
  useEffect(() => {
    const savedPID = localStorage.getItem("proyectoID");
    const savedTID = localStorage.getItem("tareaID");
    
    const pID = searchParams.get("proyectoID") || savedPID;
    const tID = searchParams.get("tareaID") || savedTID;

    if (pID) localStorage.setItem("proyectoID", pID);
    if (tID) localStorage.setItem("tareaID", tID);

    setFormData(prev => ({
      ...prev,
      proyecto: pID || prev.proyecto,
      tarea: tID || prev.tarea,
    }));
  }, [searchParams]);

  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated");
    const role = localStorage.getItem("userRole") as "admin" | "user";
    if (!auth || !role) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
      setUserRole(role);
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
        const reportData = {
          proyectoID: formData.proyecto,
          tareaID: formData.tarea,
          empleado: formData.empleado,
          horas: formData.horas,
          descripcion: formData.descripcion,
          timestamp: new Date().toISOString()
        };
        console.log("Reporte JSON a enviar:", JSON.stringify(reportData, null, 2));
        alert("datos enviados:" + JSON.stringify(reportData, null, 2));
      }
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
    }
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
    if (userRole === "admin" && isValid) {
      const { proyecto, tarea } = formData;
      return `${URL_PUBLIC}/?proyectoID=${proyecto}&tareaID=${tarea}`;
    }
    return "";
  }, [formData, isValid, userRole]);

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
      link.download = `qr-${formData.proyecto}-${formData.tarea}.png`;
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Error al descargar el código QR");
    }
  };

  if (!isAuthenticated || !userRole) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans dark:bg-zinc-950">
      <div className={`grid w-full max-w-5xl gap-8 transition-all ${userRole === "admin" ? "lg:grid-cols-[1fr_400px]" : "lg:max-w-xl"}`}>
        {/* Main Content */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl transition-all dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
          <div className="p-8">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {userRole === "admin" ? "Panel de Administrador" : "Reporte de Usuario"}
                </h1>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {userRole === "admin" ? "Genera códigos QR para proyectos." : "Registra tu avance de hoy."}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cerrar Sesión
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-6">
              {userRole === "admin" ? (
                <>
                  <Field id="proyecto" label="Proyecto ID" value={formData.proyecto} error={errors.proyecto} onChange={handleChange} />
                  <Field id="tarea" label="Tarea ID" value={formData.tarea} error={errors.tarea} onChange={handleChange} />
                </>
              ) : (
                <>
                  {missingIds && (
                    <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                      <p className="text-sm text-amber-800 dark:text-amber-400 font-medium">
                        ⚠️ Se requiere proyectoID y tareaID para enviar reportes. Por favor, acceda mediante un código QR válido.
                      </p>
                    </div>
                  )}
                  <Field id="empleado" label="Usuario ID" value={formData.empleado} error={errors.empleado} onChange={handleChange} />
                  <Field 
                    id="horas" 
                    label="Hora de marcado" 
                    value={formData.horas} 
                    error={errors.horas} 
                    onChange={handleChange} 
                    readOnly={true}
                    customClassName="bg-zinc-50 dark:bg-zinc-800/50 cursor-not-allowed opacity-80"
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Descripción</label>
                    <textarea
                      name="descripcion"
                      rows={3}
                      value={formData.descripcion}
                      onChange={handleChange}
                      className={`flex w-full max-h-32 min-h-32 rounded-xl border bg-transparent px-4 py-2 text-sm focus:outline-none focus:ring-1 ${
                        errors.descripcion ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black dark:border-zinc-800 dark:focus:border-white"
                      }`}
                    />
                    {errors.descripcion && <p className="text-xs text-red-500">{errors.descripcion}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={!isValid || isSubmitted || missingIds}
                    className={`h-12 w-full rounded-xl font-semibold transition-all ${
                      isSubmitted ? "bg-green-500 text-white" : 
                      missingIds ? "bg-zinc-200 text-zinc-500 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500" :
                      "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    } disabled:opacity-50`}
                  >
                    {isSubmitted ? "¡Datos Enviados!" : missingIds ? "Reporte Bloqueado" : "Enviar Reporte"}
                  </button>
                </>
              )}
            </form>
          </div>
          <div className="bg-zinc-50 px-8 py-4 dark:bg-zinc-800/50">
            <p className="text-center text-xs text-zinc-400">QR Generator Studio • {userRole === "admin" ? "Admin" : "User"}</p>
          </div>
        </div>

        {/* Admin Preview Sidebar */}
        {userRole === "admin" && (
          <div className="flex flex-col items-center justify-center gap-8 rounded-3xl bg-zinc-900 p-8 text-white shadow-2xl dark:bg-white dark:text-black lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <div className="relative group">
              {isValid && <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 opacity-25 blur transition group-hover:opacity-100" />}
              <div className="relative overflow-hidden rounded-xl bg-white p-4">
                {isValid ? (
                  <img src={qrCodeUrl} alt="QR" className="h-64 w-64" />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center border-2 border-dashed border-zinc-200 text-center">
                    <p className="px-4 text-sm text-zinc-400">Complete los campos de Admin</p>
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
                disabled={!isValid}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-white text-sm font-semibold text-black transition-all hover:bg-zinc-100 disabled:opacity-30 dark:bg-black dark:text-white dark:hover:bg-zinc-800"
              >
                Descargar QR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
        className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${
          error ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black dark:border-zinc-800 dark:focus:border-white"
        } ${customClassName || ""}`}
        placeholder={placeholder}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
