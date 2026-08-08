import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function canManageContacts(role) {
  return ["admin", "manager"].includes(role);
}

function Contacts({ inputStyle = {} }) {
  const fullBleedStyle = useFullBleedStyle();
  const contextData = useApp() || {};
  const {
    token,
    apiUrl,
    apiRequest,
    getAuthHeaders,
    contacts = [],
    setContacts = () => {},
    setEmployees = () => {},
    setMails = () => {},
    currentUser = { role: "guest", name: "زائر" }
  } = contextData;

  const [internalContacts, setInternalContacts] = useState([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newRole, setNewRole] = useState("employee");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedContact, setSelectedContact] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const rawContacts = Array.isArray(contacts) && contacts.length > 0 ? contacts : internalContacts;
  const safeContacts = Array.isArray(rawContacts) ? rawContacts : [];

  const getGlassEmailTemplate = (title, contentHtml) => `
    <div style="font-family: 'Tajawal', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px; direction: rtl; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-top: 0;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.8; color: #cbd5e1;">${contentHtml}</div>
        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b; text-align: center;">
          نظام إدارة جهات الاتصال &bull; ${new Date().toLocaleDateString('ar-SA')}
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
    const options = { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) };
    const res = await fetch(`${apiUrl || ''}${endpoint}`, options);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `خطأ في الخادم: ${res.status}`);
    }
    return res.json().catch(() => ({}));
  }, [apiRequest, getAuthHeaders, apiUrl, token]);

  const updateContacts = useCallback((newList) => {
    setInternalContacts(newList);
    if (typeof setContacts === "function") setContacts(newList);
    if (typeof setEmployees === "function") setEmployees(newList);
  }, [setContacts, setEmployees]);

  const fetchServerData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await secureApiRequest("/contacts", "GET");
      if (response) {
        const list = Array.isArray(response) ? response : (response.contacts || []);
        updateContacts(list);
      }
    } catch (err) {
      console.error("خطأ في جلب جهات الاتصال من السيرفر:", err);
    } finally {
      setIsLoading(false);
    }
  }, [secureApiRequest, updateContacts]);

  useEffect(() => {
    fetchServerData();
  }, [fetchServerData]);

  const sendNotifications = async (recipientEmail, subject, rawBody) => {
    try {
      const mailRes = await secureApiRequest("/mails", "POST", {
        sender: currentUser?.name || "نظام جهات الاتصال",
        recipient: recipientEmail,
        subject,
        body: rawBody,
        read: false
      }).catch(() => null);
      const savedMail = mailRes?.mail || mailRes || { id: Date.now(), recipient: recipientEmail, subject, body: rawBody };
      if (typeof setMails === 'function') {
        setMails(prev => [...(Array.isArray(prev) ? prev : []), savedMail]);
      }
      if (recipientEmail) {
        const styledHtml = getGlassEmailTemplate(subject, `<p>${rawBody}</p>`);
        await secureApiRequest("/sendExternalMail", "POST", { to: recipientEmail, subject, body: styledHtml }).catch(() => {});
      }
    } catch (err) {
      console.error("خطأ في إرسال الإشعارات والبريد:", err);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!canManageContacts(currentUser?.role)) {
      alert("❌ لا تملك صلاحية إضافة موظفين.");
      return;
    }
    const trimmedName = typeof newName === 'string' ? newName.trim() : '';
    const trimmedEmail = typeof newEmail === 'string' ? newEmail.trim() : '';
    const trimmedPhone = typeof newPhone === 'string' ? newPhone.trim() : '';
    const trimmedImage = typeof newImage === 'string' ? newImage.trim() : '';

    if (!trimmedName || !trimmedEmail || !trimmedPhone) {
      alert("الرجاء تعبئة الحقول الأساسية بدقة.");
      return;
    }

    const newContactObj = {
      id: 'cont_' + Date.now(),
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      image: trimmedImage || null,
      role: newRole,
      status: "نشط",
      createdAt: new Date().toISOString()
    };

    try {
      const response = await secureApiRequest("/contacts", "POST", newContactObj);
      const savedContact = response?.contact || response || newContactObj;
      const updatedList = [...safeContacts, savedContact];
      updateContacts(updatedList);

      await sendNotifications("manager@company.com", "👤 إضافة موظف جديد", `تم إضافة الموظف ${trimmedName} (${newRole}) بنجاح إلى النظام.`);
      if (trimmedEmail) {
        await sendNotifications(trimmedEmail, "🎉 مرحباً بك في فريقنا", `أهلاً بك ${trimmedName}، يسعدنا انضمامك إلى فريق العمل كـ ${newRole}.`);
      }

      setNewName(""); setNewEmail(""); setNewPhone(""); setNewImage(""); setNewRole("employee");
      setShowAddModal(false);
      setStatusMessage("✅ تمت إضافة الموظف بنجاح.");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      console.error("خطأ في إضافة الموظف:", err);
      alert("فشل في إضافة الموظف، يرجى المحاولة لاحقاً.");
    }
  };

  const handleDeleteContact = async (id, empName, empEmail) => {
    if (!canManageContacts(currentUser?.role)) {
      alert("❌ لا تملك صلاحية حذف موظفين.");
      return;
    }
    if (!id || !window.confirm(`هل أنت متأكد من حذف الموظف "${empName}" بشكل نهائي؟`)) return;

    try {
      await secureApiRequest(`/contacts/${encodeURIComponent(id)}`, "DELETE");
      const updatedList = safeContacts.filter((c) => (c._id || c.id) !== id);
      updateContacts(updatedList);
      await sendNotifications("manager@company.com", "🗑️ حذف موظف", `تم حذف الموظف ${empName || 'غير معروف'} من النظام.`);
      if (empEmail) {
        await sendNotifications(empEmail, "⚠️ تنبيه إداري", `عزيزي ${empName}، نود إعلامك بأنه تم إنهاء ارتباطك بالنظام.`);
      }
      setSelectedContact(null);
      setStatusMessage("🗑️ تم حذف الموظف بنجاح.");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      console.error("خطأ في حذف الموظف:", err);
      alert("فشل في حذف الموظف، يرجى المحاولة لاحقاً.");
    }
  };

  const handleUpdateContact = async (id, field, value) => {
    if (!canManageContacts(currentUser?.role)) {
      alert("❌ لا تملك صلاحية تعديل بيانات الموظفين.");
      return;
    }
    if (!id) return;
    try {
      const contactToUpdate = safeContacts.find(c => (c._id || c.id) === id);
      if (!contactToUpdate) return;
      const sanitizedValue = typeof value === 'string' ? value.trim() : value;
      const updatedData = { ...contactToUpdate, [field]: sanitizedValue, lastModified: new Date().toISOString() };
      await secureApiRequest(`/contacts/${encodeURIComponent(id)}`, "PUT", updatedData);
      const updatedList = safeContacts.map((c) => ((c._id || c.id) === id ? updatedData : c));
      updateContacts(updatedList);
    } catch (err) {
      console.error("خطأ في تحديث بيانات الموظف:", err);
      alert("فشل في تحديث بيانات الموظف.");
    }
  };

  const safeSearchTerm = typeof searchTerm === 'string' ? searchTerm.toLowerCase() : '';
  const filteredContacts = safeContacts.filter((c) => {
    if (!c) return false;
    return (
      (c.name || "").toLowerCase().includes(safeSearchTerm) ||
      (c.email || "").toLowerCase().includes(safeSearchTerm) ||
      (c.phone || "").includes(safeSearchTerm) ||
      (c.role || "").toLowerCase().includes(safeSearchTerm)
    );
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
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer'
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

  const btnPrimary = {
    background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
    boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)'
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

  const modalOverlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: '20px', boxSizing: 'border-box', overflowY: 'auto'
  };

  const modalContentStyle = {
    background: 'rgba(17, 24, 39, 0.9)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '24px',
    padding: '30px',
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    position: 'relative',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
  };

  const closeButtonStyle = {
    position: 'absolute', top: '20px', left: '20px',
    background: 'rgba(255, 255, 255, 0.1)', color: '#fff',
    border: 'none', width: '32px', height: '32px', borderRadius: '50%',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  };

  const avatarStyle = {
    width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #38bdf8'
  };

  const placeholderAvatarStyle = {
    width: '80px', height: '80px', borderRadius: '50%',
    background: 'rgba(31, 41, 55, 0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '32px', border: '3px solid rgba(255, 255, 255, 0.1)'
  };

  return (
    <div style={glassContainerStyle} dir="rtl">
      {/* ─── الرأس ─── */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#ec4899', fontSize: '22px', fontWeight: 'bold' }}>
            📇 جهات الاتصال والموظفين
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
            إدارة بيانات الموظفين والاتصال بهم مع المزامنة الحية
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 ابحث بالاسم، الإيميل، الهاتف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...glassInputStyle, width: '250px' }}
          />
          {canManageContacts(currentUser?.role) && (
            <button onClick={() => setShowAddModal(true)} style={btnPrimary}>
              ➕ إضافة موظف
            </button>
          )}
          <button onClick={fetchServerData} disabled={isLoading} style={{ ...btnSecondary, opacity: isLoading ? 0.6 : 1 }}>
            {isLoading ? 'جاري...' : '↻ تحديث'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', color: '#34d399' }}>
          {statusMessage}
        </div>
      )}

      {/* ─── شبكة البطاقات ─── */}
      {isLoading ? (
        <p style={{ color: '#38bdf8', textAlign: 'center', padding: '30px' }}>جاري مزامنة جهات الاتصال من السيرفر...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {filteredContacts.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <p style={{ fontSize: '18px' }}>📇 لا توجد جهات اتصال مطابقة</p>
            </div>
          ) : (
            filteredContacts.map((c) => {
              const contactId = c._id || c.id;
              return (
                <div
                  key={contactId}
                  style={glassCardStyle}
                  onClick={() => setSelectedContact(c)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                    {c.image ? (
                      <img src={c.image} alt={c.name} style={avatarStyle} />
                    ) : (
                      <div style={placeholderAvatarStyle}>👤</div>
                    )}
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{c.name}</h4>
                      <span style={{
                        fontSize: '11px', color: c.role === 'admin' ? '#f59e0b' : c.role === 'manager' ? '#38bdf8' : '#10b981',
                        fontWeight: 'bold', background: 'rgba(15, 23, 42, 0.6)', padding: '4px 10px',
                        borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'inline-block'
                      }}>
                        {c.role === 'admin' ? '👑 مدير' : c.role === 'manager' ? '🛡️ مشرف' : '👤 موظف'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                      <div>📧 {c.email}</div>
                      <div>📱 {c.phone}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>انقر للتفاصيل والتعديل 🔍</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── نافذة الإضافة ─── */}
      {showAddModal && (
        <div style={modalOverlayStyle} onClick={() => setShowAddModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddModal(false)} style={closeButtonStyle}>✕</button>
            <h3 style={{ margin: '0 0 5px 0', color: '#ec4899', fontSize: '18px', fontWeight: 'bold' }}>➕ إضافة موظف جديد</h3>
            <p style={{ margin: '0 0 15px 0', color: '#94a3b8', fontSize: '12px' }}>سيتم حفظ البيانات فوراً وبثها لكل أقسام النظام.</p>

            <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="اسم الموظف... *" value={newName} onChange={(e) => setNewName(e.target.value)} style={glassInputStyle} />
              <input type="email" placeholder="الإيميل... *" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={glassInputStyle} dir="ltr" />
              <input type="text" placeholder="رقم الهاتف... *" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} style={glassInputStyle} dir="ltr" />
              <input type="text" placeholder="رابط صورة الموظف..." value={newImage} onChange={(e) => setNewImage(e.target.value)} style={glassInputStyle} dir="ltr" />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={glassInputStyle}>
                <option value="employee" style={{ background: '#111827' }}>👤 موظف</option>
                <option value="manager" style={{ background: '#111827' }}>🛡️ مشرف</option>
                <option value="admin" style={{ background: '#111827' }}>👑 مدير</option>
              </select>
              <button type="submit" style={{ ...btnPrimary, marginTop: '10px' }}>💾 حفظ وإضافة</button>
            </form>
          </div>
        </div>
      )}

      {/* ─── نافذة التفاصيل / التعديل ─── */}
      {selectedContact && (
        <div style={modalOverlayStyle} onClick={() => setSelectedContact(null)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedContact(null)} style={closeButtonStyle}>✕</button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px' }}>
              {selectedContact.image ? (
                <img src={selectedContact.image} alt={selectedContact.name} style={{ ...avatarStyle, width: '100px', height: '100px' }} />
              ) : (
                <div style={{ ...placeholderAvatarStyle, width: '100px', height: '100px', fontSize: '40px' }}>👤</div>
              )}
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '20px' }}>{selectedContact.name}</h3>
                <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>
                  {selectedContact.role === 'admin' ? '👑 مدير عام' : selectedContact.role === 'manager' ? '🛡️ مشرف' : '👤 موظف'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>الاسم:</label>
                <input
                  type="text"
                  defaultValue={selectedContact.name}
                  onBlur={(e) => handleUpdateContact(selectedContact._id || selectedContact.id, "name", e.target.value)}
                  style={glassInputStyle}
                  disabled={!canManageContacts(currentUser?.role)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>البريد الإلكتروني:</label>
                <input
                  type="email"
                  defaultValue={selectedContact.email}
                  onBlur={(e) => handleUpdateContact(selectedContact._id || selectedContact.id, "email", e.target.value)}
                  style={glassInputStyle}
                  dir="ltr"
                  disabled={!canManageContacts(currentUser?.role)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>رقم الهاتف:</label>
                <input
                  type="text"
                  defaultValue={selectedContact.phone}
                  onBlur={(e) => handleUpdateContact(selectedContact._id || selectedContact.id, "phone", e.target.value)}
                  style={glassInputStyle}
                  dir="ltr"
                  disabled={!canManageContacts(currentUser?.role)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>رابط الصورة:</label>
                <input
                  type="text"
                  defaultValue={selectedContact.image || ''}
                  onBlur={(e) => handleUpdateContact(selectedContact._id || selectedContact.id, "image", e.target.value)}
                  style={glassInputStyle}
                  dir="ltr"
                  disabled={!canManageContacts(currentUser?.role)}
                />
              </div>
            </div>

            {canManageContacts(currentUser?.role) && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={() => handleDeleteContact(selectedContact._id || selectedContact.id, selectedContact.name, selectedContact.email)}
                  style={{ flex: 1, ...btnDanger, padding: '10px' }}
                >
                  🗑️ حذف الموظف
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Contacts;