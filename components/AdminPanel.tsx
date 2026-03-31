import React from 'react';
import { Field } from "@/components/ui/Field";

export default function AdminPanel({
  adminMode,
  setAdminMode,
  handleSubmit,
  formData,
  errors,
  handleChange,
  isValid,
  isSubmitted,
  handleDownload,
  URL_PUBLIC
}: any) {
  return (
    <div className="grid gap-6">
      {/* Tabs modo admin */}
      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
        <button
          type="button"
          onClick={() => setAdminMode("proyecto")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${adminMode === "proyecto" ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
            }`}
        >
          ðŸ“‹ Proyecto / Tarea
        </button>
        <button
          type="button"
          onClick={() => setAdminMode("asistencia")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${adminMode === "asistencia" ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
            }`}
        >
          ðŸ•  Asistencia
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
            {isSubmitted ? "Â¡CÃ³digo Generado!" : "Generar QR de Proyecto"}
          </button>
        </form>
      ) : (
        <div className="grid gap-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">ðŸ•  QR de Asistencia</p>
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
            â¬‡ï¸  Descargar QR de Asistencia
          </button>
        </div>
      )}
    </div>
  );
}
