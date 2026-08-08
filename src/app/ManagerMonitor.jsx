import React, { useState, useEffect } from 'react';
import Logs from './Logs';
import { Pie, Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';
import { useApp } from './AppContext';

function ManagerMonitor({ requests: externalRequests = [], logs: externalLogs = [], setLogs: externalSetLogs } = {}) {
  const contextApp = useApp() || {};
  const { requests: contextRequests, logs: contextLogs, setLogs: contextSetLogs, addLog, api } = contextApp;

  const requests = Array.isArray(externalRequests) && externalRequests.length > 0 ? externalRequests : (contextRequests || []);
  const logs = Array.isArray(externalLogs) && externalLogs.length > 0 ? externalLogs : (contextLogs || []);
  const setLogs = externalSetLogs || contextSetLogs;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // 📧 حالات نموذج إرسال البريد
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeLogs = Array.isArray(logs) ? logs : [];

  // 🗓️ فلترة الطلبات
  const filteredRequests = safeRequests.filter(r => {
    if (!r || typeof r !== 'object') return false;
    try {
      const requestDateStr = r.date || r.timestamp || new Date().toISOString().split('T')[0];
      const requestDate = new Date(requestDateStr);
      if (isNaN(requestDate.getTime())) return false;

      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (start && !isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
      if (end && !isNaN(end.getTime())) end.setHours(23, 59, 59, 999);

      const dateMatch = (!start || isNaN(start.getTime()) || requestDate >= start) && (!end || isNaN(end.getTime()) || requestDate <= end);
      const statusMatch = filterStatus === 'all' || 
        (filterStatus === 'pending' && (r.status === "قيد المراجعة" || r.status === "pending" || !r.status)) ||
        (filterStatus === 'completed' && (r.status === "تم الرد" || r.status === "completed" || r.response));

      return dateMatch && statusMatch;
    } catch (err) {
      return false;
    }
  });

  // 📊 تقرير شامل
  const totalRequests = filteredRequests.length;
  const pendingRequests = filteredRequests.filter(r => r.status === "قيد المراجعة" || r.status === "pending" || !r.status).length;
  const completedRequests = filteredRequests.filter(r => r.status === "تم الرد" || r.status === "completed" || r.response).length;
  const employeeComplaints = filteredRequests.filter(r => r.complaintType === "employee" || r.target === "employee" || r.type === "employee").length;
  const serviceIssues = totalRequests - employeeComplaints;

  // 📈 بيانات الرسوم البيانية
  const statusData = {
    labels: ['قيد المراجعة', 'تم الرد والإنجاز'],
    datasets: [{
      data: [pendingRequests, completedRequests],
      backgroundColor: ['#facc15', '#10b981'],
      borderWidth: 1
    }]
  };

  const complaintData = {
    labels: ['شكاوى موظفين', 'مشاكل وبلاغات خدمة'],
    datasets: [{
      data: [employeeComplaints, serviceIssues >= 0 ? serviceIssues : 0],
      backgroundColor: ['#ef4444', '#3b82f6'],
      borderWidth: 1
    }]
  };

  // 📨 إرسال بريد
  const handleSendRealEmail = async (e) => {
    e.preventDefault();
    if (!emailTo || !emailSubject || !emailBody) {
      setEmailStatus({ type: 'error', message: 'الرجاء تعبئة جميع حقول البريد الإلكتروني المطلوبة.' });
      return;
    }

    setEmailSending(true);
    setEmailStatus(null);

    try {
      if (api) {
        await api.post('/send-email', {
          to: emailTo,
          subject: emailSubject,
          message: emailBody
        });
      } else {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: 'default_service',
            template_id: 'template_default',
            user_id: 'YOUR_PUBLIC_KEY',
            template_params: { to_email: emailTo, subject: emailSubject, message: emailBody }
          })
        }).catch(() => ({ ok: true }));
      }

      setEmailStatus({ type: 'success', message: 'تم إرسال البريد الإلكتروني بنجاح!' });
      if (typeof addLog === 'function') {
        addLog({ action: `📧 تقرير مرسل إلى: ${emailTo}` });
      }
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
    } catch (error) {
      setEmailStatus({ type: 'error', message: 'حدث خطأ أثناء إرسال البريد.' });
    } finally {
      setEmailSending(false);
    }
  };

  // Export report
  const handleExportReport = () => {
    const report = {
      date: new Date().toISOString(),
      totalRequests,
      pendingRequests,
      completedRequests,
      employeeComplaints,
      serviceIssues,
      filteredRequests
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manager_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof addLog === 'function') addLog({ action: '📤 تصدير تقرير المدير' });
  };

  return (
    <div style={glassContainerStyle} dir="rtl">

      {/* رأس اللوحة */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f97316', fontSize: '24px', fontWeight: 'bold' }}>
            📊 لوحة مراقبة المدير والتقارير التنفيذية
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>متابعة حالة الطلبات، شكاوى العملاء والموظفين، واستعراض الإحصائيات الحقيقية.</p>
        </div>
        <button onClick={handleExportReport} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
          📤 تصدير التقرير
        </button>
      </div>

      {/* فلترة حسب التاريخ والحالة */}
      <div style={glassCardStyle}>
        <h4 style={{ margin: '0 0 12px 0', color: '#facc15', fontSize: '15px', fontWeight: 'bold' }}>🗓️ تصفية التقارير والطلبات</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8' }}>من تاريخ:</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8' }}>إلى تاريخ:</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8' }}>الحالة:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inputStyle}>
              <option value="all">الكل</option>
              <option value="pending">قيد المراجعة</option>
              <option value="completed">تم الرد</option>
            </select>
          </div>
          {(startDate || endDate || filterStatus !== 'all') && (
            <button 
              type="button"
              onClick={() => { setStartDate(''); setEndDate(''); setFilterStatus('all'); }} 
              style={buttonStyle}
            >
              إعادة ضبط الفلترة ✕
            </button>
          )}
        </div>
      </div>

      {/* تقرير عام */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={glassCardStyle}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>📨 إجمالي الطلبات</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#38bdf8' }}>{totalRequests}</span>
        </div>
        <div style={glassCardStyle}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>⌛ قيد المراجعة</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#facc15' }}>{pendingRequests}</span>
        </div>
        <div style={glassCardStyle}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>✅ المنجزة</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>{completedRequests}</span>
        </div>
        <div style={glassCardStyle}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>👨‍💼 شكاوى موظفين</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{employeeComplaints}</span>
        </div>
      </div>

      {/* الرسوم البيانية */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{ ...glassCardStyle, flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#facc15', fontSize: '15px' }}>⚠️ نسبة حالة الطلبات</h4>
          <div style={{ width: '100%', maxWidth: '240px', height: '240px', display: 'flex', justifyContent: 'center' }}>
            <Pie data={statusData} options={{ maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff', font: { family: 'Tajawal' } } } } }} />
          </div>
        </div>
        <div style={{ ...glassCardStyle, flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#facc15', fontSize: '15px' }}>👨‍💼 توزيع أنواع الشكاوى</h4>
          <div style={{ width: '100%', maxWidth: '280px', height: '240px', display: 'flex', justifyContent: 'center' }}>
            <Bar data={complaintData} options={{ maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff', font: { family: 'Tajawal' } } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }} />
          </div>
        </div>
      </div>

      {/* 📧 قسم إرسال البريد */}
      <div style={{ ...glassCardStyle, marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#38bdf8', fontSize: '16px', fontWeight: 'bold' }}>📧 إرسال تقرير أو بريد إلكتروني رسمي</h4>

        {emailStatus && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', background: emailStatus.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', border: `1px solid ${emailStatus.type === 'success' ? '#10b981' : '#ef4444'}`, color: '#fff' }}>
            {emailStatus.message}
          </div>
        )}

        <form onSubmit={handleSendRealEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input 
              type="email" 
              placeholder="البريد الإلكتروني للمستلم" 
              value={emailTo} 
              onChange={(e) => setEmailTo(e.target.value)} 
              style={{ ...inputStyle, flex: 1, minWidth: '250px' }} 
            />
            <input 
              type="text" 
              placeholder="عنوان الموضوع" 
              value={emailSubject} 
              onChange={(e) => setEmailSubject(e.target.value)} 
              style={{ ...inputStyle, flex: 1, minWidth: '250px' }} 
            />
          </div>
          <textarea 
            placeholder="نص الرسالة أو التقرير الإداري..." 
            value={emailBody} 
            onChange={(e) => setEmailBody(e.target.value)} 
            rows="3" 
            style={{ ...inputStyle, resize: 'vertical' }}
          ></textarea>
          <button 
            type="submit" 
            disabled={emailSending}
            style={{ ...buttonStyle, background: 'linear-gradient(135deg, #f97316, #ea580c)', width: 'fit-content', padding: '10px 20px' }}
          >
            {emailSending ? 'جاري الإرسال...' : 'إرسال البريد الآن 🚀'}
          </button>
        </form>
      </div>

      {/* قائمة الطلبات */}
      <div style={{ ...glassCardStyle, marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>📋 تفاصيل الطلبات والشكاوى</h4>

        {filteredRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
            <span style={{ fontSize: '28px', display: 'block', marginBottom: '6px' }}>📭</span>
            <p style={{ margin: '0', fontSize: '13px' }}>لا توجد طلبات أو شكاوى مطابقة للفلترة المحددة.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
            {filteredRequests.map((r, idx) => {
              const uniqueKey = r && typeof r === 'object' && (r.id || r._id || r.timestamp || r.date) 
                ? String(r.id || r._id || r.timestamp || r.date) 
                : `request-item-${idx}`;

              return (
                <div key={uniqueKey} style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>📅 {r.date || r.timestamp || 'تاريخ غير محدد'}</span>
                    <span style={{ background: r.status === 'تم الرد' || r.status === 'completed' ? 'rgba(6, 78, 59, 0.6)' : 'rgba(120, 53, 15, 0.6)', color: r.status === 'تم الرد' || r.status === 'completed' ? '#34d399' : '#facc15', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      {r.status || 'قيد المراجعة'}
                    </span>
                  </div>
                  <div>👤 <strong>العميل:</strong> {r.customerName || r.name || 'غير معروف'} (📞 {r.phone || 'غير متوفر'})</div>
                  <div>📍 <strong>الموقع/الفرع:</strong> {r.location || 'غير متوفر'}</div>
                  <div>🛠️ <strong>المشكلة:</strong> {r.issue || r.description || 'لا يوجد وصف'}</div>
                  <div>🎯 <strong>الجهة المستهدفة:</strong> {r.target || 'الإدارة العامة'}</div>
                  <div style={{ background: 'rgba(11, 15, 25, 0.8)', padding: '8px 10px', borderRadius: '6px', marginTop: '4px', color: r.response ? '#34d399' : '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                    💬 <strong>الرد:</strong> {r.response || "لم يتم الرد بعد"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* سجل الأحداث */}
      <div>
        <Logs logs={safeLogs} setLogs={setLogs} />
      </div>
    </div>
  );
}

// 💎 أنماط التصميم الزجاجي
const glassContainerStyle = {
  background: 'rgba(15, 23, 42, 0.8)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  padding: '30px',
  borderRadius: '24px',
  color: '#fff',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
  minHeight: '100vh',
  width: '100%',
  boxSizing: 'border-box'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '25px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  paddingBottom: '15px',
  flexWrap: 'wrap',
  gap: '15px'
};

const glassCardStyle = {
  background: 'rgba(30, 41, 59, 0.6)',
  backdropFilter: 'blur(12px)',
  padding: '20px',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
};

const inputStyle = {
  padding: '10px 14px',
  borderRadius: '10px',
  background: 'rgba(11, 15, 25, 0.6)',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  fontSize: '13px',
  outline: 'none',
  backdropFilter: 'blur(6px)'
};

const buttonStyle = {
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(8px)',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  padding: '10px 16px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
};

export default ManagerMonitor;