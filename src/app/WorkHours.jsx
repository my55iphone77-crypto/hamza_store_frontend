import React, { useState, useEffect } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function WorkHours({ inputStyle = {} }) {
  const context = useApp ? useApp() : {};
  const {
    token,
    apiRequest,
    currentUser = null,
    workHours = [],
    setWorkHours = () => {},
    mails = [],
    setMails = () => {},
    globalBus,
    triggerGlobalSync
  } = context;

  const role = (currentUser && currentUser.role) || 'guest';
  const isManager = role === 'manager' || role === 'owner' || role === 'admin';

  const [name, setName] = useState((currentUser && currentUser.name) || '');
  const [department, setDepartment] = useState('المبيعات');

  const getSafeInitialDate = () => {
    try {
      return new Date().toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  };

  const [date, setDate] = useState(getSafeInitialDate());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');

  const [filterDept, setFilterDept] = useState('all');
  const [filterName, setFilterName] = useState('');
  const [savingState, setSavingState] = useState('');

  // حالات نافذة إرسال الإيميل الحقيقي
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('تقرير سجلات ساعات العمل والدوام');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const safeHours = Array.isArray(workHours) ? workHours : [];

  const flashSaving = (msg, syncType = 'WORK_HOURS_SYNC') => {
    setSavingState(msg);
    setTimeout(() => setSavingState(''), 3000);
    if (typeof triggerGlobalSync === 'function') {
      triggerGlobalSync({ type: syncType, timestamp: Date.now() });
    }
  };

  // ⚡ الاستماع للتحديثات الفورية عبر Global State Bus
  useEffect(() => {
    if (globalBus && (globalBus.type === 'WORK_HOURS_SYNC' || globalBus.type === 'GENERAL_SYNC')) {
      // إذا تطلب الأمر إعادة جلب أو تحديث البيانات من السياق العام
    }
  }, [globalBus]);

  // ➕ إضافة سجل ساعات عمل جديد عبر apiRequest
  const addRecord = async (e) => {
    e.preventDefault();
    if (!name || !department || !date || !start || !end) {
      alert('⚠️ يرجى تعبئة كافة حقول ساعات العمل المطلوبة.');
      return;
    }
    if (!apiRequest) return;

    try {
      const response = await apiRequest('/work-hours', 'POST', {
        name: String(name).trim(),
        department: String(department).trim(),
        date: String(date).trim(),
        start: String(start).trim(),
        end: String(end).trim()
      });

      // مزامنة محلية فورية في حال لم تكن مغطاة بالسيرفر كلياً
      if (response && typeof response === 'object' && setWorkHours) {
        setWorkHours(prev => [...(Array.isArray(prev) ? prev : []), response]);
      }

      const logText = `⏰ تم تسجيل ساعات عمل للموظف: (${name}) في قسم (${department}) ليوم (${date})`;
      if (setMails && Array.isArray(mails)) {
        setMails([...mails, logText]);
      }

      flashSaving('✅ تم تسجيل الدوام ومزامنته لحظياً!', 'WORK_HOURS_SYNC');

      setName((currentUser && currentUser.name) || '');
      setDepartment('المبيعات');
    } catch (err) {
      console.error(err);
      alert('⚠️ حدث خطأ أثناء إرسال سجل الدوام للسيرفر.');
    }
  };

  // ❌ حذف سجل عبر apiRequest
  const deleteRecord = async (id) => {
    if (!apiRequest) return;
    const target = safeHours.find(h => h && (h._id === id || h.id === id));
    if (!target) return;
    const targetId = target._id || target.id;

    if (!window.confirm('🗑️ هل أنت متأكد من رغبتك في حذف سجل الدوام هذا؟')) return;

    try {
      await apiRequest(`/work-hours/${targetId}`, 'DELETE');
      
      if (setWorkHours) {
        setWorkHours(prev => (Array.isArray(prev) ? prev.filter(h => h && (h._id !== id && h.id !== id)) : []));
      }

      const logText = `🗑️ تم حذف سجل ساعات عمل للموظف: (${target?.name || 'غير معروف'})`;
      if (setMails && Array.isArray(mails)) {
        setMails([...mails, logText]);
      }
      flashSaving('🗑️ تم الحذف والمزامنة بنجاح!', 'WORK_HOURS_SYNC');
    } catch (err) {
      console.error(err);
      alert('⚠️ حدث خطأ أثناء حذف سجل الدوام من السيرفر.');
    }
  };

  // 📧 إرسال تقرير الدوام عبر إيميل حقيقي من خلال الـ API
  const handleSendRealEmail = async (e) => {
    e.preventDefault();
    if (!emailRecipient) {
      alert('الرجاء إدخال البريد الإلكتروني للمستلم!');
      return;
    }
    setIsSendingEmail(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const apiUrl = context.apiUrl || 'https://api.yourdomain.com/v1';
      const response = await fetch(`${apiUrl}/send-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: emailRecipient,
          subject: emailSubject,
          message: emailBody || `تقرير ساعات العمل والدوام:\n- إجمالي السجلات: ${safeHours.length}\n- الموظفون المسجلون: ${safeHours.map(h => h.name).join(', ')}`
        }),
      });

      if (!response.ok) throw new Error('فشل إرسال البريد الإلكتروني من السيرفر.');

      alert('📧 تم إرسال تقرير الدوام عبر البريد الإلكتروني بنجاح!');
      setIsEmailModalOpen(false);
      setEmailRecipient('');
      setEmailBody('');
    } catch (err) {
      alert('فشل إرسال الإيميل: ' + err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // حساب عدد الساعات لكل سجل
  const calculateDuration = (startTime, endTime) => {
    try {
      if (!startTime || !endTime) return 8;
      const [startHour, startMin] = String(startTime).split(':').map(Number);
      const [endHour, endMin] = String(endTime).split(':').map(Number);
      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) return 8;
      const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      const hoursCount = (totalMinutes / 60).toFixed(1);
      return Number(hoursCount) > 0 ? hoursCount : 0;
    } catch {
      return 8;
    }
  };

  // تصفية السجلات بأمان تام
  const filteredHours = safeHours.filter(h => {
    if (!h) return false;
    const matchDept = filterDept === 'all' ? true : h.department === filterDept;
    const matchName = filterName ? (h.name || '').toLowerCase().includes(filterName.toLowerCase()) : true;
    return matchDept && matchName;
  });

  if (!token) {
    return <div style={{ color: '#fff', textAlign: 'center', padding: '50px', fontFamily: 'Tajawal, sans-serif' }}>يرجى تسجيل الدخول لعرض سجلات الدوام. ⏳</div>;
  }

  return (
    <div style={glassContainerStyle} dir="rtl">
      
      {/* رأس الصفحة مع زر إرسال الإيميل الحقيقي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f97316', fontSize: '22px', fontWeight: 'bold' }}>
            ⏰ نظام ساعات العمل والدوام (Work Hours)
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>تسجيل ومتابعة ساعات حضور والانصراف لفرق العمل — متزامن لحظياً عبر كل الأجهزة والأقسام.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {savingState && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 'bold' }}>{savingState}</span>}
          <button 
            type="button"
            onClick={() => setIsEmailModalOpen(true)}
            style={secondaryButtonStyle}
          >
            📨 إرسال تقرير إيميل حقيقي
          </button>
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', color: '#38bdf8', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }}>
            إجمالي السجلات: {safeHours.length}
          </div>
        </div>
      </div>

      {/* لوحة المدير لإضافة السجلات */}
      {isManager && (
        <form onSubmit={addRecord} style={glassCardStyle}>
          <h4 style={{ margin: '0', color: '#38bdf8', fontSize: '15px' }}>👑 لوحة المدير - تسجيل ساعات عمل جديدة</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <input 
              type="text" 
              placeholder="اسم الموظف..." 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              style={glassInputStyle} 
            />

            <select 
              value={department} 
              onChange={(e) => setDepartment(e.target.value)} 
              style={glassInputStyle}
            >
              <option value="المبيعات" style={{ background: '#0b0f19' }}>💰 المبيعات</option>
              <option value="الدعم الفني" style={{ background: '#0b0f19' }}>🔧 الدعم الفني</option>
              <option value="التقنية" style={{ background: '#0b0f19' }}>💻 التقنية</option>
              <option value="الإدارة" style={{ background: '#0b0f19' }}>👑 الإدارة</option>
            </select>

            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              style={glassInputStyle} 
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>من الساعة:</span>
              <input 
                type="time" 
                value={start} 
                onChange={(e) => setStart(e.target.value)} 
                style={glassInputStyle} 
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>إلى الساعة:</span>
              <input 
                type="time" 
                value={end} 
                onChange={(e) => setEnd(e.target.value)} 
                style={glassInputStyle} 
              />
            </div>
          </div>

          <button type="submit" style={primaryButtonStyle}>
            إضافة سجل الدوام وإرساله للسيرفر ➕
          </button>
        </form>
      )}

      {/* شريط البحث والفلترة */}
      <div style={glassCardStyle}>
        <h4 style={{ margin: '0', color: '#facc15', fontSize: '14px' }}>🔍 تصفية وبحث في سجلات الدوام</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <input 
            type="text" 
            placeholder="ابحث باسم الموظف..." 
            value={filterName} 
            onChange={(e) => setFilterName(e.target.value)} 
            style={glassInputStyle} 
          />

          <select 
            value={filterDept} 
            onChange={(e) => setFilterDept(e.target.value)} 
            style={glassInputStyle}
          >
            <option value="all" style={{ background: '#0b0f19' }}>كل الأقسام</option>
            <option value="المبيعات" style={{ background: '#0b0f19' }}>المبيعات</option>
            <option value="الدعم الفني" style={{ background: '#0b0f19' }}>الدعم الفني</option>
            <option value="التقنية" style={{ background: '#0b0f19' }}>التقنية</option>
            <option value="الإدارة" style={{ background: '#0b0f19' }}>الإدارة</option>
          </select>
        </div>
      </div>

      {/* عرض السجلات */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
        {filteredHours.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px', gridColumn: '1 / -1' }}>لا توجد سجلات دوام مطابقة لخيارات البحث</p>
        ) : (
          filteredHours.map(record => {
            if (!record) return null;
            const recordId = record._id || record.id;
            const duration = calculateDuration(record.start, record.end);
            return (
              <div key={recordId || Math.random()} style={recordCardStyle}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                  <h4 style={{ margin: '0', color: '#f97316', fontSize: '16px' }}>👤 {record.name}</h4>
                  <span style={{ fontSize: '12px', background: 'rgba(30, 41, 59, 0.8)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px' }}>
                    {record.department}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#94a3b8' }}>
                  <p style={{ margin: '0' }}>📅 التاريخ: <span style={{ color: '#fff' }}>{record.date}</span></p>
                  <p style={{ margin: '0' }}>🕘 وقت الدوام: <span style={{ color: '#34d399' }}>{record.start}</span> ➔ <span style={{ color: '#ef4444' }}>{record.end}</span></p>
                  <p style={{ margin: '0' }}>⏱️ إجمالي الساعات: <span style={{ color: '#facc15', fontWeight: 'bold' }}>{duration} ساعات</span></p>
                </div>

                {isManager && (
                  <button 
                    type="button"
                    onClick={() => deleteRecord(recordId)} 
                    style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginTop: '6px' }}
                  >
                    حذف السجل 🗑️
                  </button>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* نافذة إرسال الإيميل الحقيقي بتصميم زجاجي فاخر */}
      {isEmailModalOpen && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => setIsEmailModalOpen(false)} style={closeBtnStyle}>✕</button>
            <h3 style={{ color: '#38bdf8', margin: '0 0 15px 0' }}>📨 إرسال تقرير الدوام عبر البريد</h3>
            <form onSubmit={handleSendRealEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="email" 
                placeholder="البريد الإلكتروني للمستلم *" 
                value={emailRecipient} 
                onChange={(e) => setEmailRecipient(e.target.value)} 
                style={glassInputStyle} 
                required 
              />
              <input 
                type="text" 
                placeholder="عنوان الرسالة..." 
                value={emailSubject} 
                onChange={(e) => setEmailSubject(e.target.value)} 
                style={glassInputStyle} 
              />
              <textarea 
                placeholder="محتوى التقرير أو الملاحظات..." 
                value={emailBody} 
                onChange={(e) => setEmailBody(e.target.value)} 
                rows={4} 
                style={glassInputStyle} 
              />
              <button type="submit" style={primaryButtonStyle} disabled={isSendingEmail}>
                {isSendingEmail ? '⏳ جاري إرسال الإيميل...' : 'إرسال التقرير الآن 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// ------------------------------------------------------------------
// 🎨 أنماط التصميم الزجاجي الفاخر (Glassmorphism Styles)
// ------------------------------------------------------------------
const glassContainerStyle = {
  background: 'rgba(15, 23, 42, 0.78)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  padding: '30px',
  borderRadius: '24px',
  color: '#f8fafc',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)'
};

const glassCardStyle = {
  background: 'rgba(17, 24, 39, 0.65)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  padding: '20px',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  marginBottom: '25px',
  display: 'flex',
  flexDirection: 'column',
  gap: '15px'
};

const recordCardStyle = {
  background: 'rgba(17, 24, 39, 0.75)',
  backdropFilter: 'blur(10px)',
  padding: '16px',
  borderRadius: '14px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxShadow: '0 8px 16px -4px rgba(0,0,0,0.3)'
};

const glassInputStyle = {
  background: 'rgba(11, 15, 25, 0.7)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  padding: '10px 14px',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  fontFamily: 'Tajawal, sans-serif'
};

const primaryButtonStyle = {
  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  color: '#fff',
  border: 'none',
  padding: '12px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '14px',
  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
};

const secondaryButtonStyle = {
  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px'
};

const modalContentStyle = {
  background: 'rgba(30, 41, 59, 0.88)', backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '20px',
  padding: '25px', width: '100%', maxWidth: '480px', maxHeight: '90vh',
  overflowY: 'auto', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
  textAlign: 'right'
};

const closeBtnStyle = {
  position: 'absolute', top: '15px', left: '15px', background: 'rgba(255,255,255,0.1)',
  color: '#fff', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold'
};

export default WorkHours;