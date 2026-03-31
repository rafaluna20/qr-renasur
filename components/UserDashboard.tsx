import React, { useState, useMemo, useEffect } from "react";
import { useGeolocation } from "@/hooks";
import QRScannerModal from "@/components/QRScannerModal";
import Link from "next/link";
import { toast } from "sonner";

function formatHoursMinutes(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}h: ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Converts an Odoo UTC datetime string ("YYYY-MM-DD HH:MM:SS") to a Lima
 * timezone display string ("HH:MM"). Odoo always stores in UTC.
 */
function odooToLimaTime(odooDatetime: string | undefined | null): string {
  if (!odooDatetime) return '--:--';
  // Odoo returns "YYYY-MM-DD HH:MM:SS" without timezone — it is UTC.
  // Replace space with 'T' and append 'Z' so JS parses it as UTC.
  const utcDate = new Date(odooDatetime.replace(' ', 'T') + 'Z');
  return utcDate.toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Converts an Odoo UTC datetime string to a Lima-timezone Date object.
 * Use this wherever you need to compare or group dates.
 */
function odooToLimaDate(odooDatetime: string): Date {
  return new Date(new Date(odooDatetime.replace(' ', 'T') + 'Z').toLocaleString('en-US', { timeZone: 'America/Lima' }));
}

export default function UserDashboard({ userName, userImage, userRole, onNavigateToTasks, onLogout }: any) {
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [attendanceRecord, setAttendanceRecord] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [attendanceView, setAttendanceView] = useState<"day" | "week">("day");
  const [cuadernoStats, setCuadernoStats] = useState<{ total: number; pending: number; approved: number; rejected: number; draft: number } | null>(null);
  const [cuadernoAsientos, setCuadernoAsientos] = useState<any[]>([]);
  const [cuadernoOpen, setCuadernoOpen] = useState(false);
  const [cuadernoFilter, setCuadernoFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Modal actions (Supervisor)
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'resolve'>('approve');
  const [actionAsientoId, setActionAsientoId] = useState<number | null>(null);
  const [actionObservacion, setActionObservacion] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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

        // Get today's date string in Lima timezone (Odoo stores UTC)
        const todayPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD

        // Convert each record's UTC check_in to Lima local date before comparing
        const todayRecord = data.data.result.find((r: any) => {
          const limaDate = odooToLimaDate(r.check_in);
          return limaDate.toLocaleDateString('en-CA') === todayPeru;
        });
        setAttendanceRecord(todayRecord || null);

        console.log('Registro de hoy (Lima):', {
          fechaPeru: todayPeru,
          registros: data.data.result.length,
          hayRegistroHoy: !!todayRecord,
        });
      } else {
        setAttendanceHistory([]);
        setAttendanceRecord(null);
      }
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
    }
  };

  const fetchCuadernoStats = async () => {
    try {
      const savedEID = localStorage.getItem('userID');
      const savedRole = localStorage.getItem('userRole');
      if (!savedEID) return;
      const response = await fetch('/api/cuaderno/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: savedEID, role: savedRole }),
      });
      const data = await response.json();
      if (response.ok && data.data) {
        setCuadernoStats(data.data.stats);
        setCuadernoAsientos(data.data.asientos);
      }
    } catch (e) {
      console.error('Error fetching cuaderno stats', e);
    }
  };

  const handleApproveReject = async () => {
    if (!actionAsientoId) return;

    if ((actionType === 'reject' || actionType === 'resolve') && !actionObservacion.trim()) {
      toast.warning("Debe escribir un motivo o comentario.");
      return;
    }

    setActionLoading(true);
    try {
      let endpoint = '';
      if (actionType === 'approve') endpoint = '/api/cuaderno/approve';
      else if (actionType === 'reject') endpoint = '/api/cuaderno/reject';
      else if (actionType === 'resolve') endpoint = '/api/cuaderno/resolve';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionAsientoId,
          observacion: actionObservacion
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchCuadernoStats();
        setActionModalOpen(false);
        setActionObservacion('');
      } else {
        toast.error("Error: " + data.error);
      }
    } catch (e) {
      toast.error("Error de conexión al guardar la accion.");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceSummary();
    if (userRole === 'resident' || userRole === 'supervisor') {
      fetchCuadernoStats();
    }
  }, [userRole]);

  const executeAssistance = async () => {
    try {
      setStatus({ type: 'loading', message: 'Obteniendo ubicaciÃ³n...' });

      // Obtener ubicaciÃ³n GPS
      const coords = await getLocation();

      if (!coords) {
        // Si hay error de geolocalizaciÃ³n, mostrar advertencia pero continuar
        console.warn('No se pudo obtener ubicaciÃ³n:', geoError);
        setStatus({ type: 'loading', message: 'Procesando sin ubicaciÃ³n...' });
      } else {
        setStatus({ type: 'loading', message: 'Procesando...' });
      }

      const savedEIDRaw = localStorage.getItem("userID");

      if (savedEIDRaw === null) {
        throw new Error("userID no existe en localStorage");
      }

      const savedEID = Number(savedEIDRaw);

      if (isNaN(savedEID)) {
        throw new Error("userID no es un nÃºmero vÃ¡lido");
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

      // Preparar datos de ubicaciÃ³n si estÃ¡n disponibles
      const locationData = coords ? {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      } : {};

      if (data.data.result) {
        if (data.data.result.length === 0) {
          const responseIn = await fetch('/api/assistance/in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: savedEID, ...locationData }),
          });

          let dataIn;
          const textIn = await responseIn.text();
          try { dataIn = JSON.parse(textIn); } catch (e) { dataIn = null; }

          if (!responseIn.ok) {
            throw new Error(dataIn?.error || `Error del servidor (${responseIn.status}): ${textIn.slice(0, 100)}`);
          }

          const locationMsg = coords ? ` (UbicaciÃ³n: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` : ' (Sin ubicaciÃ³n)';
          setStatus({ type: 'success', message: `Â¡Entrada registrada a las ${timeStr}!${locationMsg}` });
        } else {
          const lastRegistry = data.data.result[0];
          if (!lastRegistry.check_out) {
            const responseOut = await fetch('/api/assistance/out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ registryId: lastRegistry.id, ...locationData }),
            });

            let dataOut;
            const textOut = await responseOut.text();
            try { dataOut = JSON.parse(textOut); } catch (e) { dataOut = null; }

            if (!responseOut.ok) {
              throw new Error(dataOut?.error || `Error del servidor (${responseOut.status}): ${textOut.slice(0, 100)}`);
            }
            console.log("Salida registrada:", dataOut);
            const locationMsg = coords ? ` (UbicaciÃ³n: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` : ' (Sin ubicaciÃ³n)';
            setStatus({ type: 'success', message: `Â¡Salida registrada a las ${timeStr}!${locationMsg}` });
          } else {
            const responseIn = await fetch('/api/assistance/in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: savedEID, ...locationData }),
            });

            let dataIn;
            const textIn = await responseIn.text();
            try { dataIn = JSON.parse(textIn); } catch (e) { dataIn = null; }

            if (!responseIn.ok) {
              throw new Error(dataIn?.error || `Error del servidor (${responseIn.status}): ${textIn.slice(0, 100)}`);
            }
            console.log("Nueva entrada registrada:", dataIn);
            const locationMsg = coords ? ` (UbicaciÃ³n: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` : ' (Sin ubicaciÃ³n)';
            setStatus({ type: 'success', message: `Â¡Entrada registrada a las ${timeStr}!${locationMsg}` });
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
        // Es un QR de proyecto vÃ¡lido
        setShowQRScanner(false);
        executeAssistance();
      } else {
        toast.error("El cÃ³digo QR no es vÃ¡lido para asistencia.");
        setShowQRScanner(false);
      }
    } catch (e) {
      toast.error("El cÃ³digo QR escaneado no es vÃ¡lido.");
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
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            {userRole === 'resident' ? 'Residente' : userRole === 'supervisor' ? 'Supervisor' : userRole === 'admin' ? 'Admin' : 'Personal Obra'}
          </span>
        </div>
      </div>

      {/* Unified Attendance Card - Propuesta B */}
      <div
        className={`rounded-[30px] border shadow-sm transition-all overflow-hidden ${status.type === 'error'
          ? 'border-red-200 dark:border-red-800'
          : status.type === 'success'
            ? 'border-green-200 dark:border-green-800'
            : 'border-zinc-100 dark:border-white/5'
          }`}
      >
        {/* BIG CTA - full-width scanner button */}
        <button
          onClick={() => setShowQRScanner(true)}
          disabled={status.type === 'loading'}
          className={`group relative w-full overflow-hidden p-8 text-left transition-all ${status.type === 'error'
            ? 'bg-red-50 dark:bg-red-900/10'
            : status.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/10'
              : 'bg-white hover:bg-zinc-50/50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50'
            }`}
        >
          <div className="absolute -right-4 -top-4 opacity-[0.04] transition-transform group-hover:scale-110 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={status.type === 'success' ? 'text-green-500' : status.type === 'error' ? 'text-red-500' : 'text-blue-600'}><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /></svg>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <div className={`absolute inset-0 blur-2xl opacity-20 ${status.type === 'success' ? 'bg-green-500' : status.type === 'error' ? 'bg-red-500' : 'bg-blue-600'}`} />
              <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg transition-colors ${status.type === 'success' ? 'bg-green-500 text-white shadow-green-500/40'
                : status.type === 'error' ? 'bg-red-500 text-white shadow-red-500/40'
                  : 'bg-blue-600 text-white shadow-blue-500/40'
                }`}>
                {status.type === 'loading' ? (
                  <svg className="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
              <h3 className={`text-xl font-bold tracking-tight ${status.type === 'error' ? 'text-red-600 dark:text-red-400'
                : status.type === 'success' ? 'text-green-600 dark:text-green-400'
                  : 'text-zinc-900 dark:text-zinc-50'
                }`}>
                {status.type === 'idle' ? 'Marcar Asistencia' : status.message}
              </h3>
              <p className={`text-sm font-medium mt-0.5 ${status.type === 'error' ? 'text-red-500/80 dark:text-red-400/80'
                : status.type === 'success' ? 'text-green-600/80 dark:text-green-400/80'
                  : 'text-zinc-500'
                }`}>
                {status.type === 'idle' ? 'Toca para escanear el QR' : status.type === 'loading' ? 'Conectando...' : status.type === 'success' ? 'Registro exitoso' : 'Intenta nuevamente'}
              </p>
            </div>
          </div>
        </button>

        {/* Summary strip - Entrada / Salida + historial toggle */}
        <div className={`flex items-center border-t px-6 py-3 ${status.type === 'error' ? 'border-red-100 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/5'
          : status.type === 'success' ? 'border-green-100 bg-green-50/50 dark:border-green-900/30 dark:bg-green-900/5'
            : 'border-zinc-100 bg-zinc-50/50 dark:border-white/5 dark:bg-white/[0.02]'
          }`}>
          <div className="flex items-center gap-3 flex-1">
            <div className={`h-2 w-2 rounded-full animate-pulse flex-shrink-0 ${attendanceRecord && !attendanceRecord.check_out ? 'bg-green-500' : attendanceRecord?.check_out ? 'bg-zinc-400' : 'bg-amber-500'}`} />
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-[9px] font-bold text-zinc-400 uppercase">Entrada</p>
                <p className={`text-sm font-extrabold ${attendanceRecord?.check_in ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-300 dark:text-zinc-600'}`}>
                {attendanceRecord?.check_in ? odooToLimaTime(attendanceRecord.check_in) : '--:--'}
                </p>
              </div>
              <div className="h-6 w-[1px] bg-zinc-200 dark:bg-zinc-700" />
              <div className="text-center">
                <p className="text-[9px] font-bold text-zinc-400 uppercase">Salida</p>
                <p className={`text-sm font-extrabold ${attendanceRecord?.check_out ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-300 dark:text-zinc-600'}`}>
                {attendanceRecord?.check_out ? odooToLimaTime(attendanceRecord.check_out) : '--:--'}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[10px] font-bold uppercase text-blue-600 hover:text-blue-700 dark:text-blue-400 flex-shrink-0"
          >
            {showHistory ? 'Ocultar' : 'Historial'}
          </button>
        </div>


        {/* Collapsible History */}
        {showHistory && attendanceHistory.length > 0 && (
          <div className="border-t border-zinc-100 dark:border-white/5 px-6 pb-6 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Registros Recientes</p>
              <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 dark:bg-white/5">
                <button
                  onClick={() => setAttendanceView("day")}
                  className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${attendanceView === "day"
                    ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500"}`}
                >DÃ­a</button>
                <button
                  onClick={() => setAttendanceView("week")}
                  className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${attendanceView === "week"
                    ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500"}`}
                >Semana</button>
              </div>
            </div>
            <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {attendanceView === "day" ? (
                attendanceHistory.map((record: any) => {
                  const checkInDate = odooToLimaDate(record.check_in);
                  return (
                    <div key={record.id} className="flex items-center justify-between rounded-xl bg-zinc-50/50 p-3 dark:bg-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-zinc-500">
                          {checkInDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {odooToLimaTime(record.check_in)} - {record.check_out ? odooToLimaTime(record.check_out) : 'Pendiente'}
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
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">{formatHoursMinutes(totalHours)} Total</p>
                        </div>
                        <div className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                          {records.length} registros
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-zinc-50 dark:divide-white/5">
                      {records.map((record: any) => (
                        <div key={record.id} className="p-2.5 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-medium text-zinc-500">
                              {new Date(record.check_in).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                            </span>
                            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                              {odooToLimaTime(record.check_in)} - {record.check_out ? odooToLimaTime(record.check_out) : 'Pend'}
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
        {showHistory && attendanceHistory.length === 0 && (
          <p className="text-center text-xs text-zinc-400 italic pb-5">Sin registros en el historial</p>
        )}
      </div>

      {/* Unified Cuaderno de Obra Card */}
      {(userRole === 'resident' || userRole === 'supervisor') && (
        <div className="rounded-[30px] border border-blue-100 bg-white p-6 shadow-sm dark:border-blue-900/30 dark:bg-zinc-900">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /><path d="M12 8h4" /><path d="M12 12h4" /></svg>
              </div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Cuaderno de Obra</h4>
            </div>
          </div>

          {/* Stat pills â€” only when data is loaded */}
          {cuadernoStats !== null && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Total', value: cuadernoStats.total, color: 'text-zinc-700 dark:text-zinc-200', bg: 'bg-zinc-50 dark:bg-white/5' },
                { label: 'Pendientes', value: cuadernoStats.pending, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
                { label: 'Aprobados', value: cuadernoStats.approved, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/10' },
                { label: 'Observados', value: cuadernoStats.rejected, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/10' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`flex flex-col items-center rounded-2xl ${bg} py-3`}>
                  <span className={`text-xl font-extrabold ${color}`}>{value}</span>
                  <span className="text-[9px] font-bold uppercase text-zinc-400 mt-0.5">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA â€” Nuevo Asiento */}
          <Link
            href="/cuaderno/nuevo"
            className="group flex items-center justify-between w-full rounded-2xl bg-indigo-500 px-5 py-4 text-white transition-all hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            <span className="font-bold text-sm">Registrar Nuevo Asiento</span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">+ NUEVO</span>
          </Link>

          {/* Ver Historial - below CTA */}
          {cuadernoStats !== null && (
            <button
              onClick={() => setCuadernoOpen(!cuadernoOpen)}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 py-2.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-700 dark:border-white/5 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:bg-white/5"
            >
              {cuadernoOpen ? (
                <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg> Ocultar historial</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg> Ver historial ({cuadernoStats.total})</>
              )}
            </button>
          )}

          {/* Expandable asiento list */}
          {cuadernoOpen && cuadernoStats !== null && (
            <div className="mt-4 border-t border-zinc-50 pt-4 dark:border-white/5">
              <div className="flex items-center rounded-xl bg-zinc-100 p-0.5 dark:bg-white/5 mb-3">
                {([['all', 'Todos'], ['pending', 'Pendientes'], ['approved', 'Aprobados'], ['rejected', 'Observados']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCuadernoFilter(key)}
                    className={`flex-1 rounded-lg px-1.5 py-1 text-[9px] font-bold transition-all ${cuadernoFilter === key
                      ? 'bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white'
                      : 'text-zinc-500'
                      }`}
                  >{label}</button>
                ))}
              </div>
              <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {cuadernoAsientos
                  .filter((a: any) => {
                    if (cuadernoFilter === 'all') return true;
                    if (cuadernoFilter === 'pending') return a.state === 'signed_residente';
                    if (cuadernoFilter === 'approved') return a.state === 'approved';
                    if (cuadernoFilter === 'rejected') return a.state === 'rejected';
                    return true;
                  })
                  .map((asiento: any) => {
                    const stateConfig: Record<string, { label: string; color: string }> = {
                      draft: { label: 'Borrador', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' },
                      signed_residente: { label: 'Pendiente', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
                      approved: { label: 'Aprobado', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
                      rejected: { label: 'Observado', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
                    };
                    const st = stateConfig[asiento.state] || stateConfig.draft;
                    const climaEmoji: Record<string, string> = { soleado: '\u2600\ufe0f', nublado: '\u2601\ufe0f', lluvia_ligera: '\ud83c\udf26\ufe0f', lluvia_fuerte: '\ud83c\udf27\ufe0f' };
                    return (
                      <div key={asiento.id} className="rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-white/5">
                        <div className="flex items-center justify-between p-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{asiento.name}</span>
                            <span className="text-[10px] text-zinc-500">{asiento.date} {climaEmoji[asiento.clima] || ''}</span>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${st.color}`}>{st.label}</span>
                        </div>
                        {asiento.observacion && (
                          <div className="px-3 pb-3">
                            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[10px] ${asiento.state === 'rejected'
                              ? 'bg-red-50 dark:bg-red-900/20'
                              : 'bg-green-50 dark:bg-green-900/20'
                              }`}>
                              <svg className={`mt-0.5 flex-shrink-0 ${asiento.state === 'rejected' ? 'text-red-500' : 'text-green-600'}`} xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                              <div>
                                <span className={`font-bold block mb-0.5 ${asiento.state === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                  {asiento.state === 'rejected' ? 'Motivo de observacion' : 'Comentario del supervisor'}
                                </span>
                                <span className={`leading-snug ${asiento.state === 'rejected' ? 'text-red-700 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>
                                  {asiento.observacion}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        {(userRole === 'supervisor' || userRole === 'admin') && asiento.state === 'signed_residente' && (
                          <div className="flex gap-2 p-3 pt-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionAsientoId(asiento.id);
                                setActionType('approve');
                                setActionObservacion('');
                                setActionModalOpen(true);
                              }}
                              className="flex-1 rounded-lg bg-green-500 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-600"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionAsientoId(asiento.id);
                                setActionType('reject');
                                setActionObservacion('');
                                setActionModalOpen(true);
                              }}
                              className="flex-1 rounded-lg bg-red-100 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-200"
                            >
                              Observar
                            </button>
                          </div>
                        )}
                        {(userRole === 'resident' || userRole === 'admin') && asiento.state === 'rejected' && (
                          <div className="flex gap-2 p-3 pt-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionAsientoId(asiento.id);
                                setActionType('resolve');
                                setActionModalOpen(true);
                              }}
                              className="flex-1 rounded-xl bg-blue-500 py-2.5 text-xs font-bold text-white transition-all hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 active:scale-[0.98]"
                            >
                              Subsanar Observación
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                {cuadernoAsientos.filter((a: any) => {
                  if (cuadernoFilter === 'all') return true;
                  if (cuadernoFilter === 'pending') return a.state === 'signed_residente';
                  if (cuadernoFilter === 'approved') return a.state === 'approved';
                  if (cuadernoFilter === 'rejected') return a.state === 'rejected';
                  return true;
                }).length === 0 && (
                    <p className="text-center text-xs text-zinc-400 italic py-4">Sin asientos en esta categoría</p>
                  )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Modal (Approve/Reject) */}
      {actionModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-[30px] bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-100 dark:border-white/5">
            <h3 className={`text-xl font-bold ${actionType === 'reject' ? 'text-red-500' : actionType === 'resolve' ? 'text-blue-500' : 'text-green-500'}`}>
              {actionType === 'approve' ? 'Aprobar Asiento' : actionType === 'resolve' ? 'Subsanar Observación' : 'Observar Asiento'}
            </h3>
            <p className="mt-2 text-sm text-zinc-500">
              {actionType === 'approve'
                ? 'El asiento cambiará al estado "Aprobado". Puedes dejar un comentario opcional.'
                : actionType === 'resolve'
                  ? 'Firma para subsanar la observación y devolver el asiento a revisión.'
                  : 'El asiento cambiará al estado "Rechazado". Debes ingresar el motivo de forma obligatoria.'}
            </p>

            <textarea
              className="mt-4 w-full rounded-2xl border-0 bg-zinc-50 p-4 text-sm focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-400"
              placeholder={actionType === 'approve' ? 'Comentario (opcional)...' : actionType === 'resolve' ? 'Detalle de validación o subsanación...' : 'Motivo de observación (requerido)...'}
              rows={4}
              value={actionObservacion}
              onChange={(e) => setActionObservacion(e.target.value)}
            />

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setActionModalOpen(false)}
                className="flex-1 rounded-2xl bg-zinc-100 py-3 text-sm font-bold text-zinc-500 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10"
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button
                onClick={handleApproveReject}
                className={`flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-colors flex justify-center items-center ${actionType === 'approve'
                  ? 'bg-green-500 hover:bg-green-600'
                  : actionType === 'resolve'
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : 'bg-red-500 hover:bg-red-600'
                  }`}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  'Confirmar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </div>
          <h4 className="text-lg font-bold text-zinc-400">Metrados</h4>
          <p className="text-xs text-zinc-400">Avance en campo</p>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Terra Lima â€¢ TerraField App</p>
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
