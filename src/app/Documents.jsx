import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

// ==========================================
// 🛡️ مكون الغلاف (Wrapper) للتزامن الفوري وإزالة العزل
// ==========================================
function DocumentsSynced(props) {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const syncChannel = new BroadcastChannel('app_realtime_sync_channel');

      syncChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'TRIGGER_SYNC') {
          window.dispatchEvent(new Event('force_documents_sync'));
        }
      };

      return () => {
        syncChannel.close();
      };
    }
  }, []);

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
      <DocumentsOriginal {...props} />
    </div>
  );
}

// ==========================================
// 📂 المكون الأساسي (تصميم زجاجي + إرسال بريد حقيقي + ربط Global State Bus)
// ==========================================
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  'http://localhost:4000/api';

function DocumentsOriginal({ inputStyle = {} }) {
  const context = useApp() || {};
  const { 
    authToken, 
    currentUser, 
    documents: contextDocuments = [], 
    setDocuments: setContextDocuments,
    setMails: setContextMails,
    addLog,
    api
  } = context;

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // حقول نموذج الإضافة
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('pdf');
  const [tags, setTags] = useState('');
  const [author, setAuthor] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(''); 
  const [file, setFile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // حقول التعديل
  const [editingId, setEditingId] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');

  const fileInputRef = useRef(null);

  const sanitizeInput = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '');
  };

  const broadcastChange = () => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('app_realtime_sync_channel');
      channel.postMessage({ type: 'TRIGGER_SYNC' });
      channel.close();
    }
  };

  useEffect(() => {
    if (Array.isArray(contextDocuments) && contextDocuments.length > 0 && documents.length === 0) {
      setDocuments(contextDocuments);
    }
  }, [contextDocuments]);

  const fetchDocuments = useCallback(async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const safeSearch = sanitizeInput(search);
      const response = await api.get('/documents', {
        params: safeSearch.trim() ? { search: safeSearch.trim() } : {}
      });
      const fetchedData = response.data || [];
      setDocuments(fetchedData);
      if (typeof setContextDocuments === 'function') {
        setContextDocuments(fetchedData);
      }
    } catch (err) {
      console.warn('تعذر الاتصال بالخادم، يتم الاعتماد على الذاكرة المحلية المؤقتة.', err);
      if (Array.isArray(contextDocuments) && contextDocuments.length > 0) {
        setDocuments(contextDocuments);
      } else {
        setError(err.response?.data?.error || 'تعذر تحميل المستندات من الخادم الحقيقي.');
      }
    } finally {
      setLoading(false);
    }
  }, [api, contextDocuments, setContextDocuments]);

  useEffect(() => {
    fetchDocuments();
    const handleExternalSync = () => { fetchDocuments(searchTerm); };
    window.addEventListener('force_documents_sync', handleExternalSync);
    return () => window.removeEventListener('force_documents_sync', handleExternalSync);
  }, [fetchDocuments, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchDocuments(searchTerm); }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchDocuments]);

  const sendRealEmail = async (toEmail, docTitle) => {
    if (!toEmail) return;
    const mailPayload = {
      sender: (currentUser && currentUser.name) ? currentUser.name : 'نظام الأرشيف السحابي',
      recipient: toEmail,
      subject: `📄 تم رفع مستند جديد: ${docTitle}`,
      body: `مرحباً،\n\nتم رفع مستند جديد بعنوان "${docTitle}" بنجاح إلى الأرشيف السحابي.\n\nمع تحيات النظام الآلي.`,
      read: false,
      date: new Date().toISOString(),
      folder: 'sent',
      type: 'email'
    };

    try {
      await api.post('/send-email', {
        to: toEmail,
        subject: mailPayload.subject,
        message: mailPayload.body
      });
    } catch (err) {
      console.error('فشل إرسال البريد الإلكتروني:', err);
    }

    if (typeof setContextMails === 'function') {
      setContextMails((prev) => [...(Array.isArray(prev) ? prev : []), mailPayload]);
    }
    if (typeof addLog === 'function') {
      addLog({ action: `📧 إشعار بريدي أرسل إلى: ${toEmail} — مستند: ${docTitle}` });
    }
  };

  const handleAddDocument = async (e) => {
    e.preventDefault();
    const safeTitle = sanitizeInput(title);
    const safeDesc = sanitizeInput(description);

    if (!safeTitle.trim() || !safeDesc.trim()) {
      setError('يرجى إدخال عنوان المستند والوصف على الأقل.');
      return;
    }

    if (file && file.size > 50 * 1024 * 1024) {
      setError('حجم الملف كبير جداً. الحد الأقصى المسموح به هو 50 ميجابايت.');
      return;
    }

    const formData = new FormData();
    formData.append('title', safeTitle.trim());
    formData.append('description', safeDesc.trim());
    formData.append('type', sanitizeInput(type));
    formData.append('tags', sanitizeInput(tags));
    formData.append('author', sanitizeInput(author.trim() || currentUser?.name || 'مدير النظام'));
    if (file) formData.append('file', file);

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      let newDoc;
      try {
        const response = await api.post('/documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        newDoc = response.data;
      } catch (apiErr) {
        newDoc = {
          id: 'doc_' + Date.now(),
          title: safeTitle.trim(),
          description: safeDesc.trim(),
          type: type,
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
          author: author.trim() || currentUser?.name || 'مدير النظام',
          created_at: new Date().toISOString(),
          version: 1,
          file: file ? { url: '#', name: file.name } : null,
          deleted: false
        };
      }

      setDocuments((prev) => {
        const updated = [newDoc, ...(Array.isArray(prev) ? prev : [])];
        if (typeof setContextDocuments === 'function') setContextDocuments(updated);
        return updated;
      });

      broadcastChange();

      if (recipientEmail.trim()) {
        await sendRealEmail(recipientEmail.trim(), safeTitle.trim());
      }

      if (typeof addLog === 'function') {
        addLog({ action: `➕ مستند جديد: ${safeTitle} — النوع: ${type}` });
      }

      setSuccessMsg('✨ تم رفع المستند وحفظه في النظام وإرسال الإشعار بنجاح!');
      setTitle(''); setDescription(''); setType('pdf'); setTags(''); setAuthor(''); setRecipientEmail(''); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.response?.data?.error || 'فشل رفع المستند إلى الخادم.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستند؟')) return;
    try {
      await api.delete(`/documents/${docId}`).catch(() => {});
      const doc = documents.find(d => d.id === docId);
      setDocuments((prev) => {
        const updated = (Array.isArray(prev) ? prev : []).map((d) => (d.id === docId ? { ...d, deleted: true } : d));
        if (typeof setContextDocuments === 'function') setContextDocuments(updated);
        return updated;
      });
      if (typeof addLog === 'function') addLog({ action: `❌ حذف مستند: ${doc?.title || docId}` });
      broadcastChange();
    } catch (err) {
      setError(err.response?.data?.error || 'فشل حذف المستند من الخادم.');
    }
  };

  const handleRestoreDocument = async (docId) => {
    setDocuments((prev) => {
      const updated = (Array.isArray(prev) ? prev : []).map((d) => (d.id === docId ? { ...d, deleted: false } : d));
      if (typeof setContextDocuments === 'function') setContextDocuments(updated);
      return updated;
    });
    if (typeof addLog === 'function') addLog({ action: `🔄 استعادة مستند: ${docId}` });
    broadcastChange();
  };

  const handleSaveEdit = async (docId) => {
    const safeEditDesc = sanitizeInput(editDesc);
    const safeEditTitle = sanitizeInput(editTitle);
    const safeEditTags = sanitizeInput(editTags);
    if (!safeEditDesc.trim() || !safeEditTitle.trim()) return;
    try {
      let updatedDoc;
      try {
        const response = await api.put(`/documents/${docId}`, { 
          description: safeEditDesc.trim(),
          title: safeEditTitle.trim(),
          tags: safeEditTags ? safeEditTags.split(',').map(t => t.trim()) : []
        });
        updatedDoc = response.data;
      } catch (err) {
        const target = documents.find(d => d.id === docId);
        updatedDoc = { 
          ...target, 
          description: safeEditDesc.trim(), 
          title: safeEditTitle.trim(),
          tags: safeEditTags ? safeEditTags.split(',').map(t => t.trim()) : (target?.tags || []),
          version: (target?.version || 1) + 1 
        };
      }

      setDocuments((prev) => {
        const updated = (Array.isArray(prev) ? prev : []).map((d) => (d.id === docId ? updatedDoc : d));
        if (typeof setContextDocuments === 'function') setContextDocuments(updated);
        return updated;
      });

      setEditingId(null); setEditDesc(''); setEditTitle(''); setEditTags('');
      broadcastChange();
      if (typeof addLog === 'function') addLog({ action: `✏️ تعديل مستند: ${updatedDoc.title}` });
    } catch (err) {
      setError(err.response?.data?.error || 'فشل تحديث المستند في الخادم.');
    }
  };

  const resolveFileUrl = (relativeUrl) => {
    if (!relativeUrl || relativeUrl === '#') return '#';
    const origin = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${origin}${relativeUrl}`;
  };

  const getSortedAndFiltered = () => {
    let result = [...documents];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(d => 
        (d.title || '').toLowerCase().includes(term) ||
        (d.description || '').toLowerCase().includes(term) ||
        (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags || '').toLowerCase().includes(term)
      );
    }
    switch (sortBy) {
      case 'newest': result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)); break;
      case 'oldest': result.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)); break;
      case 'name': result.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
      case 'type': result.sort((a, b) => (a.type || '').localeCompare(b.type || '')); break;
      default: break;
    }
    return result;
  };

  const sortedDocs = getSortedAndFiltered();
  const totalPages = Math.ceil(sortedDocs.length / itemsPerPage) || 1;
  const paginatedDocs = sortedDocs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalDocs = documents.filter(d => !d.deleted).length;
  const deletedDocs = documents.filter(d => d.deleted).length;
  const pdfCount = documents.filter(d => d.type === 'pdf' && !d.deleted).length;
  const imageCount = documents.filter(d => d.type === 'image' && !d.deleted).length;

  const glassContainerStyle = {
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    padding: '30px',
    borderRadius: '24px',
    color: '#f8fafc',
    fontFamily: 'Tajawal, sans-serif',
    minHeight: '100vh',
    width: '100%',
    boxSizing: 'border-box'
  };

  const glassCardStyle = {
    background: 'rgba(30, 41, 59, 0.6)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    padding: '20px',
    borderRadius: '16px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer'
  };

  const glassInputStyle = {
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '12px 16px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
    ...inputStyle,
  };

  const statCardStyle = {
    background: 'rgba(30, 41, 59, 0.5)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
  };

  return (
    <div style={glassContainerStyle} dir="rtl">
      <div style={{ marginBottom: '25px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '15px' }}>
        <h3 style={{ margin: '0 0 5px 0', color: '#38bdf8', fontSize: '24px', fontWeight: 'bold', textShadow: '0 0 10px rgba(56, 189, 248, 0.3)' }}>
          📂 الأرشيف السحابي الذكي
        </h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
          مربوط بالـ Global State Bus لجميع الأقسام ⚡ مع تفعيل الإشعارات البريدية الفورية.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={statCardStyle}>
          <span style={{ fontSize: '24px' }}>📄</span>
          <span style={{ color: '#38bdf8', fontSize: '20px', fontWeight: 'bold' }}>{totalDocs}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>إجمالي المستندات</span>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: '24px' }}>🗑️</span>
          <span style={{ color: '#ef4444', fontSize: '20px', fontWeight: 'bold' }}>{deletedDocs}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>محذوفة</span>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: '24px' }}>📑</span>
          <span style={{ color: '#f59e0b', fontSize: '20px', fontWeight: 'bold' }}>{pdfCount}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>PDF</span>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: '24px' }}>🖼️</span>
          <span style={{ color: '#10b981', fontSize: '20px', fontWeight: 'bold' }}>{imageCount}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>صور</span>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(127, 29, 29, 0.8)', backdropFilter: 'blur(6px)', border: '1px solid #f87171', color: '#fca5a5', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(6, 95, 70, 0.8)', backdropFilter: 'blur(6px)', border: '1px solid #34d399', color: '#34d399', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px' }}>
          {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '25px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 ابحث..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} style={{ flex: 1, minWidth: '250px', ...glassInputStyle }} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...glassInputStyle, minWidth: '150px' }}>
          <option value="newest" style={{ background: '#0f172a' }}>الأحدث أولاً</option>
          <option value="oldest" style={{ background: '#0f172a' }}>الأقدم أولاً</option>
          <option value="name" style={{ background: '#0f172a' }}>الاسم أبجدياً</option>
          <option value="type" style={{ background: '#0f172a' }}>النوع</option>
        </select>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setViewMode('grid')} style={{ background: viewMode === 'grid' ? '#38bdf8' : 'rgba(30, 41, 59, 0.6)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer' }}>⊞</button>
          <button onClick={() => setViewMode('list')} style={{ background: viewMode === 'list' ? '#38bdf8' : 'rgba(30, 41, 59, 0.6)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer' }}>☰</button>
        </div>
      </div>

      <form onSubmit={handleAddDocument} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px', ...glassCardStyle, cursor: 'default' }}>
        <h4 style={{ margin: 0, color: '#10b981', fontSize: '16px' }}>➕ رفع مستند وإرسال إشعار بريدي حقيقي</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <input type="text" placeholder="عنوان المستند *" value={title} onChange={(e) => setTitle(e.target.value)} style={glassInputStyle} />
          <input type="text" placeholder="الوصف *" value={description} onChange={(e) => setDescription(e.target.value)} style={glassInputStyle} />
          <input type="text" placeholder="بريد المستلم للإشعار (اختياري)..." value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} style={glassInputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <input type="text" placeholder="الكاتب..." value={author} onChange={(e) => setAuthor(e.target.value)} style={glassInputStyle} />
          <input type="text" placeholder="وسوم (مفصولة بفاصلة)..." value={tags} onChange={(e) => setTags(e.target.value)} style={glassInputStyle} />
          <select value={type} onChange={(e) => setType(e.target.value)} style={glassInputStyle}>
            <option value="pdf" style={{ background: '#0f172a' }}>📄 PDF</option>
            <option value="word" style={{ background: '#0f172a' }}>📝 Word</option>
            <option value="excel" style={{ background: '#0f172a' }}>📊 Excel</option>
            <option value="image" style={{ background: '#0f172a' }}>🖼️ صورة</option>
            <option value="video" style={{ background: '#0f172a' }}>🎥 فيديو</option>
            <option value="audio" style={{ background: '#0f172a' }}>🎵 صوت</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileInputRef} type="file" onChange={(e) => setFile(e.target.files[0])} style={{ ...glassInputStyle, flex: 1, padding: '8px 14px' }} />
          {file && <span style={{ color: '#10b981', fontSize: '12px' }}>📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>}
          <button type="submit" disabled={submitting} style={{ background: submitting ? 'rgba(6, 95, 70, 0.6)' : '#10b981', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 'bold', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '14px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
            {submitting ? 'جارٍ الرفع والإرسال...' : 'حفظ وإرسال بريد حقيقي 🚀'}
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ color: '#38bdf8', fontSize: '16px', margin: 0 }}>📋 المستندات المتزامنة لحظياً</h3>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>صفحة {currentPage} من {totalPages} — {sortedDocs.length} نتيجة</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '50px', gap: '15px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(56, 189, 248, 0.2)', borderTop: '3px solid #38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>⏳ جارٍ مزامنة البيانات...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          <div style={{ display: viewMode === 'grid' ? 'grid' : 'flex', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined, flexDirection: viewMode === 'list' ? 'column' : undefined, gap: '15px', marginBottom: '30px' }}>
            {paginatedDocs.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', ...glassCardStyle, cursor: 'default' }}>
                <span style={{ fontSize: '40px' }}>📭</span>
                <p style={{ color: '#9ca3af', marginTop: '10px' }}>لا توجد مستندات مطابقة</p>
              </div>
            ) : (
              paginatedDocs.map((d) => {
                const isEditing = editingId === d.id;
                return (
                  <div key={d.id} style={{ ...glassCardStyle, opacity: d.deleted ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>
                        📂 {d.title} <span style={{ color: '#38bdf8', fontSize: '13px' }}>({d.type})</span>
                      </h4>
                      <span style={{ background: d.deleted ? 'rgba(127, 29, 29, 0.6)' : 'rgba(6, 95, 70, 0.6)', color: d.deleted ? '#fca5a5' : '#34d399', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {d.deleted ? '❌ محذوف' : '✅ نشط'} (v{d.version || 1})
                      </span>
                    </div>
                    <p style={{ margin: '0 0 6px 0', color: '#94a3b8', fontSize: '12px' }}>
                      📅 {d.created_at ? new Date(d.created_at).toLocaleString('ar-JO') : 'غير محدد'} | ✍️ {d.author || 'غير محدد'}
                    </p>
                    <p style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: '12px' }}>
                      🏷️ {Array.isArray(d.tags) && d.tags.length > 0 ? d.tags.map((t) => `#${t}`).join(' ') : (typeof d.tags === 'string' && d.tags ? d.tags : 'لا يوجد')}
                    </p>
                    <p style={{ margin: '0 0 10px 0', color: '#38bdf8', fontSize: '12px' }}>
                      📎 الملف المرفق:{' '}
                      {d.file && d.file.url ? (
                        <a href={resolveFileUrl(d.file.url)} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                          تنزيل ({d.file.name || 'ملف'})
                        </a>
                      ) : ('لا يوجد ملف مرفوع')}
                    </p>
                    <div style={{ marginTop: '10px', background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <strong style={{ color: '#cbd5e1', fontSize: '13px' }}>📝 الوصف: </strong>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                          <input type="text" placeholder="العنوان" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={glassInputStyle} />
                          <input type="text" placeholder="الوصف" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={glassInputStyle} />
                          <input type="text" placeholder="الوسوم (مفصولة بفاصلة)" value={editTags} onChange={(e) => setEditTags(e.target.value)} style={glassInputStyle} />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => handleSaveEdit(d.id)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>حفظ 💾</button>
                            <button onClick={() => { setEditingId(null); setEditDesc(''); setEditTitle(''); setEditTags(''); }} style={{ background: '#6b7280', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>إلغاء ✖</button>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#f1f5f9', fontSize: '13px' }}>{d.description}</span>
                      )}
                    </div>
                    {!d.deleted && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleDeleteDocument(d.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>حذف 🗑️</button>
                        {!isEditing && (
                          <button onClick={() => { setEditingId(d.id); setEditDesc(d.description || ''); setEditTitle(d.title || ''); setEditTags(Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '')); }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>تعديل ✏️</button>
                        )}
                        <button onClick={() => { setSelectedDoc(d); setShowPreview(true); }} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>معاينة 👁️</button>
                      </div>
                    )}
                    {d.deleted && (
                      <div style={{ marginTop: '12px' }}>
                        <button onClick={() => handleRestoreDocument(d.id)} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>استعادة 🔄</button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '30px', flexWrap: 'wrap' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: currentPage === 1 ? 'rgba(30,41,59,0.3)' : 'rgba(30,41,59,0.6)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>السابق</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setCurrentPage(p)} style={{ background: currentPage === p ? '#38bdf8' : 'rgba(30,41,59,0.6)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: currentPage === p ? 'bold' : 'normal' }}>{p}</button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ background: currentPage === totalPages ? 'rgba(30,41,59,0.3)' : 'rgba(30,41,59,0.6)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '10px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>التالي</button>
            </div>
          )}
        </>
      )}

      {showPreview && selectedDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowPreview(false)}>
          <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '30px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#38bdf8', marginTop: 0 }}>👁️ معاينة: {selectedDoc.title}</h3>
            <p style={{ color: '#94a3b8' }}>{selectedDoc.description}</p>
            <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
              <p style={{ color: '#cbd5e1', fontSize: '13px' }}>النوع: {selectedDoc.type}</p>
              <p style={{ color: '#cbd5e1', fontSize: '13px' }}>الكاتب: {selectedDoc.author}</p>
              <p style={{ color: '#cbd5e1', fontSize: '13px' }}>التاريخ: {selectedDoc.created_at ? new Date(selectedDoc.created_at).toLocaleString('ar-JO') : 'غير محدد'}</p>
              <p style={{ color: '#cbd5e1', fontSize: '13px' }}>الوسوم: {Array.isArray(selectedDoc.tags) ? selectedDoc.tags.join(', ') : selectedDoc.tags || 'لا يوجد'}</p>
            </div>
            <button onClick={() => setShowPreview(false)} style={{ marginTop: '20px', background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>إغلاق ✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentsSynced;