import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Announcements({ inputStyle = {} }) {
  const fullBleedStyle = useFullBleedStyle();
  const contextData = useApp() || {};
  const { 
    token, apiUrl, apiRequest, getAuthHeaders,
    employees = [], customers = [],
    announcements = [], setAnnouncements = () => {},
    mails = [], setMails = () => {},
    currentUser = { role: 'admin', name: 'المدير العام' },
    hasPermission = () => true
  } = contextData;

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [audience, setAudience] = useState('employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const safeAnnouncements = Array.isArray(announcements) ? announcements : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const getGlassEmailTemplate = (title, contentHtml) => `
    <div style="font-family: 'Tajawal', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px; direction: rtl; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-top: 0;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.8; color: #cbd5e1;">${contentHtml}</div>
        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b; text-align: center;">
          نظام إدارة المتجر الذكي &bull; ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    </div>
  `;

  const secureApiRequest = useCallback(async (endpoint, method = 'GET', body = null) => {
    if (typeof apiRequest === 'function') {
      return apiRequest(endpoint, method, body);
    }
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await fetch(`${apiUrl || ''}${endpoint}`, {
      method, headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json().catch(() => ({}));
  }, [apiRequest, getAuthHeaders, apiUrl, token]);

  const fetchAnnouncementsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const annRes = await secureApiRequest('/announcements', 'GET');
      if (annRes && typeof setAnnouncements === 'function') {
        setAnnouncements(Array.isArray(annRes) ? annRes : (annRes.announcements || []));
      }
    } catch (err) {
      console.error("خطأ في جلب الإعلانات:", err?.message || err);
    } finally {
      setIsLoading(false);
    }
  }, [secureApiRequest, setAnnouncements]);

  useEffect(() => {
    fetchAnnouncementsData();
  }, [fetchAnnouncementsData]);

  const sendInternalMail = async (to, subject, bodyText) => {
    try {
      const response = await secureApiRequest("/mails", "POST", {
        sender: currentUser?.name || "النظام المركزي", recipient: to, subject, body: bodyText, read: false
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

  const handleAddAnnouncement = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newMessage.trim()) {
      setStatusMessage('⚠️ يرجى تعبئة عنوان ومحتوى الإعلان.');
      return;
    }
    if (typeof hasPermission === 'function' && !hasPermission('send_marketing')) {
      setStatusMessage('⛔ لا تملك الصلاحية لنشر الإعلانات.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('جاري نشر الإعلان...');

    const newAnn = {
      title: newTitle.trim(),
      message: newMessage.trim(),
      date: new Date().toISOString(),
      audience
    };

    try {
      const response = await secureApiRequest('/announcements', 'POST', newAnn);
      const savedAnnouncement = response.announcement || response || { id: Date.now(), ...newAnn };
      if (typeof setAnnouncements === 'function') {
        setAnnouncements(prev => [...(Array.isArray(prev) ? prev : []), savedAnnouncement]);
      }

      const tasks = [];
      if (audience === "employees") {
        safeEmployees.forEach(emp => tasks.push(sendInternalMail(emp.name || "موظف", `📢 إعلان: ${newTitle}`, newMessage)));
      } else if (audience === "customers") {
        safeCustomers.forEach(cust => {
          tasks.push(sendInternalMail(cust.name || "عميل", `📢 إعلان: ${newTitle}`, newMessage));
          if (cust.email) tasks.push(sendExternalMail(cust.email, `📢 إعلان: ${newTitle}`, newMessage));
        });
      } else if (audience === "managers") {
        safeEmployees.filter(emp => emp.role === 'manager' || emp.role === 'admin').forEach(mgr => {
          tasks.push(sendInternalMail(mgr.name || "مدير", `📢 إعلان إداري: ${newTitle}`, newMessage));
          if (mgr.email) tasks.push(sendExternalMail(mgr.email, `📢 إعلان إداري: ${newTitle}`, newMessage));
        });
      } else if (audience === "all") {
        safeEmployees.forEach(emp => tasks.push(sendInternalMail(emp.name || "موظف", `📢 إعلان عام`, newMessage)));
        safeCustomers.forEach(cust => {
          tasks.push(sendInternalMail(cust.name || "عميل", `📢 إعلان عام`, newMessage));
          if (cust.email) tasks.push(sendExternalMail(cust.email, `📢 إعلان عام: ${newTitle}`, newMessage));
        });
      }

      await Promise.allSettled(tasks);
      setNewTitle('');
      setNewMessage('');
      setStatusMessage('✅ تم نشر الإعلان بنجاح!');
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err) {
      console.error("خطأ:", err?.message || err);
      setStatusMessage('❌ فشل في نشر الإعلان.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAnnouncements = safeAnnouncements.filter(a => {
    if (!a) return false;
    const q = (searchTerm || '').toLowerCase();
    return (a.title || '').toLowerCase().includes(q) || (a.message || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '30px', color: '#fff', fontFamily: 'Tajawal, sans-serif', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', ...fullBleedStyle }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '20px', fontWeight: 'bold' }}>📢 إدارة الإعلانات والتنبيهات المركزية</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>مربوطة مع السيرفر وقوالب البريد الزجاجي</p>
        </div>
        <button type="button" onClick={fetchAnnouncementsData} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
          تحديث البيانات 🔄
        </button>
      </div>

      {statusMessage && (
        <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', color: '#38bdf8' }}>
          {statusMessage}
        </div>
      )}

      <input type="text" placeholder="🔍 ابحث في الإعلانات..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
        style={{ marginBottom: '18px', width: '100%', boxSizing: 'border-box', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '8px', color: '#fff', fontFamily: 'Tajawal, sans-serif', fontSize: '13px' }} />

      <form onSubmit={handleAddAnnouncement} style={{ display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="عنوان الإعلان..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
          style={{ flex: 1, minWidth: '160px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '8px', color: '#fff', fontFamily: 'Tajawal, sans-serif', fontSize: '13px' }} />
        <input type="text" placeholder="محتوى الإعلان..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
          style={{ flex: 2, minWidth: '220px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '8px', color: '#fff', fontFamily: 'Tajawal, sans-serif', fontSize: '13px' }} />
        <select value={audience} onChange={(e) => setAudience(e.target.value)}
          style={{ minWidth: '150px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '8px', color: '#fff', fontFamily: 'Tajawal, sans-serif', fontSize: '13px' }}>
          <option value="employees">👥 الموظفين ({safeEmployees.length})</option>
          <option value="customers">🧑‍💼 العملاء ({safeCustomers.length})</option>
          <option value="managers">📊 المدراء</option>
          <option value="all">🌍 الجميع</option>
        </select>
        <button type="submit" disabled={isSubmitting}
          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', opacity: isSubmitting ? 0.7 : 1 }}>
          {isSubmitting ? 'جاري النشر...' : 'نشر الإعلان ➕'}
        </button>
      </form>

      {isLoading ? (
        <p style={{ color: '#38bdf8', textAlign: 'center', padding: '25px' }}>جاري التحميل...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredAnnouncements.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>لا توجد إعلانات مطابقة</p>
          ) : (
            filteredAnnouncements.map((a, index) => (
              <div key={a.id || index} style={{ background: 'rgba(17, 24, 39, 0.7)', backdropFilter: 'blur(12px)', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#38bdf8', fontSize: '12px' }}>📅 {a.date ? new Date(a.date).toLocaleString('ar-EG') : "وقت غير محدد"}</span>
                    <strong style={{ color: '#f8fafc', fontSize: '15px' }}>{a.title}</strong>
                    <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      الجمهور: {a.audience}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: '14px', lineHeight: '1.5' }}>📝 {a.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default Announcements;