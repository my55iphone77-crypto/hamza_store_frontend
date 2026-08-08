import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

const STATUS = {
  PENDING: 'قيد المراجعة',
  IN_PROGRESS: 'قيد المعالجة',
  DONE: 'تم الرد',
  ESCALATED: 'محولة للإدارة',
};

const PRIORITY = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  CRITICAL: 'حرجة',
};

function CustomerService({
  inputStyle = {},
  currentUser: propCurrentUser = { name: 'موظف حالي', role: 'موظف' },
}) {
  const context = useApp() || {};
  const {
    apiRequest,
    customers: contextCustomers = [],
    setMails: setContextMails,
    requests: contextRequests,
    setRequests: setContextRequests,
  } = context;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [issue, setIssue] = useState('');
  const [complaintType, setComplaintType] = useState('service');
  const [priority, setPriority] = useState('medium');
  const [fieldErrors, setFieldErrors] = useState({});

  const [responseInputs, setResponseInputs] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [trackPhone, setTrackPhone] = useState('');
  const [trackedRequest, setTrackedRequest] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [showStats, setShowStats] = useState(true);

  const safeCustomers = Array.isArray(contextCustomers) ? contextCustomers : [];

  // المزامنة اللحظية مع الـ Context
  useEffect(() => {
    if (Array.isArray(contextRequests)) {
      setRequests(contextRequests);
    }
  }, [contextRequests]);

  const fetchRequests = useCallback(async () => {
    if (!apiRequest) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await apiRequest('/requests', 'GET');
      const fetchedData = Array.isArray(data) ? data : (data?.items || data?.requests || []);
      setRequests(fetchedData);
      if (typeof setContextRequests === 'function') {
        setContextRequests(fetchedData);
      }
    } catch (err) {
      console.error('Failed to fetch requests', err);
      setErrorMsg('تعذّر تحميل الطلبات من السيرفر. تحقق من الاتصال وحاول مجددًا.');
    } finally {
      setLoading(false);
    }
  }, [apiRequest, setContextRequests]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // إرسال البريد الداخلي
  const sendInternalMail = async (to, subject, body) => {
    const safeSender = (propCurrentUser && propCurrentUser.name) ? propCurrentUser.name : 'نظام خدمة العملاء';
    const mail = {
      sender: safeSender,
      recipient: to,
      subject,
      body,
      read: false,
      date: new Date().toISOString(),
    };
    try {
      let savedMail;
      if (apiRequest) {
        const data = await apiRequest('/mails', 'POST', mail);
        savedMail = data || mail;
      } else {
        savedMail = mail;
      }
      if (typeof setContextMails === 'function') {
        setContextMails((prev) => [...(Array.isArray(prev) ? prev : []), savedMail]);
      }
    } catch (err) {
      console.error('Failed to send internal mail', err);
    }
  };

  // إرسال البريد الخارجي
  const sendExternalMail = async (to, subject, body) => {
    if (!to) return;
    try {
      if (apiRequest) {
        await apiRequest('/sendExternalMail', 'POST', { to, subject, body });
      } else {
        console.log(`[Mock External Mail] To: ${to} | Subject: ${subject}`);
      }
    } catch (err) {
      console.error('Error sending external mail', err);
    }
  };

  const validateForm = () => {
    const errors = {};
    const trimmedName = typeof customerName === 'string' ? customerName.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedLocation = typeof location === 'string' ? location.trim() : '';
    const trimmedIssue = typeof issue === 'string' ? issue.trim() : '';

    if (!trimmedName) errors.customerName = 'هذا الحقل مطلوب';
    if (!trimmedPhone) errors.phone = 'هذا الحقل مطلوب';
    if (!trimmedLocation) errors.location = 'هذا الحقل مطلوب';
    if (!trimmedIssue) errors.issue = 'يرجى كتابة تفاصيل المشكلة';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const analyzeIssueWithAI = (text) => {
    if (typeof text !== 'string') return { isCritical: false, category: 'عام', priority: 'medium' };
    const criticalKeywords = ['احتيال', 'سرقة', 'قضية', 'محكمة', 'توقف تام', 'دمار', 'خسارة كبيرة', 'فشل ذريع', 'كارثة', 'تهديد', 'خطير جداً', 'عطل شامل', 'احتجاز', 'بلاغ أمني'];
    const isCritical = criticalKeywords.some(keyword => text.includes(keyword)) || text.length > 200;

    let category = 'استفسار';
    if (text.includes('شكوى') || text.includes('مشكلة') || text.includes('عطل')) category = 'شكوى فنية';
    else if (text.includes('استرجاع') || text.includes('إرجاع') || text.includes('استبدال')) category = 'استرجاع/استبدال';
    else if (text.includes('فاتورة') || text.includes('دفع') || text.includes('سعر')) category = 'فواتير ومدفوعات';
    else if (text.includes('توصيل') || text.includes('شحن') || text.includes('طلب')) category = 'الشحن والتوصيل';

    let detectedPriority = 'medium';
    if (isCritical) detectedPriority = 'critical';
    else if (text.includes('عاجل') || text.includes('فوري') || text.includes('ضروري')) detectedPriority = 'high';

    return { isCritical, category, priority: detectedPriority };
  };

  const addRequest = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!validateForm()) return;

    const trimmedName = typeof customerName === 'string' ? customerName.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedLocation = typeof location === 'string' ? location.trim() : '';
    const trimmedIssue = typeof issue === 'string' ? issue.trim() : '';

    const matchedCustomer = safeCustomers.find(
      (c) => c && (c.name === trimmedName || c.phone === trimmedPhone)
    );
    const customerEmail = matchedCustomer ? matchedCustomer.email : null;

    const aiAnalysis = analyzeIssueWithAI(trimmedIssue);
    let finalComplaintType = complaintType;
    let targetDestination = 'خدمة العملاء';
    let initialStatus = STATUS.PENDING;
    let aiResponse = '';
    let finalPriority = priority;

    if (aiAnalysis.isCritical) {
      finalComplaintType = 'manager_complaint';
      targetDestination = 'المدير العام (شكوى كبرى حرجة)';
      aiResponse = '🚨 قام النظام بتحليل المشكلة وتبين أنها "حرجة"، وتم تحويلها مباشرة إلى الإدارة العليا للتدخل الفوري.';
      initialStatus = STATUS.ESCALATED;
      finalPriority = 'critical';
    } else {
      aiResponse = `🤖 تم تحليل المشكلة وتصنيفها كـ "${aiAnalysis.category}" بأولوية ${PRIORITY[finalPriority.toUpperCase()] || 'متوسطة'}. جارٍ اعتماد الحل القياسي.`;
      initialStatus = STATUS.PENDING;
    }

    const payload = {
      id: 'req_' + Date.now(),
      customerName: trimmedName,
      phone: trimmedPhone,
      location: trimmedLocation,
      issue: trimmedIssue,
      complaintType: finalComplaintType,
      category: aiAnalysis.category,
      priority: finalPriority,
      target: targetDestination,
      status: initialStatus,
      response: aiResponse,
      date: new Date().toISOString(),
      history: [{ action: 'تم الإنشاء', by: propCurrentUser?.name || 'النظام', date: new Date().toISOString() }]
    };

    setSubmitting(true);
    try {
      let createdRequest = payload;
      if (apiRequest) {
        const data = await apiRequest('/requests', 'POST', payload);
        createdRequest = data || payload;
      }

      setRequests((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const updated = [...safePrev, createdRequest];
        if (typeof setContextRequests === 'function') setContextRequests(updated);
        return updated;
      });

      const message = aiAnalysis.isCritical
        ? `🚨 تنبيه عاجل: شكوى حرجة من العميل: ${payload.customerName}\nالتفاصيل: ${payload.issue}\nتم تحويلها إليك مباشرة.`
        : `تم الرد الآلي على طلبك:\nالرد: ${aiResponse}`;

      const recipientTarget = aiAnalysis.isCritical ? 'manager@company.com' : 'customer-service';

      await sendInternalMail(
        recipientTarget,
        aiAnalysis.isCritical ? '🚨 [شكوى حرجة] تتطلب تدخلك الفوري' : '📢 رد آلي على طلب خدمة',
        message
      );

      if (customerEmail) {
        await sendExternalMail(customerEmail, '📋 تحديث بخصوص طلبك', message);
      }

      setCustomerName('');
      setPhone('');
      setLocation('');
      setIssue('');
      setComplaintType('service');
      setPriority('medium');
      setFieldErrors({});
    } catch (err) {
      console.error('Failed to create request', err);
      setErrorMsg('تعذّر إرسال البلاغ إلى السيرفر. يرجى التأكد من تشغيل السيرفر وصحة مسار الـ API.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateRequest = async (id, newStatus, responseText) => {
    if (!id) return;
    setUpdatingId(id);
    setErrorMsg('');
    try {
      let updatedData = { status: newStatus, response: responseText };
      if (apiRequest) {
        const data = await apiRequest(`/requests/${id}`, 'PATCH', updatedData);
        updatedData = data || updatedData;
      }

      setRequests((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const updated = safePrev.map((r) => ((r && (r.id === id || r._id === id)) ? { ...r, ...updatedData, history: [...(r.history || []), { action: `تم التحديث إلى: ${newStatus}`, by: propCurrentUser?.name || 'النظام', date: new Date().toISOString() }] } : r));
        if (typeof setContextRequests === 'function') setContextRequests(updated);
        return updated;
      });

      const target = requests.find((r) => r && (r.id === id || r._id === id));
      const matchedCustomer = safeCustomers.find(
        (c) => c && (c.name === target?.customerName || c.phone === target?.phone)
      );
      const notificationMessage = `تم تحديث حالة طلبك إلى: "${newStatus}".\nالرد الرسمي: "${responseText}"`;

      await sendInternalMail(target?.customerName || 'customer', '🔔 تحديث حالة الطلب', notificationMessage);

      if (matchedCustomer && matchedCustomer.email) {
        await sendExternalMail(matchedCustomer.email, '🔔 رد جديد بخصوص طلبك', notificationMessage);
      }
    } catch (err) {
      console.error('Failed to update request', err);
      setErrorMsg('تعذّر تحديث حالة الطلب على السيرفر.');
    } finally {
      setUpdatingId(null);
    }
  };

  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeSearchTerm = typeof searchTerm === 'string' ? searchTerm.toLowerCase() : '';

  const filteredRequests = safeRequests.filter((r) => {
    if (!r) return false;
    const nameMatch = (r.customerName || '').toLowerCase().includes(safeSearchTerm);
    const issueMatch = (r.issue || '').toLowerCase().includes(safeSearchTerm);
    const locationMatch = (r.location || '').toLowerCase().includes(safeSearchTerm);
    const matchesSearch = nameMatch || issueMatch || locationMatch;
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return r.status === statusFilter;
  });

  const trackRequestByPhone = () => {
    setTrackError('');
    const trimmedTrackPhone = typeof trackPhone === 'string' ? trackPhone.trim() : '';
    const found = safeRequests.find((r) => r && r.phone === trimmedTrackPhone);
    if (!found && trimmedTrackPhone) {
      setTrackError('❌ لا يوجد طلب أو شكوى مسجلة بهذا الرقم');
    }
    setTrackedRequest(found || null);
  };

  const stats = useMemo(() => {
    const total = safeRequests.length;
    const pending = safeRequests.filter((r) => r && r.status === STATUS.PENDING).length;
    const inProgress = safeRequests.filter((r) => r && r.status === STATUS.IN_PROGRESS).length;
    const completed = safeRequests.filter((r) => r && r.status === STATUS.DONE).length;
    const escalated = safeRequests.filter((r) => r && r.status === STATUS.ESCALATED).length;
    const managerComplaints = safeRequests.filter((r) => r && r.complaintType === 'manager_complaint').length;
    const critical = safeRequests.filter((r) => r && r.priority === 'critical').length;
    return { total, pending, inProgress, completed, escalated, managerComplaints, critical };
  }, [safeRequests]);

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
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
  };

  const btnSecondary = {
    background: 'rgba(59, 130, 246, 0.8)', color: '#fff', border: '1px solid rgba(59, 130, 246, 0.4)',
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
    fontSize: '12px', backdropFilter: 'blur(4px)'
  };

  const btnSuccess = {
    background: 'rgba(16, 185, 129, 0.8)', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  const btnWarning = {
    background: 'rgba(245, 158, 11, 0.8)', color: '#fff', border: '1px solid rgba(245, 158, 11, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  const errorBoxStyle = {
    background: 'rgba(69, 10, 10, 0.8)',
    backdropFilter: 'blur(10px)',
    border: '1px solid #ef4444',
    color: '#fecaca',
    padding: '12px 16px',
    borderRadius: '12px',
    fontSize: '13px'
  };

  const fieldErrorStyle = { color: '#f87171', fontSize: '11px', marginTop: '4px' };

  return (
    <div style={glassContainerStyle} dir="rtl">
      {/* ─── الرأس ─── */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#38bdf8', fontSize: '22px', fontWeight: 'bold' }}>
            🎧 خدمة العملاء والذكاء الاصطناعي
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
            إدارة الشكاوى والبلاغات مع التحليل الآلي والإشعارات الفورية
          </p>
        </div>
        <button type="button" onClick={fetchRequests} disabled={loading} style={{ ...btnSecondary, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'جارٍ التحديث...' : '↻ تحديث البيانات'}
        </button>
      </div>

      {errorMsg && <div style={errorBoxStyle}>{errorMsg}</div>}

      {/* ─── الإحصائيات ─── */}
      {showStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>إجمالي البلاغات</span><h3 style={{ margin: '5px 0 0 0', color: '#38bdf8', fontSize: '20px' }}>{stats.total}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>قيد المراجعة</span><h3 style={{ margin: '5px 0 0 0', color: '#facc15', fontSize: '20px' }}>{stats.pending}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>قيد المعالجة</span><h3 style={{ margin: '5px 0 0 0', color: '#f59e0b', fontSize: '20px' }}>{stats.inProgress}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>تم الرد</span><h3 style={{ margin: '5px 0 0 0', color: '#10b981', fontSize: '20px' }}>{stats.completed}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>محولة للإدارة</span><h3 style={{ margin: '5px 0 0 0', color: '#c084fc', fontSize: '20px' }}>{stats.escalated}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>🚨 حرجة</span><h3 style={{ margin: '5px 0 0 0', color: '#ef4444', fontSize: '20px' }}>{stats.critical}</h3></div>
        </div>
      )}

      {/* ─── البحث والفلترة ─── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 ابحث عن طلب عميل، مشكلة، أو شكوى..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...glassInputStyle, flex: 1, minWidth: '200px' }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...glassInputStyle, width: '160px' }}>
          <option value="all" style={{ background: '#111827' }}>🌍 كل الحالات</option>
          <option value={STATUS.PENDING} style={{ background: '#111827' }}>⏳ قيد المراجعة</option>
          <option value={STATUS.IN_PROGRESS} style={{ background: '#111827' }}>🔧 قيد المعالجة</option>
          <option value={STATUS.DONE} style={{ background: '#111827' }}>✅ تم الرد</option>
          <option value={STATUS.ESCALATED} style={{ background: '#111827' }}>🚨 محولة للإدارة</option>
        </select>
        <button type="button" onClick={() => setShowStats(!showStats)} style={btnSecondary}>
          {showStats ? 'إخفاء الإحصائيات' : 'إظهار الإحصائيات'}
        </button>
      </div>

      {/* ─── نموذج الإضافة ─── */}
      <form onSubmit={addRequest} style={{ ...glassCardStyle }} noValidate>
        <h4 style={{ margin: '0 0 15px 0', color: '#f59e0b', fontSize: '16px' }}>📝 تسجيل بلاغ أو شكوى جديدة</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div>
            <input type="text" placeholder="اسم العميل... *" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ ...glassInputStyle, border: `1px solid ${fieldErrors.customerName ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}` }} />
            {fieldErrors.customerName && <div style={fieldErrorStyle}>{fieldErrors.customerName}</div>}
          </div>
          <div>
            <input type="text" placeholder="رقم الهاتف... *" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...glassInputStyle, border: `1px solid ${fieldErrors.phone ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}` }} />
            {fieldErrors.phone && <div style={fieldErrorStyle}>{fieldErrors.phone}</div>}
          </div>
          <div>
            <input type="text" placeholder="الموقع / القسم... *" value={location} onChange={(e) => setLocation(e.target.value)} style={{ ...glassInputStyle, border: `1px solid ${fieldErrors.location ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}` }} />
            {fieldErrors.location && <div style={fieldErrorStyle}>{fieldErrors.location}</div>}
          </div>
          <div>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={glassInputStyle}>
              <option value="low" style={{ background: '#111827' }}>🟢 منخفضة</option>
              <option value="medium" style={{ background: '#111827' }}>🟡 متوسطة</option>
              <option value="high" style={{ background: '#111827' }}>🟠 عالية</option>
              <option value="critical" style={{ background: '#111827' }}>🔴 حرجة</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: '12px' }}>
          <textarea rows="3" placeholder="اكتب تفاصيل المشكلة هنا... *" value={issue} onChange={(e) => setIssue(e.target.value)} style={{ ...glassInputStyle, resize: 'vertical', border: `1px solid ${fieldErrors.issue ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}` }} />
          {fieldErrors.issue && <div style={fieldErrorStyle}>{fieldErrors.issue}</div>}
        </div>
        <button type="submit" disabled={submitting} style={{ ...btnPrimary, marginTop: '12px', opacity: submitting ? 0.8 : 1 }}>
          {submitting ? 'جارٍ التحليل والرد...' : 'إرسال وتحليل البلاغ 🚀'}
        </button>
      </form>

      {/* ─── شبكة بطاقات الشكاوى ─── */}
      <h3 style={{ color: '#38bdf8', fontSize: '16px', margin: '0' }}>📋 قائمة الشكاوى والبلاغات</h3>
      {loading && safeRequests.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>جارٍ تحميل البيانات...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredRequests.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <p style={{ fontSize: '18px' }}>📋 لا توجد طلبات أو شكاوى مطابقة</p>
            </div>
          ) : (
            filteredRequests.map((r, idx) => {
              if (!r) return null;
              const requestId = r.id || r._id;
              const isManagerComplaint = r.complaintType === 'manager_complaint';
              const isEscalated = r.status === STATUS.ESCALATED;
              const isCompleted = r.status === STATUS.DONE;
              const isRowUpdating = updatingId === requestId;
              const currentCustomResponse = responseInputs[requestId] !== undefined ? responseInputs[requestId] : (r.response || '');
              const priorityColor = r.priority === 'critical' ? '#ef4444' : r.priority === 'high' ? '#f59e0b' : r.priority === 'low' ? '#10b981' : '#facc15';

              return (
                <div key={requestId || idx} style={{ ...glassCardStyle, position: 'relative', opacity: isRowUpdating ? 0.6 : 1, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: priorityColor, opacity: 0.8 }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ background: isEscalated ? 'rgba(88, 28, 135, 0.7)' : 'rgba(6, 95, 70, 0.7)', color: isEscalated ? '#e9d5ff' : '#34d399', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                      {isEscalated ? '🚨 شكوى حرجة' : '🛠️ مشكلة عادية'}
                    </span>
                    <span style={{ background: isCompleted ? 'rgba(6, 95, 70, 0.7)' : 'rgba(120, 53, 15, 0.7)', color: isCompleted ? '#34d399' : '#fcd34d', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                      {r.status || STATUS.PENDING}
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '15px' }}>
                    👤 {r.customerName} <span style={{ color: '#94a3b8', fontSize: '12px' }}>({r.phone})</span>
                  </h4>
                  <p style={{ margin: '0 0 8px 0', color: '#94a3b8', fontSize: '12px' }}>📍 {r.location} | 📂 {r.category || 'عام'} | 🚩 {PRIORITY[r.priority?.toUpperCase()] || 'متوسطة'}</p>

                  <div style={{ background: 'rgba(11, 15, 25, 0.4)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '10px' }}>
                    <p style={{ margin: 0, color: '#f1f5f9', fontSize: '13px' }}>💬 <strong>المشكلة:</strong> {r.issue}</p>
                  </div>

                  {r.response && (
                    <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: '#38bdf8' }}>
                      🤖 <strong>الرد:</strong> {r.response}
                    </div>
                  )}

                  {r.history && r.history.length > 0 && (
                    <div style={{ marginBottom: '10px', fontSize: '11px', color: '#64748b' }}>
                      📜 آخر تحديث: {r.history[r.history.length - 1].action} ({new Date(r.history[r.history.length - 1].date).toLocaleString('ar-JO')})
                    </div>
                  )}

                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>✍️ الرد المرسل للزبون:</label>
                    <textarea rows="2" value={currentCustomResponse} onChange={(e) => setResponseInputs((prev) => ({ ...(prev || {}), [requestId]: e.target.value }))} placeholder="اكتب الرد ليتم إرساله..." style={{ ...glassInputStyle, padding: '8px', fontSize: '12px' }} />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => updateRequest(requestId, STATUS.IN_PROGRESS, currentCustomResponse || 'جارٍ معالجة الشكوى')} disabled={isRowUpdating} style={{ ...btnWarning, flex: 1, minWidth: '100px' }}>🔧 قيد المعالجة</button>
                    <button type="button" onClick={() => updateRequest(requestId, STATUS.PENDING, currentCustomResponse || 'جارٍ مراجعة الشكوى')} disabled={isRowUpdating} style={{ ...btnSecondary, flex: 1, minWidth: '100px' }}>⏳ قيد المراجعة</button>
                    <button type="button" onClick={() => updateRequest(requestId, STATUS.DONE, currentCustomResponse || 'تم الرد ومعالجة المشكلة بنجاح')} disabled={isRowUpdating} style={{ ...btnSuccess, flex: 1, minWidth: '100px' }}>✅ تم الرد</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── تتبع حالة الطلب ─── */}
      <div style={glassCardStyle}>
        <h4 style={{ margin: '0 0 12px 0', color: '#f97316', fontSize: '15px' }}>📱 تتبع حالة الطلب برقم الهاتف</h4>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="أدخل رقم الهاتف..." value={trackPhone} onChange={(e) => setTrackPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && trackRequestByPhone()} style={{ ...glassInputStyle, flex: 1 }} />
          <button type="button" onClick={trackRequestByPhone} style={{ ...btnPrimary, padding: '10px 24px' }}>🔍 تتبع</button>
        </div>
        {trackedRequest ? (
          <div style={{ marginTop: '15px', background: 'rgba(11, 15, 25, 0.6)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
            <h5 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>نتائج التتبع للرقم: {trackedRequest.phone}</h5>
            <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#cbd5e1' }}>
              <div>👤 {trackedRequest.customerName} | 📍 {trackedRequest.location}</div>
              <div>🛠️ {trackedRequest.issue}</div>
              <div>⚠️ الحالة: <span style={{ color: '#facc15' }}>{trackedRequest.status}</span></div>
              <div>💬 الرد: {trackedRequest.response || 'لم يتم الرد بعد'}</div>
            </div>
          </div>
        ) : (
          trackError && <p style={{ marginTop: '10px', color: '#ef4444', fontSize: '13px' }}>{trackError}</p>
        )}
      </div>
    </div>
  );
}

export default CustomerService;