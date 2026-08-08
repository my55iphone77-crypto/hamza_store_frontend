import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Attendance({ inputStyle = {} }) {
  const fullBleedStyle = useFullBleedStyle();
  const contextData = useApp() || {};
  const { 
    token, apiUrl, apiRequest, getAuthHeaders,
    employees = [], setEmployees = () => {},
    attendanceLogs = [], setAttendanceLogs = () => {},
    mails = [], setMails = () => {},
    currentUser = { role: 'admin', name: 'المدير العام' },
    hasPermission = () => true
  } = contextData;

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeLogs = Array.isArray(attendanceLogs) ? attendanceLogs : [];

  const getGlassEmailTemplate = (title, contentHtml) => `
    <div style="font-family: 'Tajawal', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px; direction: rtl; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-top: 0;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.8; color: #cbd5e1;">${contentHtml}</div>
        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b; text-align: center;">
          نظام إدارة الحضور والدوام &bull; ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    </div>
  `;

  const secureApiRequest = useCallback(async (endpoint, method = 'GET', body = null) => {
    if (typeof apiRequest === 'function') return apiRequest(endpoint, method, body);
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await fetch(`${apiUrl || ''}${endpoint}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json().catch(() => ({}));
  }, [apiRequest, getAuthHeaders, apiUrl, token]);

  const fetchAttendanceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [empRes, logsRes] = await Promise.all([
        secureApiRequest('/employees', 'GET').catch(() => null),
        secureApiRequest('/attendance-logs', 'GET').catch(() => null)
      ]);

      if (empRes && typeof setEmployees === 'function') {
        const list = Array.isArray(empRes) ? empRes : (empRes.employees || []);
        setEmployees(list);
      }
      if (logsRes && typeof setAttendanceLogs === 'function') {
        setAttendanceLogs(Array.isArray(logsRes) ? logsRes : (logsRes.logs || []));
      }
    } catch (err) {
      console.error("خطأ في جلب بيانات الحضور:", err?.message || err);
    } finally {
      setIsLoading(false);
    }
  }, [secureApiRequest, setEmployees, setAttendanceLogs]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  const sendInternalMail = async (to, subject, bodyText) => {
    try {
      const response = await secureApiRequest("/mails", "POST", {
        sender: currentUser?.name || "نظام الحضور", recipient: to, subject, body: bodyText, read: false
      });
      const savedMail = response.mail || response || { id: Date.now(), recipient: to, subject, body: bodyText };
      if (typeof setMails === 'function') {
        setMails(prev => [...(Array.isArray(prev) ? prev : []), savedMail]);
      }
    } catch (err) {
      console.error("خطأ في إرسال البريد:", err?.message || err);
    }
  };

  const sendExternalMail = async (to, subject, rawBody) => {
    try {
      const styledBody = getGlassEmailTemplate(subject, `<p>${rawBody}</p>`);
      await secureApiRequest("/sendExternalMail", "POST", { to, subject, body: styledBody });
    } catch (err) {
      console.error("خطأ في إرسال البريد الخارجي:", err?.message || err);
    }
  };

  const handleCheckIn = async (emp) => {
    if (!hasPermission('view_dashboard')) {
      alert('⛔ لا تملك صلاحية تسجيل الحضور.');
      return;
    }
    const empId = emp && (emp._id || emp.id);
    if (!empId) return;
    const checkInTime = new Date().toISOString();

    try {
      await secureApiRequest(`/employees/${encodeURIComponent(empId)}/check-in`, 'POST', { checkIn: checkInTime });
      const formattedTime = new Date(checkInTime).toLocaleString("ar-JO");
      if (typeof setEmployees === 'function') {
        setEmployees(prev => prev.map(item => {
          if ((item._id || item.id) === empId) {
            return { ...item, attendanceStatus: 'حاضر', lastCheckIn: formattedTime };
          }
          return item;
        }));
      }

      const logMessage = `🟢 ${emp.name || 'موظف'} سجّل حضور في ${formattedTime}`;
      const logRes = await secureApiRequest('/attendance-logs', 'POST', { log: logMessage }).catch(() => ({}));
      const savedLog = logRes?.log || logMessage;
      if (typeof setAttendanceLogs === 'function') {
        setAttendanceLogs(prev => [savedLog, ...(Array.isArray(prev) ? prev : [])]);
      }

      await sendInternalMail("manager@company.com", "🟢 تسجيل حضور", `تم تسجيل حضور ${emp.name || ''} في ${formattedTime}`);
      if (emp.email) {
        await sendExternalMail(emp.email, "🟢 تأكيد الحضور", `أهلاً ${emp.name}، تم تسجيل حضورك في ${formattedTime}.`);
      }
      setStatusMessage(`✅ تم تسجيل حضور ${emp.name} بنجاح.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error("خطأ:", err?.message || err);
      alert("فشل تسجيل الحضور.");
    }
  };

  const handleCheckOut = async (emp) => {
    if (!hasPermission('view_dashboard')) {
      alert('⛔ لا تملك صلاحية تسجيل الانصراف.');
      return;
    }
    const empId = emp && (emp._id || emp.id);
    if (!empId) return;
    const checkOutTime = new Date().toISOString();

    try {
      await secureApiRequest(`/employees/${encodeURIComponent(empId)}/check-out`, 'POST', { checkOut: checkOutTime });
      const formattedTime = new Date(checkOutTime).toLocaleString("ar-JO");
      if (typeof setEmployees === 'function') {
        setEmployees(prev => prev.map(item => {
          if ((item._id || item.id) === empId) {
            return { ...item, attendanceStatus: 'غادر', lastCheckOut: formattedTime };
          }
          return item;
        }));
      }

      const logMessage = `🔴 ${emp.name || 'موظف'} سجّل انصراف في ${formattedTime}`;
      const logRes = await secureApiRequest('/attendance-logs', 'POST', { log: logMessage }).catch(() => ({}));
      const savedLog = logRes?.log || logMessage;
      if (typeof setAttendanceLogs === 'function') {
        setAttendanceLogs(prev => [savedLog, ...(Array.isArray(prev) ? prev : [])]);
      }

      await sendInternalMail("manager@company.com", "🔴 تسجيل انصراف", `تم تسجيل انصراف ${emp.name || ''} في ${formattedTime}`);
      if (emp.email) {
        await sendExternalMail(emp.email, "🔴 تأكيد الانصراف", `أهلاً ${emp.name}، تم تسجيل انصرافك في ${formattedTime}.`);
      }
      setStatusMessage(`✅ تم تسجيل انصراف ${emp.name} بنجاح.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error("خطأ:", err?.message || err);
      alert("فشل تسجيل الانصراف.");
    }
  };

  const totalEmployees = safeEmployees.length;
  const presentCount = safeEmployees.filter((e) => e && e.attendanceStatus === "حاضر").length;
  const leftCount = safeEmployees.filter((e) => e && e.attendanceStatus === "غادر").length;

  const exportCSV = () => {
    try {
      const header = "ID,Name,AttendanceStatus,CheckIn,CheckOut\n";
      const rows = safeEmployees
        .filter(e => e)
        .map((e) => `${e._id || e.id || ''},${String(e.name || '').replace(/,/g, '')},${String(e.attendanceStatus || '').replace(/,/g, '')},${String(e.lastCheckIn || '').replace(/,/g, '')},${String(e.lastCheckOut || '').replace(/,/g, '')}`)
        .join("\n");
      const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `attendance_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("خطأ في التصدير:", err);
    }
  };

  const exportPDF = () => {
    try {
      const printContent = safeEmployees
        .filter(e => e)
        .map((e) => `👤 ${e.name || ''} | 📌 ${e.attendanceStatus || "غير محدد"} | 🟢 دخول: ${e.lastCheckIn || "-"} | 🔴 خروج: ${e.lastCheckOut || "-"}`)
        .join("\n");
      const newWindow = window.open("", "_blank");
      if (newWindow) {
        newWindow.document.write("<pre style='font-family: Tajawal, sans-serif; padding: 20px; direction: rtl;'>" + printContent + "</pre>");
        newWindow.document.close();
        newWindow.print();
      }
    } catch (err) {
      console.error("خطأ في التصدير:", err);
    }
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #0b0f19 0%, #111827 100%)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "30px", color: "#fff", fontFamily: "Tajawal, sans-serif", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)", ...fullBleedStyle }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, color: "#10b981", fontSize: '20px', fontWeight: 'bold' }}>
            📋 سجل الحضور والدوام المركزي
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>إدارة الحضور مع إشعارات البريد الزجاجي</p>
        </div>
        <button type="button" onClick={fetchAttendanceData} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
          تحديث 🔄
        </button>
      </div>

      {statusMessage && (
        <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', color: '#10b981' }}>
          {statusMessage}
        </div>
      )}

      {isLoading ? (
        <p style={{ color: "#38bdf8", textAlign: "center", padding: "25px" }}>جاري المزامنة...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {safeEmployees.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px" }}>لا توجد بيانات للموظفين</p>
          ) : (
            safeEmployees.map((emp, index) => {
              if (!emp) return null;
              const empId = emp._id || emp.id || index;
              return (
                <div key={empId} style={{ background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "14px", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div>
                    <p style={{ margin: '0 0 6px 0', fontSize: '15px' }}>👤 الاسم: <strong style={{ color: '#38bdf8' }}>{emp.name || "غير محدد"}</strong></p>
                    <p style={{ margin: '0 0 6px 0', fontSize: '13px' }}>📌 الحالة: <span style={{ color: emp.attendanceStatus === 'حاضر' ? '#10b981' : emp.attendanceStatus === 'غادر' ? '#ef4444' : '#facc15', fontWeight: 'bold' }}>{emp.attendanceStatus || "غير محدد"}</span></p>
                    {emp.lastCheckIn && <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: '#94a3b8' }}>🟢 دخول: {emp.lastCheckIn}</p>}
                    {emp.lastCheckOut && <p style={{ margin: '0', fontSize: '12px', color: '#94a3b8' }}>🔴 خروج: {emp.lastCheckOut}</p>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => handleCheckIn(emp)} style={{ background: "#10b981", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: '13px' }}>
                      🟢 حضور
                    </button>
                    <button type="button" onClick={() => handleCheckOut(emp)} style={{ background: "#ef4444", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: '13px' }}>
                      🔴 انصراف
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div style={{ marginTop: "20px", background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#38bdf8', fontSize: '15px' }}>📈 إحصائيات الحضور</h4>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '14px' }}>
          <p style={{ margin: '4px 0' }}>👥 الكلي: <strong>{totalEmployees}</strong></p>
          <p style={{ margin: '4px 0', color: '#10b981' }}>🟢 الحاضرون: <strong>{presentCount}</strong></p>
          <p style={{ margin: '4px 0', color: '#ef4444' }}>🔴 المغادرون: <strong>{leftCount}</strong></p>
          <p style={{ margin: '4px 0', color: '#facc15' }}>⏳ غير محدد: <strong>{totalEmployees - presentCount - leftCount}</strong></p>
        </div>
      </div>

      <div style={{ marginTop: "15px", background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#facc15', fontSize: '15px' }}>📜 سجل الأحداث</h4>
        {safeLogs.length === 0 ? (
          <p style={{ color: "#9ca3af", margin: 0, fontSize: '13px' }}>لا يوجد أحداث مسجلة</p>
        ) : (
          <ul style={{ margin: 0, paddingRight: '20px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>
            {safeLogs.slice(0, 15).map((log, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>{typeof log === 'string' ? log : (log.log || JSON.stringify(log))}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={exportCSV} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: '13px' }}>
          📤 تصدير CSV
        </button>
        <button type="button" onClick={exportPDF} style={{ background: "#f97316", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: '13px' }}>
          📄 طباعة / PDF
        </button>
      </div>
    </div>
  );
}

export default Attendance;