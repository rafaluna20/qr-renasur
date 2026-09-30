"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Correo electronico invalido"),
  password: z.string().min(8, "El DNI/Contrasena debe tener al menos 8 caracteres"),
});

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  // Si ya hay una sesión válida no se pide login: aplica al abrir la página y también al volver con «Atrás», cuando el
  // navegador restaura la página tal como se dejó (con el botón en «Cargando…»).
  useEffect(() => {
    let vigente = true;
    const revisar = () => {
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => {
          if (vigente && r.ok) router.replace("/");
        })
        .catch(() => {});
    };
    const alMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setLoading(false);
        revisar();
      }
    };
    revisar();
    window.addEventListener("pageshow", alMostrar);
    return () => {
      vigente = false;
      window.removeEventListener("pageshow", alMostrar);
    };
  }, [router]);

  // Empresas entre las que elegir (si hay más de una). El QR de asistencia puede traer ?empresa=..., y se recuerda la última.
  const [empresas, setEmpresas] = useState<{ id: string; nombre: string }[]>([]);
  const [empresa, setEmpresa] = useState("");
  // Con la empresa ya conocida (QR o recuerdo de la última vez) no se pregunta; solo se muestra si la persona pide cambiarla.
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetch("/api/auth/empresas", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!vigente || !Array.isArray(d?.empresas)) return;
        setEmpresas(d.empresas);
        const pedida = searchParams.get("empresa") || localStorage.getItem("empresaID") || "";
        const valida = d.empresas.find((e: { id: string }) => e.id === pedida);
        setEmpresa(valida ? valida.id : d.empresas.length === 1 ? d.empresas[0].id : "");
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [searchParams]);

  // Motivo con el que /api/auth/sso devuelve aquí cuando la entrada desde la billetera falla (mensajes genéricos).
  const MOTIVOS_SSO: Record<string, string> = {
    codigo: "El enlace de la billetera venció o ya se usó. Vuelve a abrirlo desde Servicios → Asistencia.",
    sin_empleado: "Tu correo de la billetera no está registrado como empleado. Pide que lo den de alta con ese mismo correo.",
    ambiguo: "Tu correo coincide con más de un empleado. Avisa a administración.",
    configuracion: "La entrada desde la billetera no está configurada. Avisa a administración.",
    red: "No pudimos verificar tu sesión de la billetera. Inténtalo de nuevo.",
  };
  const avisoSso = MOTIVOS_SSO[searchParams.get("sso") ?? ""];

  useEffect(() => {
    const pID = searchParams.get("proyectoID");
    const tID = searchParams.get("tareaID");

    if (pID) localStorage.setItem("proyectoID", pID);
    if (tID) localStorage.setItem("tareaID", tID);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: any = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0]] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (empresas.length > 1 && !empresa) {
      setErrors({ email: "Elige tu empresa" });
      return;
    }

    setLoading(true);
    setErrors({});
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password, empresa: empresa || undefined })
      });
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        setErrors({ password: data.error || 'Credenciales incorrectas' });
        setLoading(false);
        return;
      }

      const user = data.user;
      
      // Keep localStorage for UI hydration (secure cookie handles auth)
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userEmail", user.email);
      localStorage.setItem("userRole", user.role);
      localStorage.setItem("userID", user.id);
      localStorage.setItem("userImage", user.image_128 ? String(user.image_128) : "");
      localStorage.setItem("userName", user.name);
      if (user.empresa) localStorage.setItem("empresaID", String(user.empresa));
      
      // replace: «Atrás» no debe devolver a esta pantalla de login.
      router.replace("/");
    } catch (e) {
      setErrors({ password: 'Error de red. Intentalo de nuevo.' });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans dark:bg-zinc-950">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
        <div className="p-8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Bienvenido
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Inicia sesion en QR Generator Studio
            </p>
          </div>

          {avisoSso && (
            <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{avisoSso}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {empresas.length > 1 && empresa && !cambiandoEmpresa && (
              <p className="rounded-xl bg-zinc-100 px-4 py-3 text-center text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                Ingresando a <strong>{empresas.find((e) => e.id === empresa)?.nombre}</strong>{" "}
                <button type="button" onClick={() => setCambiandoEmpresa(true)} className="ml-1 text-xs underline">
                  Cambiar empresa
                </button>
              </p>
            )}

            {empresas.length > 1 && (!empresa || cambiandoEmpresa) && (
              <div className="space-y-2">
                <label htmlFor="empresa" className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Empresa</label>
                <select
                  id="empresa"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-zinc-200 bg-transparent px-4 py-2 text-sm dark:border-zinc-800"
                >
                  <option value="">Elige tu empresa…</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </div>
            )}


            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Correo Electronico
              </label>
              <input
                type="email"
                className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${errors.email ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black focus:ring-black dark:border-zinc-800 dark:focus:border-white"
                  }`}
                placeholder="nombre@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Contrasena
              </label>
              <input
                type="password"
                className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${errors.password ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black focus:ring-black dark:border-zinc-800 dark:focus:border-white"
                  }`}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-black text-sm font-semibold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              disabled={loading}
            >
              {loading ? "Cargando..." : "Iniciar Sesion"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-zinc-500">
            No tienes una cuenta?{" "}
            <Link href="/register" className="font-semibold text-black hover:underline dark:text-white">
              Registrate aqui
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
