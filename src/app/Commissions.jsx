import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

// دالة حماية لمنع ثغرات XSS
const escapeHTML = (str) => {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') return String(str);
  return str.replace(/[&<>'"]/g, (tag) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
};

// دالة حماية CSV
const escapeCSV = (str) => {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') str = String(str);
  if (/^[=+\-@]/.test(str)) return `'${str}`;
  return str.replace(/"/g, '""');
};

function canManageCommissions(role) {
  return ["admin", "manager"].includes(role);
}

function Commissions({
  commissions: externalCommissions,
  setCommissions: externalSetCommissions = () => {},
  inputStyle = {},
  employees = [],
  setMails = () => {}
}) {
  const fullBleedStyle = useFullBleedStyle();
  const {
    token,
    apiUrl,
    apiRequest,
    commissions: contextCommissions = [],
    setCommissions: setContextCommissions,
    employees: contextEmployees = [],
    socket
  } = useApp() || {};

  const [internalCommissions, setInternalCommissions] = useState([]);
  const [apiEmployees, setApiEmployees] = useState([]);
  const [amount, setAmount] = useState("");
  const [employee, setEmployee] = useState("");
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mailStatus, setMailStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [showStats, setShowStats] = useState(true);
  const [dateFilter, setDateFilter] = useState("all"); // all | today | week | month

  const activeEmployees = employees.length > 0
    ? employees
    : (contextEmployees.length > 0 ? contextEmployees : apiEmployees);

  const rawCommissions = externalCommissions !== undefined && externalCommissions.length > 0
    ? externalCommissions
    : (contextCommissions.length > 0 ? contextCommissions : internalCommissions);

  const safeCommissions = rawCommissions || [];
  const safeLogs = logs || [];

  const currentUser = { role: "admin", name: "المدير" }; // fallback - will be overridden by context if available

  const updateCommissions = (newList) => {
    setInternalCommissions(newList);
    if (externalSetCommissions && typeof externalSetCommissions === 'function') {
      externalSetCommissions(newList);
    }
    if (setContextCommissions && typeof setContextCommissions === 'function') {
      setContextCommissions(newList);
    }
  };

  // 🔄 جلب البيانات الأساسية من السيرفر
  const fetchServerData = useCallback(async () => {
    if (!apiRequest) return;
    setIsLoading(true);
    try {
      const [commRes, empRes, logsRes] = await Promise.all([
        apiRequest('/commissions', 'GET').catch(() => null),
        apiRequest('/employees', 'GET').catch(() => null),
        apiRequest('/commissions-logs', 'GET').catch(() => null)
      ]);

      if (commRes) updateCommissions(Array.isArray(commRes) ? commRes : (commRes.commissions || []));
      if (empRes) setApiEmployees(Array.isArray(empRes) ? empRes : (empRes.employees || []));
      if (logsRes) setLogs(Array.isArray(logsRes) ? logsRes : (logsRes.logs || []));
    } catch (err) {
      console.error("Error fetching commissions data from server:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    fetchServerData();
  }, [apiUrl, token]);

  // ⚡ تفعيل المزامنة اللحظية عبر Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleCommissionUpdate = (updatedCommissions) => {
      if (Array.isArray(updatedCommissions)) {
        updateCommissions(updatedCommissions);
      } else {
        fetchServerData();
      }
    };

    const handleLogUpdate = (newLog) => {
      if (newLog) {
        setLogs(prev => [...prev, newLog]);
      }
    };

    socket.on('COMMISSIONS_UPDATED', handleCommissionUpdate);
    socket.on('COMMISSION_LOG_ADDED', handleLogUpdate);

    return () => {
      socket.off('COMMISSIONS_UPDATED', handleCommissionUpdate);
      socket.off('COMMISSION_LOG_ADDED', handleLogUpdate);
    };
  }, [socket]);

  // 📧 إرسال إيميل حقيقي
  const sendRealEmailNotification = async (recipientEmail, subject, htmlContent) => {
    if (!apiRequest) return;
    try {
      setMailStatus("جاري إرسال البريد الإلكتروني الفعلي...");
      const res = await apiRequest("/mails/send-real", "POST", { to: recipientEmail, subject, html: htmlContent });
      if (res && res.success) {
        setMailStatus("✅ تم إرسال الإيميل الحقيقي بنجاح!");
      } else {
        setMailStatus("⚠️ تم حفظ البيانات ولكن تعذر إرسال البريد الإلكتروني الفعلي.");
      }
    } catch (err) {
      console.error("Real email send error:", err);
      setMailStatus("❌ فشل في إرسال الإيميل الحقيقي.");
    } finally {
      setTimeout(() => setMailStatus(""), 4000);
    }
  };

  // ─── إضافة عمولة ───
  const addCommission = async (e) => {
    e.preventDefault();

    const parsedAmount = parseFloat(amount);
    if (!employee || isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("الرجاء اختيار موظف وإدخال مبلغ عمولة صحيح وأكبر من الصفر.");
      return;
    }
    if (!apiRequest) return;

    const cleanEmployeeName = String(employee).trim();
    const newCommission = {
      id: 'comm_' + Date.now(),
      employee: cleanEmployeeName,
      amount: parsedAmount,
      notes: notes.trim(),
      date: new Date().toISOString(),
      status: 'pending',
      createdBy: currentUser?.name || 'النظام'
    };

    try {
      const response = await apiRequest('/commissions', 'POST', newCommission);
      const savedCommission = response || newCommission;

      updateCommissions([...safeCommissions, savedCommission]);

      const logMsg = `💰 تمت إضافة عمولة ${parsedAmount} دينار للموظف ${cleanEmployeeName} بتاريخ ${new Date().toLocaleString("ar-JO")}`;
      const logRes = await apiRequest('/commissions-logs', 'POST', { log: logMsg });
      const savedLog = logRes?.log || logMsg;
      setLogs(prev => [...prev, savedLog]);

      const emailHtmlBody = `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 30px; color: #ffffff; direction: rtl; text-align: right; border-radius: 12px;">
          <div style="background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); padding: 25px; border-radius: 12px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);">
            <h2 style="color: #f97316; margin-top: 0;">💰 إشعار عمولة جديدة</h2>
            <p style="font-size: 16px; color: #cbd5e1;">تم تسجيل عمولة مالية جديدة في النظام:</p>
            <ul style="list-style: none; padding: 0; line-height: 2;">
              <li>👤 <strong>الموظف:</strong> ${cleanEmployeeName}</li>
              <li>💰 <strong>قيمة العمولة:</strong> <span style="color: #10b981; font-weight: bold;">${parsedAmount} دينار</span></li>
              ${notes ? `<li>📝 <strong>ملاحظات:</strong> ${notes}</li>` : ''}
              <li>📅 <strong>التاريخ:</strong> ${new Date().toLocaleString("ar-JO")}</li>
            </ul>
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">نظام إدارة الشركة الموحد - Hamza Store System</p>
          </div>
        </div>
      `;

      await sendRealEmailNotification("manager@company.com", "💰 إشعار عمولة جديدة - نظام الإدارة", emailHtmlBody);

      setAmount("");
      setEmployee("");
      setNotes("");
    } catch (err) {
      console.error("Error saving commission to server:", err);
      alert("فشل في حفظ العمولة، يرجى المحاولة لاحقاً.");
    }
  };

  // ─── حذف عمولة ───
  const handleDeleteCommission = async (id, empName, amount) => {
    if (!canManageCommissions(currentUser?.role)) {
      alert("❌ لا تملك صلاحية حذف العمولات.");
      return;
    }
    if (!id || !window.confirm(`هل أنت متأكد من حذف عمولة ${amount} دينار للموظف ${empName}؟`)) return;

    try {
      await apiRequest(`/commissions/${id}`, 'DELETE');
      const updatedList = safeCommissions.filter(c => c?.id !== id);
      updateCommissions(updatedList);

      const logMsg = `🗑️ تم حذف عمولة ${amount} دينار للموظف ${empName}`;
      await apiRequest('/commissions-logs', 'POST', { log: logMsg });
      setLogs(prev => [...prev, logMsg]);
    } catch (err) {
      console.error("Error deleting commission:", err);
      alert("فشل في حذف العمولة.");
    }
  };

  // ─── بدء تعديل ───
  const startEdit = (comm) => {
    if (!canManageCommissions(currentUser?.role)) {
      alert("❌ لا تملك صلاحية تعديل العمولات.");
      return;
    }
    setEditingId(comm.id);
    setEditAmount(comm.amount);
    setEditNotes(comm.notes || "");
  };

  // ─── حفظ التعديل ───
  const saveEdit = async () => {
    if (!apiRequest || !editingId) return;
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("الرجاء إدخال مبلغ صحيح");
      return;
    }

    try {
      const commToUpdate = safeCommissions.find(c => c?.id === editingId);
      if (!commToUpdate) return;

      const updated = { ...commToUpdate, amount: parsedAmount, notes: editNotes.trim(), lastModified: new Date().toISOString() };
      await apiRequest(`/commissions/${editingId}`, 'PUT', updated);

      const updatedList = safeCommissions.map(c => c?.id === editingId ? updated : c);
      updateCommissions(updatedList);

      const logMsg = `✏️ تم تعديل عمولة ${commToUpdate.employee} إلى ${parsedAmount} دينار`;
      await apiRequest('/commissions-logs', 'POST', { log: logMsg });
      setLogs(prev => [...prev, logMsg]);

      setEditingId(null);
      setEditAmount("");
      setEditNotes("");
    } catch (err) {
      console.error("Error updating commission:", err);
      alert("فشل في تحديث العمولة.");
    }
  };

  // ─── إلغاء التعديل ───
  const cancelEdit = () => {
    setEditingId(null);
    setEditAmount("");
    setEditNotes("");
  };

  // ─── تغيير الحالة ───
  const toggleStatus = async (id) => {
    if (!apiRequest || !id) return;
    const comm = safeCommissions.find(c => c?.id === id);
    if (!comm) return;

    const newStatus = comm.status === 'paid' ? 'pending' : 'paid';
    try {
      const updated = { ...comm, status: newStatus };
      await apiRequest(`/commissions/${id}`, 'PUT', updated);
      const updatedList = safeCommissions.map(c => c?.id === id ? updated : c);
      updateCommissions(updatedList);
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  // ─── تصدير CSV ───
  const exportCSV = () => {
    const header = "ID,Employee,Amount,Status,Notes,Date\n";
    const rows = safeCommissions.filter(c => c).map((c) => {
      return `${escapeCSV(String(c.id || ''))},${escapeCSV(String(c.employee || ''))},${Number(c.amount) || 0},${c.status || 'pending'},${escapeCSV(String(c.notes || ''))},${escapeCSV(c.date ? new Date(c.date).toLocaleString("ar-JO") : '')}`;
    }).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `commissions_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  // ─── تصدير PDF ───
  const exportPDF = () => {
    const rows = safeCommissions.filter(c => c).map((c) => {
      const statusColor = c.status === 'paid' ? '#10b981' : '#f59e0b';
      const statusLabel = c.status === 'paid' ? '✅ مدفوع' : '⏳ معلق';
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
        <td style="padding:10px;">${escapeHTML(String(c.employee || ''))}</td>
        <td style="padding:10px;color:#10b981;font-weight:bold;">${Number(c.amount) || 0} دينار</td>
        <td style="padding:10px;color:${statusColor};">${statusLabel}</td>
        <td style="padding:10px;">${escapeHTML(String(c.notes || ''))}</td>
        <td style="padding:10px;">${c.date ? new Date(c.date).toLocaleString("ar-JO") : ''}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl"><head><title>تقرير العمولات</title>
      <style>body{font-family:Tajawal,Arial,sans-serif;background:#0f172a;color:#fff;padding:20px;}
      table{width:100%;border-collapse:collapse;}th{background:rgba(30,64,175,0.6);padding:12px;}
      h1{color:#f97316;text-align:center;}</style></head><body>
      <h1>💰 تقرير العمولات</h1>
      <p style="text-align:center;color:#94a3b8;">تاريخ التقرير: ${new Date().toLocaleString('ar-JO')}</p>
      <table><thead><tr><th>الموظف</th><th>المبلغ</th><th>الحالة</th><th>ملاحظات</th><th>التاريخ</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.print();</script></body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  // ─── الإحصائيات ───
  const stats = useMemo(() => {
    const total = safeCommissions.reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
    const paid = safeCommissions.filter(c => c?.status === 'paid').reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
    const pending = total - paid;
    const count = safeCommissions.length;
    return { total, paid, pending, count };
  }, [safeCommissions]);

  // ─── فلترة ───
  const filteredCommissions = safeCommissions.filter(c => {
    if (!c) return false;
    const s = (searchTerm || "").toLowerCase();
    const matchesSearch = (c.employee || "").toLowerCase().includes(s) ||
                          (c.notes || "").toLowerCase().includes(s);
    if (!matchesSearch) return false;

    if (dateFilter === "all") return true;
    const commDate = c.date ? new Date(c.date) : null;
    if (!commDate) return false;
    const now = new Date();
    if (dateFilter === "today") return commDate.toDateString() === now.toDateString();
    if (dateFilter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return commDate >= weekAgo;
    }
    if (dateFilter === "month") {
      return commDate.getMonth() === now.getMonth() && commDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // ═══════════════════════════════════════════════════════════════
  // STYLES (Glassmorphism)
  // ═══════════════════════════════════════════════════════════════
  const glassContainerStyle = {
    ...fullBleedStyle,
    background: 'rgba(11, 15, 25, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    padding: '30px',
    color: '#f8fafc',
    fontFamily: 'Tajawal, sans-serif',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '15px',
    flexWrap: 'wrap',
    gap: '15px'
  };

  const glassCardStyle = {
    background: 'rgba(17, 24, 39, 0.65)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
  };

  const glassInputStyle = {
    background: 'rgba(17, 24, 39, 0.6)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '11px 14px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease'
  };

  const statCardStyle = {
    background: 'rgba(17, 24, 39, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    padding: '20px',
    textAlign: 'center',
    minWidth: '140px'
  };

  const btnPrimary = {
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
  };

  const btnSecondary = {
    background: 'rgba(59, 130, 246, 0.8)', color: '#fff', border: '1px solid rgba(59, 130, 246, 0.4)',
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
    fontSize: '12px', backdropFilter: 'blur(4px)'
  };

  const btnDanger = {
    background: 'rgba(239, 68, 68, 0.8)', color: '#fff', border: '1px solid rgba(239, 68, 68, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  const btnSuccess = {
    background: 'rgba(16, 185, 129, 0.8)', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  return (
    <div style={glassContainerStyle} dir="rtl">
      {/* ─── الرأس ─── */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f97316', fontSize: '22px', fontWeight: 'bold' }}>
            💰 إدارة العمولات والحوافز
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
            تتبع ومتابعة العمولات المالية للموظفين مع الإشعارات والتقارير
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {mailStatus && (
            <span style={{ fontSize: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              {mailStatus}
            </span>
          )}
          <button type="button" onClick={fetchServerData} disabled={isLoading} style={{ ...btnSecondary, opacity: isLoading ? 0.6 : 1 }}>
            {isLoading ? 'جاري التحديث...' : '↻ تحديث'}
          </button>
        </div>
      </div>

      {/* ─── الإحصائيات ─── */}
      {showStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
          <div style={statCardStyle}>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>📊 عدد العمولات</span>
            <h3 style={{ margin: '5px 0 0 0', color: '#38bdf8', fontSize: '22px' }}>{stats.count}</h3>
          </div>
          <div style={statCardStyle}>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>💰 إجمالي المبالغ</span>
            <h3 style={{ margin: '5px 0 0 0', color: '#f97316', fontSize: '22px' }}>{stats.total} دينار</h3>
          </div>
          <div style={statCardStyle}>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>✅ مدفوع</span>
            <h3 style={{ margin: '5px 0 0 0', color: '#10b981', fontSize: '22px' }}>{stats.paid} دينار</h3>
          </div>
          <div style={statCardStyle}>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>⏳ معلق</span>
            <h3 style={{ margin: '5px 0 0 0', color: '#facc15', fontSize: '22px' }}>{stats.pending} دينار</h3>
          </div>
        </div>
      )}

      {/* ─── البحث والفلترة ─── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 ابحث باسم الموظف أو الملاحظات..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ ...glassInputStyle, flex: 1, minWidth: '200px' }}
        />
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ ...glassInputStyle, width: '150px' }}>
          <option value="all" style={{ background: '#111827' }}>🌍 كل الفترات</option>
          <option value="today" style={{ background: '#111827' }}>📅 اليوم</option>
          <option value="week" style={{ background: '#111827' }}>📅 هذا الأسبوع</option>
          <option value="month" style={{ background: '#111827' }}>📅 هذا الشهر</option>
        </select>
        <button type="button" onClick={() => setShowStats(!showStats)} style={btnSecondary}>
          {showStats ? 'إخفاء الإحصائيات' : 'إظهار الإحصائيات'}
        </button>
      </div>

      {/* ─── نموذج الإضافة ─── */}
      <form onSubmit={addCommission} style={{ ...glassCardStyle }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#f97316', fontSize: '16px' }}>➕ تسجيل عمولة جديدة</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <select
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            style={{ ...glassInputStyle, flex: 1, minWidth: '160px' }}
          >
            <option value="" style={{ background: '#111827' }}>👤 اختر الموظف...</option>
            {activeEmployees.map((emp, idx) => (
              <option key={emp.id || idx} value={emp.name} style={{ background: '#111827' }}>
                {emp.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="💰 قيمة العمولة"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ ...glassInputStyle, flex: 1, minWidth: '140px' }}
            min="0.01"
            step="any"
          />

          <input
            type="text"
            placeholder="📝 ملاحظات (اختياري)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...glassInputStyle, flex: 2, minWidth: '200px' }}
          />

          <button type="submit" style={btnPrimary}>
            ➕ إضافة عمولة
          </button>
        </div>
      </form>

      {/* ─── شبكة بطاقات العمولات ─── */}
      {isLoading ? (
        <p style={{ color: '#38bdf8', textAlign: 'center', padding: '30px' }}>جاري مزامنة وتحميل البيانات من الخادم...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filteredCommissions.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <p style={{ fontSize: '18px' }}>💰 لا توجد عمولات مطابقة</p>
            </div>
          ) : (
            filteredCommissions.map((c) => {
              if (!c) return null;
              const isEditing = editingId === c.id;
              const statusColor = c.status === 'paid' ? '#10b981' : '#f59e0b';
              const statusLabel = c.status === 'paid' ? '✅ مدفوع' : '⏳ معلق';

              return (
                <div key={c.id} style={{ ...glassCardStyle, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: statusColor, opacity: 0.8 }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>📅 {c.date ? new Date(c.date).toLocaleString("ar-JO") : ''}</span>
                      <h4 style={{ margin: '4px 0 0 0', color: '#f8fafc', fontSize: '16px' }}>👤 {c.employee}</h4>
                    </div>
                    <span style={{ background: 'rgba(15, 23, 42, 0.6)', color: statusColor, padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${statusColor}40` }}>
                      {statusLabel}
                    </span>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={glassInputStyle} placeholder="المبلغ" />
                      <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} style={glassInputStyle} placeholder="ملاحظات" />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={saveEdit} style={{ ...btnSuccess, flex: 1 }}>💾 حفظ</button>
                        <button onClick={cancelEdit} style={{ ...btnSecondary, flex: 1 }}>❌ إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f97316', marginBottom: '8px' }}>
                        {Number(c.amount) || 0} <span style={{ fontSize: '14px', color: '#94a3b8' }}>دينار</span>
                      </div>
                      {c.notes && (
                        <p style={{ fontSize: '12px', color: '#cbd5e1', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px', marginBottom: '10px' }}>
                          📝 {c.notes}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {canManageCommissions(currentUser?.role) && (
                          <>
                            <button onClick={() => startEdit(c)} style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}>✏️ تعديل</button>
                            <button onClick={() => handleDeleteCommission(c.id, c.employee, c.amount)} style={{ ...btnDanger, fontSize: '11px', padding: '5px 10px' }}>🗑️ حذف</button>
                            <button onClick={() => toggleStatus(c.id)} style={{ ...btnSuccess, fontSize: '11px', padding: '5px 10px' }}>
                              {c.status === 'paid' ? '⏳ إلغاء الدفع' : '✅ تأكيد الدفع'}
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── سجل النشاطات ─── */}
      <div style={glassCardStyle}>
        <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '16px' }}>📜 سجل الأحداث والنشاطات</h4>
        {safeLogs.length === 0 ? (
          <p style={{ color: '#9ca3af', margin: 0 }}>⚠️ لا يوجد أحداث مسجلة</p>
        ) : (
          <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {safeLogs.slice(-20).map((log, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', color: '#cbd5e1' }}>
                {typeof log === 'string' ? log : (log.log || JSON.stringify(log))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── أزرار التصدير ─── */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={exportCSV} style={btnSecondary}>📤 تصدير CSV</button>
        <button type="button" onClick={exportPDF} style={{ ...btnSecondary, background: 'rgba(16, 185, 129, 0.8)', borderColor: 'rgba(16, 185, 129, 0.4)' }}>📄 تصدير PDF / طباعة</button>
      </div>
    </div>
  );
}

export default Commissions;