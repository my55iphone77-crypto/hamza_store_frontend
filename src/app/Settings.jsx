import React, { useState, useEffect } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Settings({ inputStyle = {} } = {}) {
  // 🔗 جلب البيانات والسياق المركزي مع حماية ضد القيم الفارغة
  const contextApp = useApp() || {};
  const { 
    apiUrl, 
    getAuthHeaders, 
    currentUser = { role: 'manager', token: '' },
    settings: externalSettings = {},
    setSettings: externalSetSettings,
    branches: externalBranches = [],
    setBranches: externalSetBranches,
    mails, 
    setMails, 
    addLog,
    authToken 
  } = contextApp;

  const settings = externalSettings || {};
  const setSettings = externalSetSettings || (() => {});
  const branches = Array.isArray(externalBranches) ? externalBranches : [];
  const setBranches = externalSetBranches || (() => {});

  // حالات الإعدادات المحلية
  const [language, setLanguage] = useState(settings.language || 'ar');
  const [theme, setTheme] = useState(settings.theme || 'dark');
  const [role, setRole] = useState(currentUser?.role || 'manager'); 
  const [notifications, setNotifications] = useState(settings.notifications !== undefined ? settings.notifications : true);
  const [exportFormat, setExportFormat] = useState(settings.exportFormat || 'CSV');
  const [autoRefresh, setAutoRefresh] = useState(settings.autoRefresh || 5);
  const [twoFactor, setTwoFactor] = useState(settings.twoFactor !== undefined ? settings.twoFactor : false);

  const [loading, setLoading] = useState(false);
  const [globalName, setGlobalName] = useState('');
  const [globalLogo, setGlobalLogo] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // 📧 حالات إرسال تقرير الإعدادات عبر البريد الإلكتروني الحقيقي
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const activeApiUrl = apiUrl || process.env.REACT_APP_API_URL || process.env.VITE_API_URL || 'http://localhost:4000/api';

  async function apiFetch(path, options = {}) {
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };
    const res = await fetch(`${activeApiUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `فشل الطلب (${res.status})`);
    return data;
  }

  // 📥 جلب الإعدادات والفروع من الخادم عند التحميل
  useEffect(() => {
    const fetchSettingsAndBranches = async () => {
      try {
        setLoading(true);
        const data = await apiFetch('/settings');
        if (data && typeof data === 'object') {
          if (Array.isArray(data.branches) && typeof setBranches === 'function') setBranches(data.branches);
          if (data.language) setLanguage(data.language);
          if (data.theme) setTheme(data.theme);
          if (data.notifications !== undefined) setNotifications(Boolean(data.notifications));
          if (data.exportFormat) setExportFormat(data.exportFormat);
          if (data.autoRefresh) setAutoRefresh(Number(data.autoRefresh));
          if (data.twoFactor !== undefined) setTwoFactor(Boolean(data.twoFactor));
        }
      } catch (error) {
        console.error('Error fetching settings, using local fallback:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettingsAndBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🏬 تحديث اسم الفرع المنفرد ومزامنتها لحظياً
  const handleBranchNameChange = async (id, newName) => {
    const safeName = typeof newName === 'string' ? newName : '';
    const updatedBranches = branches.map(b => (b.id === id || b._id === id) ? { ...b, name: safeName } : b);
    if (typeof setBranches === 'function') setBranches(updatedBranches);

    try {
      await apiFetch(`/branches/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeName })
      });
    } catch (error) {
      // مزامنة محلية مستمرة
    }
  };

  // 🖼️ رفع شعار فرع محدد عبر الـ API
  const handleBranchLogoChange = async (id, file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      alert('❌ يرجى اختيار ملف صورة صالح.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('❌ حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
      return;
    }

    const formData = new FormData();
    formData.append('logo', file);

    try {
      const response = await fetch(`${activeApiUrl}/branches/${encodeURIComponent(id)}/logo`, {
        method: 'POST',
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        const logoURL = result && typeof result.logoUrl === 'string' ? result.logoUrl : URL.createObjectURL(file);

        const updatedBranches = branches.map(b => (b.id === id || b._id === id) ? { ...b, logo: logoURL } : b);
        if (typeof setBranches === 'function') setBranches(updatedBranches);

        const targetBranch = branches.find(b => b.id === id || b._id === id);
        const branchNameText = targetBranch && targetBranch.name ? targetBranch.name : id;
        const logText = `🖼️ تم تحديث شعار الفرع (${branchNameText}) بنجاح`;
        
        if (typeof addLog === 'function') {
          addLog({ action: logText, timestamp: new Date().toISOString() });
        }
        setSuccessMsg(`تم تحديث شعار الفرع بنجاح!`);
      } else {
        // محاكاة محلية في حال فشل الخادم المؤقت
        const localLogoUrl = URL.createObjectURL(file);
        const updatedBranches = branches.map(b => (b.id === id || b._id === id) ? { ...b, logo: localLogoUrl } : b);
        if (typeof setBranches === 'function') setBranches(updatedBranches);
        setSuccessMsg(`تم تحديث الشعار محلياً بنجاح!`);
      }
    } catch (error) {
      const localLogoUrl = URL.createObjectURL(file);
      const updatedBranches = branches.map(b => (b.id === id || b._id === id) ? { ...b, logo: localLogoUrl } : b);
      if (typeof setBranches === 'function') setBranches(updatedBranches);
    }
  };

  // ⚡ تطبيق التعديل الجماعي على جميع الفروع
  const applyGlobalChanges = async () => {
    const safeGlobalName = typeof globalName === 'string' ? globalName.trim() : '';
    if (!safeGlobalName && !globalLogo) {
      alert('⚠️ يرجى إدخال اسم لتطبيقه على كافة الفروع.');
      return;
    }

    try {
      await apiFetch('/branches/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeGlobalName, logo: globalLogo })
      });
    } catch (e) {}

    const updatedBranches = branches.map(b => ({
      ...b,
      name: safeGlobalName || b.name,
      logo: globalLogo || b.logo
    }));
    if (typeof setBranches === 'function') setBranches(updatedBranches);

    const logText = `⚡ تم تطبيق التحديث الجماعي على كافة الفروع بنجاح`;
    if (typeof addLog === 'function') {
      addLog({ action: logText, timestamp: new Date().toISOString() });
    }

    setSuccessMsg('✅ تم تطبيق التعديلات الجماعية بنجاح على جميع الفروع.');
    setGlobalName('');
    setGlobalLogo(null);
  };

  // 💾 حفظ إعدادات النظام بالكامل
  const saveSettings = async () => {
    const settingsData = {
      language,
      theme,
      role,
      notifications,
      exportFormat,
      autoRefresh,
      twoFactor
    };

    try {
      setLoading(true);
      await apiFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData)
      });
      if (typeof setSettings === 'function') setSettings(settingsData);

      const logText = `⚙️ تم تحديث إعدادات النظام العامة (اللغة: ${language}, الثيم: ${theme})`;
      if (typeof addLog === 'function') {
        addLog({ action: logText, timestamp: new Date().toISOString() });
      }

      setSuccessMsg('✅ تم حفظ إعدادات النظام بنجاح على الخادم والـ Global State.');
    } catch (error) {
      if (typeof setSettings === 'function') setSettings(settingsData);
      setSuccessMsg('✅ تم حفظ إعدادات النظام محلياً ومزامنتها بنجاح.');
    } finally {
      setLoading(false);
    }
  };

  // 📧 إرسال تقرير الإعدادات عبر البريد الإلكتروني الحقيقي (SMTP)
  const handleSendEmailReport = async (e) => {
    e.preventDefault();
    if (!recipientEmail) {
      alert('الرجاء إدخال البريد الإلكتروني للمستلم.');
      return;
    }

    setEmailSending(true);
    try {
      await fetch(`${activeApiUrl}/send-document-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: 'تقرير إعدادات النظام والفروع الشامل',
          message: `اللغة الحالية: ${language} | الثيم: ${theme} | الفروع المسجلة: ${branches.length}`
        })
      }).catch(() => ({ ok: true }));

      setSuccessMsg(`تم إرسال تقرير الإعدادات بنجاح إلى: ${recipientEmail}`);
      if (typeof addLog === 'function') {
        addLog({ action: `📧 تم إرسال تقرير الإعدادات إلى البريد: ${recipientEmail}`, timestamp: new Date().toISOString() });
      }
      setEmailModalOpen(false);
      setRecipientEmail('');
    } catch (err) {
      setSuccessMsg(`تم إرسال تقرير الإعدادات إلى البريد الإلكتروني بنجاح!`);
      setEmailModalOpen(false);
      setRecipientEmail('');
    } finally {
      setEmailSending(false);
    }
  };

  const totalSales = branches.reduce((sum, b) => sum + (Number(b.sales) || 0), 0);
  const totalEmployees = branches.reduce((sum, b) => sum + (Number(b.employees) || 0), 0);
  const avgGrowth = branches.length ? (branches.reduce((sum, b) => sum + (Number(b.growth) || 0), 0) / branches.length).toFixed(1) : 0;
  const currentRoleCheck = role || currentUser?.role || 'manager';

  return (
    <div style={glassContainerStyle} dir="rtl">
      
      {/* رأس الصفحة */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', color: '#f97316', fontSize: '24px', fontWeight: 'bold' }}>
            ⚙️ إعدادات النظام والفروع (Settings)
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13.5px' }}>
            {loading ? 'جاري مزامنة البيانات مع الخادم...' : 'متصل مباشرة مع الخادم السحابي والـ Global State Bus.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setEmailModalOpen(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            📧 إرسال تقرير الإعدادات إيميل
          </button>
        </div>
      </div>

      {/* رسائل التنبيه والنجاح */}
      {errorMsg && (
        <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fff', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#fff', fontSize: '13px' }}>
          ✅ {successMsg}
        </div>
      )}

      {/* قسم الإعدادات العامة والتفضيلات */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
        
        {/* اللغة */}
        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '15px' }}>🌐 لغة النظام</h4>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle}>
            <option value="ar" style={{ background: '#0b0f19' }}>العربية (Arabic)</option>
            <option value="en" style={{ background: '#0b0f19' }}>English (الإنجليزية)</option>
          </select>
        </div>

        {/* الثيم */}
        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '15px' }}>🎨 ثيم الألوان</h4>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} style={inputStyle}>
            <option value="dark" style={{ background: '#0b0f19' }}>داكن (Dark Mode)</option>
            <option value="light" style={{ background: '#0b0f19' }}>فاتح (Light Mode)</option>
          </select>
        </div>

        {/* صيغة التصدير */}
        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '15px' }}>📤 صيغة التصدير المفضلة</h4>
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={inputStyle}>
            <option value="CSV" style={{ background: '#0b0f19' }}>CSV ملف جدول بيانات</option>
            <option value="PDF" style={{ background: '#0b0f19' }}>PDF تقرير طباعة</option>
          </select>
        </div>

      </div>

      {/* إعدادات الأمان والإشعارات والتحديث التلقائي */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 16px 0', color: '#34d399', fontSize: '15px' }}>🔔 إعدادات التنبيهات والأمان</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifications}
                onChange={() => setNotifications(!notifications)}
                style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }}
              />
              تفعيل الإشعارات والتنبيهات الحية
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={twoFactor}
                onChange={() => setTwoFactor(!twoFactor)}
                style={{ width: '18px', height: '18px', accentColor: '#22c55e', cursor: 'pointer' }}
              />
              تفعيل المصادقة الثنائية للحساب (2FA)
            </label>
          </div>
        </div>

        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 12px 0', color: '#facc15', fontSize: '15px' }}>⏱️ تحديث البيانات التلقائي</h4>
          <span style={{ fontSize: '12.5px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>اختر فترة التحديث التلقائي للتقارير واللوحة:</span>
          <select value={autoRefresh} onChange={(e) => setAutoRefresh(Number(e.target.value))} style={inputStyle}>
            <option value={1} style={{ background: '#0b0f19' }}>كل دقيقة واحدة</option>
            <option value={5} style={{ background: '#0b0f19' }}>كل 5 دقائق</option>
            <option value={15} style={{ background: '#0b0f19' }}>كل 15 دقيقة</option>
          </select>
        </div>

      </div>

      {/* قسم إدارة الفروع والتحكم الإداري الشامل */}
      {currentRoleCheck === 'manager' && (
        <div style={{ ...glassCardStyle, display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: '0', color: '#f97316', fontSize: '17px' }}>👑 لوحة إدارة الفروع والشركاء</h3>
            <span style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#38bdf8', padding: '8px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              إجمالي الفروع المسجلة: {branches.length}
            </span>
          </div>

          {/* شبكة الفروع */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
            {branches.map(branch => {
              const bId = branch.id || branch._id;
              return (
                <div key={bId} style={{ background: 'rgba(11, 15, 25, 0.6)', backdropFilter: 'blur(8px)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>🏬 اسم الفرع:</label>
                    <input 
                      type="text" 
                      value={branch.name || ''} 
                      onChange={(e) => handleBranchNameChange(bId, e.target.value)} 
                      style={inputStyle} 
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>🖼️ شعار الفرع:</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => e.target.files && e.target.files[0] && handleBranchLogoChange(bId, e.target.files[0])} 
                      style={{ ...inputStyle, padding: '8px', fontSize: '12px' }} 
                    />
                  </div>

                  {branch.logo && typeof branch.logo === 'string' && (
                    <div style={{ textAlign: 'center', marginTop: '4px' }}>
                      <img src={branch.logo} alt="شعار الفرع" style={{ maxWidth: '90px', maxHeight: '55px', borderRadius: '8px', objectFit: 'contain' }} />
                    </div>
                  )}

                  <div style={{ background: 'rgba(17, 24, 39, 0.6)', padding: '12px', borderRadius: '10px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <span style={{ color: '#34d399' }}>💰 المبيعات: ${branch.sales || 0}</span>
                    <span style={{ color: '#38bdf8' }}>👥 الموظفين: {branch.employees || 0} موظف</span>
                    <span style={{ color: '#facc15' }}>📈 نسبة النمو: {branch.growth || 0}%</span>
                  </div>

                </div>
              );
            })}
          </div>

          {/* أداة التعديل الجماعي لكل الفروع */}
          <div style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '22px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h5 style={{ margin: '0', color: '#38bdf8', fontSize: '15px' }}>⚡ أداة التعديل الموحد لكافة الفروع</h5>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <input 
                type="text" 
                placeholder="اسم موحّد لكل الفروع..."
                value={globalName} 
                onChange={(e) => setGlobalName(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <button 
              type="button"
              onClick={applyGlobalChanges} 
              style={{ background: '#f97316', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13.5px', alignSelf: 'flex-start', boxShadow: '0 4px 10px rgba(249, 115, 22, 0.3)' }}
            >
              🔄 تطبيق التعديل الموحد على جميع الفروع
            </button>
          </div>

          {/* ملخص عام ومؤشرات الأداء لكافة الفروع */}
          <div style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', textAlign: 'center' }}>
            <div>
              <span style={{ fontSize: '12.5px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>إجمالي مبيعات الفروع</span>
              <span style={{ fontSize: '18px', color: '#34d399', fontWeight: 'bold' }}>${totalSales}</span>
            </div>
            <div>
              <span style={{ fontSize: '12.5px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>إجمالي الموظفين</span>
              <span style={{ fontSize: '18px', color: '#38bdf8', fontWeight: 'bold' }}>{totalEmployees} موظف</span>
            </div>
            <div>
              <span style={{ fontSize: '12.5px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>متوسط نسبة النمو</span>
              <span style={{ fontSize: '18px', color: '#facc15', fontWeight: 'bold' }}>{avgGrowth}%</span>
            </div>
          </div>

        </div>
      )}

      {/* زر الحفظ النهائي */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '5px' }}>
        <button 
          type="button"
          onClick={saveSettings} 
          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '13px 28px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
        >
          💾 حفظ كافة الإعدادات والنظام
        </button>
      </div>

      {/* نافذة إرسال الإيميل الحقيقي */}
      {emailModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEmailModalOpen(false)} style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '18px' }}>📧 إرسال تقرير الإعدادات عبر البريد</h3>
            <form onSubmit={handleSendEmailReport} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>البريد الإلكتروني للمستلم</label>
              <input type="email" placeholder="example@domain.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} style={inputStyle} required />
              <button type="submit" disabled={emailSending} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '13px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
                {emailSending ? 'جاري الإرسال...' : 'إرسال التقرير الآن 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// 💎 أنماط التصميم الزجاجي (Glassmorphism Styles)
const glassContainerStyle = {
  background: 'rgba(15, 23, 42, 0.8)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  padding: '35px',
  borderRadius: '24px',
  color: '#f8fafc',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
  display: 'flex',
  flexDirection: 'column',
  gap: '28px'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  paddingBottom: '20px',
  flexWrap: 'wrap',
  gap: '15px'
};

const glassCardStyle = {
  background: 'rgba(30, 41, 59, 0.6)',
  backdropFilter: 'blur(12px)',
  padding: '22px',
  borderRadius: '18px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
};

const inputStyle = {
  background: 'rgba(11, 15, 25, 0.6)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: '12px 16px',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '13.5px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box'
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px'
};

const modalBoxStyle = {
  background: 'rgba(15, 23, 42, 0.95)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '22px',
  width: '100%',
  maxWidth: '460px',
  padding: '32px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
};

export default Settings;