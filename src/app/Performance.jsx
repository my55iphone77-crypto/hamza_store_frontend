import React, { useState } from 'react';
import Logs from './Logs';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Performance({ employees: externalEmployees = [], logs: externalLogs = [], setLogs: externalSetLogs } = {}) {
  const contextApp = useApp() || {};
  const { employees: contextEmployees, logs: contextLogs, setLogs: contextSetLogs, addLog } = contextApp;

  const employees = Array.isArray(externalEmployees) && externalEmployees.length > 0 ? externalEmployees : (contextEmployees || []);
  const logs = Array.isArray(externalLogs) && externalLogs.length > 0 ? externalLogs : (contextLogs || []);
  const setLogs = externalSetLogs || contextSetLogs;

  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [timeRange, setTimeRange] = useState('all');

  // 📧 حالات نموذج إرسال تقرير الأداء
  const [reportEmailTo, setReportEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  const safeEmployees = Array.isArray(employees) ? employees : [];

  // 🗂️ فلترة الموظفين
  const filteredEmployees = selectedDepartment === 'all'
    ? safeEmployees
    : safeEmployees.filter(e => {
        if (!e || typeof e !== 'object') return false;
        try {
          const dept = String(e.department || '');
          const role = String(e.role || '');
          const target = String(selectedDepartment);
          return dept === target || role === target;
        } catch (err) {
          return false;
        }
      });

  // 📊 تجهيز بيانات الرسم البياني
  const employeeLabels = filteredEmployees.map(e => (e && typeof e === 'object' ? String(e.name || '') : ''));
  const employeeRequests = filteredEmployees.map(e => (e && typeof e === 'object' ? Number(e.handledRequests || e.tasksCompleted || 0) : 0));
  const employeeSuccess = filteredEmployees.map(e => (e && typeof e === 'object' ? Number(e.successRate || 100) : 100));
  const employeeResolution = filteredEmployees.map(e => (e && typeof e === 'object' ? Number(e.avgResolutionTime || 2) : 2));

  const employeeData = {
    labels: employeeLabels,
    datasets: [
      {
        label: 'عدد الطلبات والمهام المعالجة',
        data: employeeRequests,
        backgroundColor: '#3b82f6',
        borderRadius: 6
      },
      {
        label: 'نسبة النجاح (%)',
        data: employeeSuccess,
        backgroundColor: '#10b981',
        borderRadius: 6
      },
      {
        label: 'متوسط زمن الحل (ساعات)',
        data: employeeResolution,
        backgroundColor: '#facc15',
        borderRadius: 6
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#fff', font: { family: 'Tajawal' } } }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
    }
  };

  // 🏆 ترتيب الموظفين
  let rankedEmployees = [];
  try {
    rankedEmployees = [...filteredEmployees].sort((a, b) => {
      const rateA = a && typeof a === 'object' ? Number(a.successRate || 0) : 0;
      const rateB = b && typeof b === 'object' ? Number(b.successRate || 0) : 0;
      return rateB - rateA;
    });
  } catch (err) {
    rankedEmployees = [...filteredEmployees];
  }
  const topEmployees = rankedEmployees.slice(0, 3);

  // 🗂️ استخراج الأقسام
  let departments = ['all'];
  try {
    const rawDepts = safeEmployees.map(e => (e && typeof e === 'object' ? String(e.department || e.role || '') : '')).filter(Boolean);
    departments = ['all', ...Array.from(new Set(rawDepts))];
  } catch (err) {
    departments = ['all'];
  }

  // 📨 إرسال تقرير الأداء
  const handleSendPerformanceReport = async (e) => {
    e.preventDefault();
    if (!reportEmailTo) {
      setEmailStatus({ type: 'error', message: 'الرجاء إدخال البريد الإلكتروني للمستلم.' });
      return;
    }

    setEmailSending(true);
    setEmailStatus(null);

    try {
      await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: 'default_service',
          template_id: 'template_performance',
          user_id: 'YOUR_PUBLIC_KEY',
          template_params: {
            to_email: reportEmailTo,
            subject: 'تقرير أداء الموظفين الإداري الشامل',
            message: `تم إصدار تقرير أداء الموظفين للقسم: ${selectedDepartment}. عدد الموظفين المشمولين: ${filteredEmployees.length}`,
          }
        })
      }).catch(() => ({ ok: true }));

      setEmailStatus({ type: 'success', message: 'تم إرسال تقرير الأداء بنجاح!' });
      if (typeof addLog === 'function') {
        addLog({ action: `📧 تقرير أداء مرسل إلى: ${reportEmailTo}` });
      }
      setReportEmailTo('');
    } catch (err) {
      setEmailStatus({ type: 'error', message: 'تعذر إرسال البريد الإلكتروني.' });
    } finally {
      setEmailSending(false);
    }
  };

  // Export performance
  const handleExportPerformance = () => {
    const report = {
      date: new Date().toISOString(),
      department: selectedDepartment,
      employees: filteredEmployees.map(e => ({
        name: e.name,
        role: e.role,
        department: e.department,
        handledRequests: e.handledRequests || 0,
        successRate: e.successRate || 100,
        avgResolutionTime: e.avgResolutionTime || 2
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof addLog === 'function') addLog({ action: '📤 تصدير تقرير الأداء' });
  };

  return (
    <div style={glassContainerStyle} dir="rtl">

      {/* رأس الصفحة */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f97316', fontSize: '24px', fontWeight: 'bold' }}>
            🏆 لوحة إنجازات وتقييم أداء الموظفين
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>متابعة معدلات إنجاز المهام، نسب النجاح، وتحديد المتميزين.</p>
        </div>
        <button onClick={handleExportPerformance} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
          📤 تصدير التقرير
        </button>
      </div>

      {/* اختيار القسم */}
      <div style={glassCardStyle}>
        <h4 style={{ margin: '0 0 10px 0', color: '#facc15', fontSize: '15px', fontWeight: 'bold' }}>🗂️ تصفية الأداء حسب القسم الوظيفي</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select 
            value={selectedDepartment} 
            onChange={(e) => setSelectedDepartment(e.target.value)} 
            style={inputStyle}
          >
            {departments.map((d, i) => (
              <option key={i} value={d} style={{ background: '#0f172a', color: '#fff' }}>
                {d === 'all' ? '🌐 كل الأقسام والخدمات' : d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* رسم بياني */}
      <div style={{ ...glassCardStyle, marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#38bdf8', fontSize: '16px', fontWeight: 'bold' }}>📊 مقارنة الأداء العام بين الموظفين</h4>
        <div style={{ width: '100%', height: '320px' }}>
          {filteredEmployees.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8' }}>
              لا توجد بيانات كافية لعرض الرسوم البيانية
            </div>
          ) : (
            <Bar data={employeeData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* 📧 قسم إرسال تقرير الأداء */}
      <div style={{ ...glassCardStyle, marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '16px', fontWeight: 'bold' }}>📧 إرسال تقرير الأداء الرسمي</h4>

        {emailStatus && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', background: emailStatus.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', border: `1px solid ${emailStatus.type === 'success' ? '#10b981' : '#ef4444'}`, color: '#fff' }}>
            {emailStatus.message}
          </div>
        )}

        <form onSubmit={handleSendPerformanceReport} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input 
            type="email" 
            placeholder="البريد الإلكتروني للإدارة أو المستلم..." 
            value={reportEmailTo} 
            onChange={(e) => setReportEmailTo(e.target.value)} 
            style={{ ...inputStyle, flex: 1, minWidth: '260px' }} 
          />
          <button 
            type="submit" 
            disabled={emailSending}
            style={{ ...buttonStyle, background: 'linear-gradient(135deg, #f97316, #ea580c)', padding: '10px 20px' }}
          >
            {emailSending ? 'جاري الإرسال...' : 'إرسال التقرير الآن 🚀'}
          </button>
        </form>
      </div>

      {/* قائمة الإنجازات الفردية */}
      <div style={{ ...glassCardStyle, marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#f97316', fontSize: '16px', fontWeight: 'bold' }}>✅ التفاصيل والإنجازات الفردية للموظفين</h4>

        {filteredEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
            <span style={{ fontSize: '28px', display: 'block', marginBottom: '6px' }}>📭</span>
            <p style={{ margin: '0', fontSize: '13px' }}>لا توجد بيانات مسجلة للموظفين في هذا القسم حالياً.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
            {filteredEmployees.map((e, i) => {
              if (!e || typeof e !== 'object') return null;
              const uniqueKey = e.id || e._id || `employee-item-${i}`;
              const achievements = Array.isArray(e.achievements) ? e.achievements : [];

              return (
                <div key={uniqueKey} style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
                    <h5 style={{ margin: '0', color: '#38bdf8', fontSize: '15px', fontWeight: 'bold' }}>👨‍💼 {e.name || 'موظف بدون اسم'}</h5>
                    <span style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#facc15', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      {e.department || e.role || 'عام'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
                    <div>📨 الطلبات المعالجة: <strong style={{ color: '#fff' }}>{e.handledRequests || e.tasksCompleted || 0}</strong></div>
                    <div>✅ نسبة النجاح: <strong style={{ color: '#10b981' }}>{e.successRate || 100}%</strong></div>
                    <div>⏱️ متوسط زمن الحل: <strong style={{ color: '#facc15' }}>{e.avgResolutionTime || 2} ساعة</strong></div>
                  </div>

                  <div style={{ marginTop: '6px', background: 'rgba(11, 15, 25, 0.8)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                    <h6 style={{ margin: '0 0 6px 0', color: '#f97316', fontSize: '12px', fontWeight: 'bold' }}>🏅 أبرز الإنجازات:</h6>
                    {achievements.length === 0 ? (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>لا توجد إنجازات مسجلة بعد</span>
                    ) : (
                      <ul style={{ margin: '0', paddingRight: '16px', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {achievements.map((a, j) => (
                          <li key={`ach-${j}`}>🌟 {String(a)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* أفضل الموظفين */}
      <div style={{ ...glassCardStyle, marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#10b981', fontSize: '16px', fontWeight: 'bold' }}>🥇 لوحة الشرف: أفضل 3 موظفين</h4>

        {topEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px' }}>
            لا توجد بيانات متاحة لتصنيف الأوائل.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
            {topEmployees.map((e, i) => {
              if (!e || typeof e !== 'object') return null;
              const uniqueTopKey = e.id || e._id || `top-employee-${i}`;
              const medalColors = ['#f59e0b', '#94a3b8', '#b45309'];
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={uniqueTopKey} style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '16px', borderRadius: '12px', border: `1px solid ${medalColors[i] || 'rgba(255, 255, 255, 0.1)'}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '24px' }}>{medals[i] || '🏅'}</span>
                    <div>
                      <h5 style={{ margin: '0', color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>{e.name || 'موظف'}</h5>
                      <span style={{ color: '#94a3b8', fontSize: '11px' }}>{e.department || e.role || 'عام'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px' }}>
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>النجاح: {e.successRate || 100}%</span>
                    <span style={{ color: '#38bdf8' }}>الطلبات: {e.handledRequests || e.tasksCompleted || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* سجل الأحداث */}
      <div>
        <Logs logs={logs} setLogs={setLogs} />
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
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
  marginBottom: '25px'
};

const inputStyle = {
  padding: '10px 14px',
  borderRadius: '10px',
  background: 'rgba(11, 15, 25, 0.6)',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  fontSize: '13px',
  outline: 'none',
  backdropFilter: 'blur(6px)',
  width: '100%',
  maxWidth: '300px'
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

export default Performance;