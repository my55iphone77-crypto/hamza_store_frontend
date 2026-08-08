import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from './AppContext';

export default function EmailCenter({ 
  mails: externalMails, 
  setEmails: externalSetEmails = () => {}, 
  documents = [], 
  inputStyle = {} 
}) {
  // 🔗 الربط المباشر مع Global State Bus والمزامنة المركزية
  const contextData = useApp() || {};
  const { 
    apiUrl = "",
    getAuthHeaders = () => ({}),
    apiRequest,
    mails: contextMails = [], 
    setMails: setContextMails,
    documents: contextDocuments = [],
    addLog,
    api
  } = contextData;

  const [internalMails, setInternalMails] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [currentFolder, setCurrentFolder] = useState('inbox');
  const [filterBySender, setFilterBySender] = useState('');
  const [filterByRecipient, setFilterByRecipient] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedMail, setSelectedMail] = useState(null);
  const [showMailDetail, setShowMailDetail] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState([
    { id: 1, name: 'ترحيب', subject: 'مرحباً بك', body: 'مرحباً،\n\nنرحب بك في نظامنا...' },
    { id: 2, name: 'تذكير', subject: 'تذكير بموعد', body: 'تذكير بموعد مجدول...' },
    { id: 3, name: 'شكر', subject: 'شكراً لك', body: 'نشكرك على تعاونك...' }
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('email_drafts') || '[]'); } catch { return []; }
  });
  const [showDrafts, setShowDrafts] = useState(false);

  // 📝 حالات إدارة التعديل والنافذة المنبثقة
  const [editingMailId, setEditingMailId] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // 🔒 دالة تعقيم وتحصين المدخلات النصية لمنع هجمات XSS
  const sanitizeInput = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '');
  };

  // 💎 قالب البريد الإلكتروني الزجاجي الاحترافي
  const getGlassEmailTemplate = (title, contentHtml, attachmentInfo = null) => `
    <div style="font-family: 'Tajawal', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px; direction: rtl; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-top: 0; font-size: 20px;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.8; color: #cbd5e1; margin-top: 20px;">
          ${contentHtml}
        </div>
        ${attachmentInfo ? `
          <div style="margin-top: 25px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); padding: 12px 16px; border-radius: 12px; font-size: 14px; color: #38bdf8;">
            📎 مستند مرفق: <b>${attachmentInfo.title}</b> (${attachmentInfo.type || 'ملف'})
          </div>
        ` : ''}
        <div style="margin-top: 35px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b; text-align: center;">
          نظام إدارة المراسلات CRM المركزي &bull; ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    </div>
  `;

  // دمج المستندات والرسائل بأمان تام
  const safeDocuments = Array.isArray(documents) && documents.length > 0 ? documents : (Array.isArray(contextDocuments) ? contextDocuments : []);
  const safeMails = Array.isArray(externalMails) && externalMails.length > 0 
    ? externalMails 
    : (Array.isArray(contextMails) && contextMails.length > 0 ? contextMails : internalMails);

  const updateEmails = useCallback((newList) => {
    setInternalMails(newList);
    if (typeof externalSetEmails === "function") {
      externalSetEmails(newList);
    }
    if (typeof setContextMails === "function") {
      setContextMails(newList);
    }
  }, [externalSetEmails, setContextMails]);

  // 🌐 دالة طلب موحدة وآمنة
  const secureApiRequest = useCallback(async (path, method = "GET", body = null) => {
    if (typeof apiRequest === "function") {
      return apiRequest(path, method, body);
    }
    if (api) {
      const res = await api.request({ url: path, method, data: body });
      return res.data;
    }
    const headers = {
      ...getAuthHeaders(),
      "Content-Type": "application/json"
    };
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `فشل الطلب (${res.status})`);
    return data;
  }, [apiUrl, getAuthHeaders, apiRequest, api]);

  // 1️⃣ جلب الرسائل لحظياً من الخادم
  const fetchMailsFromAPI = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await secureApiRequest("/emails", "GET");
      if (Array.isArray(data)) {
        updateEmails(data);
      } else if (data && Array.isArray(data.mails)) {
        updateEmails(data.mails);
      }
    } catch (err) {
      console.error("فشل جلب الرسائل من الخادم:", err);
    } finally {
      setIsLoading(false);
    }
  }, [secureApiRequest, updateEmails]);

  useEffect(() => {
    fetchMailsFromAPI();
  }, [fetchMailsFromAPI]);

  // ✉️ التحقق من صحة البريد الإلكتروني
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  };

  // Save draft
  const saveDraft = () => {
    if (!subject.trim() && !body.trim()) return;
    const newDraft = {
      id: Date.now(),
      recipient: sanitizeInput(recipient),
      subject: sanitizeInput(subject),
      body: sanitizeInput(body),
      date: new Date().toISOString()
    };
    const updated = [newDraft, ...drafts];
    setDrafts(updated);
    localStorage.setItem('email_drafts', JSON.stringify(updated));
    setStatusMessage("📝 تم حفظ المسودة بنجاح.");
    setTimeout(() => setStatusMessage(""), 3000);
  };

  // Load template
  const loadTemplate = (templateId) => {
    const tpl = emailTemplates.find(t => t.id === Number(templateId));
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  // 📨 إرسال البريد الإلكتروني
  const sendEmailOnly = async () => {
    const safeRecipient = sanitizeInput(recipient);
    const safeSubject = sanitizeInput(subject);
    const safeBody = sanitizeInput(body);

    if (!safeRecipient.trim()) {
      alert("الرجاء إدخال البريد الإلكتروني للمستلم بشكل إجباري!");
      return;
    }
    if (!validateEmail(safeRecipient)) {
      alert("البريد الإلكتروني المدخل غير صحيح! (يجب أن يحتوي على @ ونطاق صحيح).");
      return;
    }
    if (!safeSubject.trim()) {
      alert("الرجاء إدخال موضوع البريد!");
      return;
    }

    setIsSending(true);

    const attachedDoc = Array.isArray(safeDocuments) ? safeDocuments.find(d => d && String(d.id || d._id) === String(selectedDocId)) : null;

    const newMailPayload = {
      sender: "مسؤول النظام (Hamza)",
      recipient: safeRecipient,
      subject: safeSubject,
      body: safeBody,
      read: false,
      type: "email",
      date: new Date().toLocaleString("ar-JO"),
      deleted: false,
      archived: false,
      folder: "sent",
      attachment: attachedDoc ? { id: attachedDoc.id || attachedDoc._id, title: sanitizeInput(attachedDoc.title), type: attachedDoc.type } : null
    };

    try {
      const response = await secureApiRequest("/emails", "POST", newMailPayload);
      const savedMail = response?.mail || response || { ...newMailPayload, id: Date.now() };

      updateEmails([...safeMails, savedMail]);

      const styledHtmlBody = getGlassEmailTemplate(safeSubject, `<p>${safeBody.replace(/\n/g, '<br/>')}</p>`, attachedDoc);
      await secureApiRequest("/sendExternalMail", "POST", {
        to: safeRecipient,
        subject: safeSubject,
        body: styledHtmlBody
      }).catch(() => {});

      // Remove from drafts if exists
      const updatedDrafts = drafts.filter(d => d.subject !== safeSubject || d.recipient !== safeRecipient);
      setDrafts(updatedDrafts);
      localStorage.setItem('email_drafts', JSON.stringify(updatedDrafts));

      clearForm();
      setIsComposeOpen(false);
      setStatusMessage("🚀 تم إرسال البريد الإلكتروني بنجاح والمزامنة الحية مفعلة.");
      setTimeout(() => setStatusMessage(""), 3000);

      if (typeof addLog === 'function') {
        addLog({ action: `📧 بريد مرسل إلى: ${safeRecipient} — الموضوع: ${safeSubject}` });
      }
    } catch (err) {
      console.error("تعذر إرسال أو حفظ البريد:", err);
      alert(err.message || "حدث خطأ أثناء إرسال البريد عبر الخادم.");
    } finally {
      setIsSending(false);
    }
  };

  // ✏️ بدء تعديل رسالة
  const startEditingMail = (m) => {
    setEditingMailId(m.id || m._id);
    setEditSubject(m.subject || '');
    setEditBody(m.body || '');
    setEditRecipient(m.recipient || '');
  };

  // 💾 حفظ التعديل
  const saveEditedMail = async (id) => {
    const safeEditSubj = sanitizeInput(editSubject);
    const safeEditBod = sanitizeInput(editBody);
    const safeEditRecip = sanitizeInput(editRecipient);

    if (!safeEditSubj.trim()) {
      alert("موضوع الرسالة لا يمكن أن يكون فارغاً!");
      return;
    }

    const targetMail = safeMails.find(m => (m.id || m._id) === id);
    if (!targetMail) return;

    const updatedData = {
      ...targetMail,
      subject: safeEditSubj,
      body: safeEditBod,
      recipient: safeEditRecip || targetMail.recipient
    };

    try {
      await secureApiRequest(`/emails/${encodeURIComponent(id)}`, "PUT", updatedData);
      const updatedList = safeMails.map(m => (m.id || m._id) === id ? updatedData : m);
      updateEmails(updatedList);
      setEditingMailId(null);
      setStatusMessage("✨ تم تحديث الرسالة بنجاح.");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      console.error("فشل تحديث الرسالة:", err);
      alert(err.message || "تعذر حفظ التعديلات على الخادم.");
    }
  };

  // 🗑️ حذف بريد
  const deleteMail = async (id) => {
    if (!window.confirm('هل أنت متأكد من نقل هذه الرسالة إلى السبام؟')) return;
    try {
      await secureApiRequest(`/emails/${encodeURIComponent(id)}`, "PATCH", { deleted: true, folder: "spam" });
      const updated = safeMails.map(m => (m.id || m._id) === id ? { ...m, deleted: true, folder: "spam" } : m);
      updateEmails(updated);
      if (typeof addLog === 'function') addLog({ action: `🗑️ رسالة نقلت للسبام: ${id}` });
    } catch (err) {
      console.error("فشل حذف الرسالة:", err);
    }
  };

  // 📖 قراءة بريد
  const markAsRead = async (id) => {
    try {
      await secureApiRequest(`/emails/${encodeURIComponent(id)}`, "PATCH", { read: true });
      const updated = safeMails.map(m => (m.id || m._id) === id ? { ...m, read: true } : m);
      updateEmails(updated);
    } catch (err) {
      console.error("فشل تحديث حالة القراءة:", err);
    }
  };

  // 📦 أرشفة بريد
  const archiveMail = async (id) => {
    try {
      await secureApiRequest(`/emails/${encodeURIComponent(id)}`, "PATCH", { archived: true, folder: "archive" });
      const updated = safeMails.map(m => (m.id || m._id) === id ? { ...m, archived: true, folder: "archive" } : m);
      updateEmails(updated);
    } catch (err) {
      console.error("فشل أرشفة الرسالة:", err);
    }
  };

  // 🧹 تنظيف نموذج الإرسال
  const clearForm = () => {
    setRecipient('');
    setSubject('');
    setBody('');
    setSelectedDocId('');
    setSelectedTemplate('');
  };

  // 🔍 فلترة البريد
  const safeSearch = sanitizeInput(searchTerm);
  const safeFilterSender = sanitizeInput(filterBySender);
  const safeFilterRecipient = sanitizeInput(filterByRecipient);

  const filteredMails = safeMails.filter(m => {
    if (!m) return false;
    const matchesSearch = (m.subject || "").toLowerCase().includes(safeSearch.toLowerCase()) ||
                          (m.body || "").toLowerCase().includes(safeSearch.toLowerCase());
    const notDeleted = !m.deleted || currentFolder === 'spam';
    const inFolder = m.folder === currentFolder;
    const matchesSender = safeFilterSender ? (m.sender || "").toLowerCase().includes(safeFilterSender.toLowerCase()) : true;
    const matchesRecipient = safeFilterRecipient ? (m.recipient || "").toLowerCase().includes(safeFilterRecipient.toLowerCase()) : true;

    return matchesSearch && notDeleted && inFolder && matchesSender && matchesRecipient;
  });

  // 📊 إحصائيات البريد
  const totalInbox = safeMails.filter(m => m && m.folder === "inbox" && !m.deleted).length;
  const totalSent = safeMails.filter(m => m && m.folder === "sent" && !m.deleted).length;
  const totalSpam = safeMails.filter(m => m && (m.folder === "spam" || m.deleted)).length;
  const totalArchive = safeMails.filter(m => m && m.folder === "archive" && !m.deleted).length;
  const totalUnread = safeMails.filter(m => m && m.folder === "inbox" && !m.read && !m.deleted).length;

  return (
    <div style={{ background: 'linear-gradient(135deg, #090d16 0%, #111827 100%)', padding: '30px', borderRadius: '20px', color: '#fff', fontFamily: 'Tajawal, sans-serif', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', minHeight: '100vh', width: '100%', boxSizing: 'border-box' }} dir="rtl">

      {/* عنوان القسم */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', width: '45px', height: '45px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' }}>
            📧
          </div>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '22px', fontWeight: '800' }}>مركز البريد الإلكتروني</h3>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>إدارة ومتابعة المراسلات والتقارير المرتبطة بالسيرفر لحظياً</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            type="button"
            onClick={fetchMailsFromAPI}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
          >
            تحديث القائمة 🔄
          </button>
          <button 
            type="button"
            onClick={() => setShowDrafts(!showDrafts)}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
          >
            📝 المسودات ({drafts.length})
          </button>
          <button 
            type="button"
            onClick={() => setIsComposeOpen(!isComposeOpen)}
            style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', color: '#0f172a', border: 'none', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>✍️</span> {isComposeOpen ? "إخفاء النموذج" : "إنشاء رسالة"}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '14px', color: '#10b981' }}>
          {statusMessage}
        </div>
      )}

      {/* البحث والفلترة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <input
          type="text"
          placeholder="🔍 ابحث في رسائل البريد..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }}
        />
        <input
          type="text"
          placeholder="👤 فلترة حسب المرسل..."
          value={filterBySender}
          onChange={(e) => setFilterBySender(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }}
        />
        <input
          type="text"
          placeholder="📍 فلترة حسب المستلم..."
          value={filterByRecipient}
          onChange={(e) => setFilterByRecipient(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }}
          dir="ltr"
        />
      </div>

      {/* نموذج إرسال بريد */}
      {isComposeOpen && (
        <form onSubmit={(e) => e.preventDefault()} style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(16px)', padding: '25px', borderRadius: '18px', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '30px', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' }}>
          <h4 style={{ margin: '0 0 18px 0', color: '#38bdf8', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✉️</span> إنشاء وإرسال رسالة حقيقية بقالب زجاجي احترافي
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#38bdf8', marginBottom: '6px', fontWeight: 'bold' }}>البريد الإلكتروني للمستلم *</label>
              <input 
                type="email" 
                placeholder="name@example.com" 
                value={recipient} 
                onChange={(e) => setRecipient(e.target.value)} 
                style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }} 
                required 
                dir="ltr"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#38bdf8', marginBottom: '6px', fontWeight: 'bold' }}>موضوع البريد *</label>
              <input 
                type="text" 
                placeholder="اكتب موضوع الرسالة هنا..." 
                value={subject} 
                onChange={(e) => setSubject(e.target.value)} 
                style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }} 
                required 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>📎 إرفاق مستند (اختياري)</label>
              <select 
                value={selectedDocId} 
                onChange={(e) => setSelectedDocId(e.target.value)} 
                style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }}
              >
                <option value="">-- بدون مستند مرفق --</option>
                {safeDocuments.map(d => d && <option key={d.id || d._id} value={d.id || d._id}>{d.title} ({d.type})</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>📋 قالب جاهز</label>
              <select 
                value={selectedTemplate} 
                onChange={(e) => { setSelectedTemplate(e.target.value); loadTemplate(e.target.value); }} 
                style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px', ...inputStyle }}
              >
                <option value="">-- بدون قالب --</option>
                {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>محتوى البريد الإلكتروني</label>
            <textarea 
              placeholder="اكتب تفاصيل ومحتوى الرسالة هنا..." 
              value={body} 
              onChange={(e) => setBody(e.target.value)} 
              style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '14px 16px', borderRadius: '12px', minHeight: '100px', outline: 'none', fontSize: '14px', resize: 'vertical', ...inputStyle }} 
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={sendEmailOnly} 
              disabled={isSending}
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', opacity: isSending ? 0.7 : 1 }}
            >
              {isSending ? "جاري الإرسال..." : "إرسال البريد الإلكتروني 🚀"}
            </button>
            <button 
              type="button" 
              onClick={saveDraft} 
              style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
            >
              💾 حفظ مسودة
            </button>
            <button 
              type="button" 
              onClick={() => setIsComposeOpen(false)} 
              style={{ background: '#334155', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '12px', cursor: 'pointer', fontSize: '14px' }}
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Drafts Panel */}
      {showDrafts && drafts.length > 0 && (
        <div style={{ background: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(12px)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(124, 58, 237, 0.3)', marginBottom: '25px' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#a78bfa', fontSize: '15px' }}>📝 المسودات المحفوظة</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {drafts.map(draft => (
              <div key={draft.id} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>{draft.subject || '(بدون موضوع)'}</span>
                  <span style={{ color: '#94a3b8', fontSize: '11px', marginRight: '10px' }}>إلى: {draft.recipient}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setRecipient(draft.recipient); setSubject(draft.subject); setBody(draft.body); setIsComposeOpen(true); setShowDrafts(false); }} style={{ background: '#38bdf8', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>تحميل</button>
                  <button onClick={() => { const updated = drafts.filter(d => d.id !== draft.id); setDrafts(updated); localStorage.setItem('email_drafts', JSON.stringify(updated)); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* شريط التنقل بين المجلدات */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setCurrentFolder('inbox')} style={{ background: currentFolder === 'inbox' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#1e293b', color: currentFolder === 'inbox' ? '#000' : '#fff', border: '1px solid #334155', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', position: 'relative' }}>
          📥 الوارد ({totalInbox})
          {totalUnread > 0 && <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{totalUnread}</span>}
        </button>
        <button type="button" onClick={() => setCurrentFolder('sent')} style={{ background: currentFolder === 'sent' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
          📤 المرسلة ({totalSent})
        </button>
        <button type="button" onClick={() => setCurrentFolder('spam')} style={{ background: currentFolder === 'spam' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
          🚫 السبام ({totalSpam})
        </button>
        <button type="button" onClick={() => setCurrentFolder('archive')} style={{ background: currentFolder === 'archive' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#1e293b', color: '#fff', border: '1px solid #334155', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
          📦 الأرشيف ({totalArchive})
        </button>
      </div>

      {/* عرض الرسائل */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>جاري تحميل البيانات من الخادم...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '22px', marginBottom: '35px' }}>
          {filteredMails.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', background: '#1e293b', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px dashed #334155' }}>
              <span style={{ fontSize: '40px' }}>📭</span>
              <p style={{ color: '#9ca3af', marginTop: '10px', fontSize: '15px' }}>لا توجد رسائل بريد في هذا المجلد حالياً.</p>
            </div>
          ) : (
            filteredMails.map((m, idx) => {
              const mailId = m.id || m._id || idx;
              return (
                <div key={mailId} style={{ background: 'linear-gradient(145deg, #1e293b 0%, #111827 100%)', border: '1px solid rgba(51, 65, 85, 0.8)', borderRadius: '20px', padding: '22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '18px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '2px solid #38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                        ✉️
                      </div>
                      <div style={{ overflow: 'hidden', width: '100%' }}>
                        {editingMailId === mailId ? (
                          <input 
                            type="text" 
                            value={editSubject} 
                            onChange={(e) => setEditSubject(e.target.value)}
                            style={{ width: '100%', background: '#0f172a', border: '1px solid #38bdf8', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontSize: '14px', ...inputStyle }}
                          />
                        ) : (
                          <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subject}</h4>
                        )}
                        <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '3px 10px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: '600' }}>
                          {m.read ? "✅ مقروء" : "📩 غير مقروء"}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>👤 من:</span> <b style={{ color: '#f1f5f9' }}>{m.sender}</b>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📍 إلى:</span> 
                        {editingMailId === mailId ? (
                          <input 
                            type="text" 
                            value={editRecipient} 
                            onChange={(e) => setEditRecipient(e.target.value)}
                            style={{ background: '#0f172a', border: '1px solid #38bdf8', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', ...inputStyle }}
                            dir="ltr"
                          />
                        ) : (
                          <b style={{ color: '#f1f5f9' }} dir="ltr">{m.recipient}</b>
                        )}
                      </div>
                      {m.attachment && (
                        <div style={{ fontSize: '12px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '6px 10px', borderRadius: '6px' }}>
                          📎 مرفق: {m.attachment.title}
                        </div>
                      )}

                      {editingMailId === mailId ? (
                        <textarea 
                          value={editBody} 
                          onChange={(e) => setEditBody(e.target.value)}
                          style={{ width: '100%', background: '#0f172a', border: '1px solid #38bdf8', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', minHeight: '80px', marginTop: '6px', ...inputStyle }}
                        />
                      ) : (
                        <div style={{ background: '#090d16', padding: '12px 14px', borderRadius: '12px', color: '#f8fafc', marginTop: '6px', fontSize: '14px', border: '1px solid #1e293b', lineHeight: '1.5', maxHeight: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.body || "بدون محتوى"}
                        </div>
                      )}

                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>📅</span> {m.date}
                      </span>
                    </div>
                  </div>

                  {/* أزرار الإجراءات */}
                  <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.6)', paddingTop: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {editingMailId === mailId ? (
                      <>
                        <button type="button" onClick={() => saveEditedMail(mailId)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          حفظ ✓
                        </button>
                        <button type="button" onClick={() => setEditingMailId(null)} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setSelectedMail(m); setShowMailDetail(true); markAsRead(mailId); }} style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', padding: '9px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          عرض 👁️
                        </button>
                        {!m.read && (
                          <button type="button" onClick={() => markAsRead(mailId)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '9px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            قراءة ✓
                          </button>
                        )}
                        {m.folder !== "archive" && (
                          <button type="button" onClick={() => archiveMail(mailId)} style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', padding: '9px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            أرشفة 📦
                          </button>
                        )}
                        <button type="button" onClick={() => startEditingMail(m)} style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '9px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }} title="تعديل الرسالة">
                          ✏️
                        </button>
                        <button type="button" onClick={() => deleteMail(mailId)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '9px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }} title="نقل للسبام">
                          🚫
                        </button>
                      </>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

      {/* Mail Detail Modal */}
      {showMailDetail && selectedMail && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowMailDetail(false)}>
          <div style={{ background: 'linear-gradient(145deg, #1e293b 0%, #111827 100%)', border: '1px solid rgba(51, 65, 85, 0.8)', borderRadius: '20px', padding: '30px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#38bdf8', marginTop: 0 }}>{selectedMail.subject}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', color: '#94a3b8', fontSize: '13px' }}>
              <div>👤 من: <span style={{ color: '#fff' }}>{selectedMail.sender}</span></div>
              <div>📍 إلى: <span style={{ color: '#fff' }} dir="ltr">{selectedMail.recipient}</span></div>
              <div>📅 {selectedMail.date}</div>
            </div>
            <div style={{ background: '#090d16', padding: '20px', borderRadius: '12px', color: '#f8fafc', lineHeight: '1.8', border: '1px solid #1e293b', whiteSpace: 'pre-wrap' }}>
              {selectedMail.body}
            </div>
            {selectedMail.attachment && (
              <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px', color: '#38bdf8', fontSize: '13px' }}>
                📎 مرفق: {selectedMail.attachment.title}
              </div>
            )}
            <button onClick={() => setShowMailDetail(false)} style={{ marginTop: '20px', background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
          </div>
        </div>
      )}

      {/* تقرير البريد الشامل */}
      <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(51, 65, 85, 0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h4 style={{ margin: 0, color: '#f97316', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📊</span> تقرير البريد الإلكتروني الشامل
        </h4>
        <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap', fontSize: '14px', color: '#94a3b8' }}>
          <span>📥 الوارد: <b style={{ color: '#fff' }}>{totalInbox}</b></span>
          <span>📤 المرسلة: <b style={{ color: '#fff' }}>{totalSent}</b></span>
          <span>🚫 السبام: <b style={{ color: '#fff' }}>{totalSpam}</b></span>
          <span>📦 الأرشيف: <b style={{ color: '#fff' }}>{totalArchive}</b></span>
          <span>📩 غير مقروء: <b style={{ color: '#facc15' }}>{totalUnread}</b></span>
        </div>
      </div>

    </div>
  );
}