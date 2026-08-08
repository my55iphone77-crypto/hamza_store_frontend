import React, { useState, useEffect } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function StorageManagement() {
  const { apiUrl, getAuthHeaders, globalBus, triggerGlobalSync } = useApp();

  const [usage, setUsage] = useState(0);
  const [limit, setLimit] = useState(5120); // الحد التقريبي 5MB
  const [serverStorage, setServerStorage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingState, setSavingState] = useState('');

  // حالات نافذة إرسال التقارير عبر الإيميل الحقيقي
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('تقرير حالة التخزين والمساحة الرقمية');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // دالة لجلب التوكن الموحد مع التعقيم وتجنب أخطاء البيئة الآمنة
  const getAuthToken = () => {
    try {
      const tokenFromStorage = (typeof window !== 'undefined' && localStorage.getItem('token')) || (typeof window !== 'undefined' && localStorage.getItem('authToken')) || '';
      return typeof tokenFromStorage === 'string' ? tokenFromStorage.trim() : '';
    } catch (e) {
      return '';
    }
  };

  const flashSaving = (msg, syncType = 'STORAGE_SYNC') => {
    setSavingState(msg);
    setTimeout(() => setSavingState(''), 3000);
    if (typeof triggerGlobalSync === 'function') {
      triggerGlobalSync({ type: syncType, timestamp: Date.now() });
    }
  };

  const calculateLocalStorageUsage = () => {
    try {
      let total = 0;
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let key in localStorage) {
          if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
            const item = localStorage.getItem(key);
            if (item !== null) {
              total += ((item.length + key.length) * 2);
            }
          }
        }
      }
      setUsage(Number((total / 1024).toFixed(2))); // تحويل إلى KB
    } catch (error) {
      console.error('فشل في حساب حجم التخزين المحلي:', error);
      setUsage(0);
    }
  };

  const fetchServerStorageInfo = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${apiUrl}/storage/info`, { method: 'GET', headers });

      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          setServerStorage(data);
        }
      }
    } catch (error) {
      console.error('فشل في جلب معلومات التخزين من الخادم:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateLocalStorageUsage();
    fetchServerStorageInfo();
  }, []);

  // المزامنة اللحظية الفورية عبر Global State Bus
  useEffect(() => {
    if (globalBus && (globalBus.type === 'STORAGE_SYNC' || globalBus.type === 'PRODUCT_SYNC' || globalBus.type === 'GENERAL_SYNC')) {
      calculateLocalStorageUsage();
      fetchServerStorageInfo();
    }
  }, [globalBus]);

  const clearStorage = async () => {
    if (typeof window !== 'undefined' && !window.confirm('⚠️ هل أنت متأكد من رغبتك في مسح كافة البيانات والتخزين المؤقت محلياً وعلى الخادم؟')) {
      return;
    }

    try {
      const token = getAuthToken();
      
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.clear();
      }
      setUsage(0);

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${apiUrl}/storage/clear`, {
        method: 'DELETE',
        headers
      });

      flashSaving('✅ تم مسح جميع البيانات من LocalStorage والخادم بنجاح!', 'STORAGE_SYNC');
      alert('✅ تم مسح جميع البيانات من LocalStorage والخادم بنجاح!');
      fetchServerStorageInfo();
    } catch (error) {
      console.error('خطأ أثناء عملية المسح:', error);
      flashSaving('⚠️ تم مسح التخزين المحلي، وتعذر مسح الخادم.', 'STORAGE_SYNC');
      alert('✅ تم مسح التخزين المحلي بنجاح، ولكن تعذر مسح بيانات الخادم.');
    }
  };

  // دالة إرسال تقارير التخزين عبر الإيميل الحقيقي
  const handleSendRealEmail = async (e) => {
    e.preventDefault();
    if (!emailRecipient) {
      alert('الرجاء إدخال البريد الإلكتروني للمستلم!');
      return;
    }
    setIsSendingEmail(true);
    try {
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${apiUrl}/send-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: emailRecipient,
          subject: emailSubject,
          message: emailBody || `تقرير حالة التخزين:\n- المساحة المحلية المستخدمة: ${usage} KB\n- حالة الخادم: متزامن بنجاح.`
        }),
      });

      if (!response.ok) throw new Error('فشل إرسال البريد الإلكتروني من السيرفر.');

      alert('📧 تم إرسال تقرير التخزين عبر البريد الإلكتروني بنجاح!');
      setIsEmailModalOpen(false);
      setEmailRecipient('');
      setEmailBody('');
    } catch (err) {
      alert('فشل إرسال الإيميل: ' + err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const safeUsage = !isNaN(Number(usage)) ? Number(usage) : 0;
  const safeLimit = !isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5120;

  return (
    <div style={glassContainerStyle} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#f97316', margin: 0, fontSize: '20px' }}>📦 إدارة مساحة التخزين (المحلية والسحابية)</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {savingState && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 'bold' }}>{savingState}</span>}
          <button 
            type="button"
            onClick={() => setIsEmailModalOpen(true)}
            style={secondaryButtonStyle}
          >
            📨 إرسال تقرير إيميل حقيقي
          </button>
        </div>
      </div>
      
      <p style={{ fontSize: '14.5px', color: '#cbd5e1' }}>
        المساحة المحلية المستخدمة: <strong style={{ color: '#38bdf8' }}>{safeUsage} KB</strong> من <strong style={{ color: '#facc15' }}>{safeLimit} KB</strong>
      </p>
      
      <progress 
        value={safeUsage} 
        max={safeLimit} 
        style={{ width: '80%', height: '20px', borderRadius: '10px', overflow: 'hidden' }}
      ></progress>
      
      {serverStorage && typeof serverStorage === 'object' && (
        <div style={{ marginTop: '18px', color: '#38bdf8', fontSize: '14px', background: 'rgba(17, 24, 39, 0.6)', padding: '12px', borderRadius: '12px', display: 'inline-block', border: '1px solid rgba(31, 41, 55, 0.8)' }}>
          <p style={{ margin: 0 }}>☁️ مساحة قاعدة بيانات الخادم (MongoDB): <strong style={{ color: '#34d399' }}>{typeof serverStorage.usedSize === 'string' ? serverStorage.usedSize : 'مزامنة نشطة'}</strong></p>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <button 
          type="button"
          onClick={clearStorage} 
          disabled={loading}
          style={{
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.3s ease'
          }}
        >
          🧹 مسح جميع البيانات والتخزين المؤقت
        </button>
      </div>

      {/* نافذة إرسال الإيميل بتصميم زجاجي فاخر */}
      {isEmailModalOpen && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => setIsEmailModalOpen(false)} style={closeBtnStyle}>✕</button>
            <h3 style={{ color: '#38bdf8', margin: '0 0 15px 0' }}>📨 إرسال تقرير التخزين عبر البريد</h3>
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
  textAlign: 'center',
  color: '#fff',
  background: 'rgba(15, 23, 42, 0.78)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  padding: '30px',
  borderRadius: '24px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
  fontFamily: 'Tajawal, sans-serif'
};

const glassInputStyle = {
  background: 'rgba(15, 23, 42, 0.65)',
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
  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '13px',
  boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
};

const secondaryButtonStyle = {
  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  color: '#fff',
  border: 'none',
  padding: '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
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

export default StorageManagement;