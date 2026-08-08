import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function canManageCustomers(role) {
  if (!role) return false;
  return ["admin", "manager", "sales", "owner"].includes(role);
}

function Customers({ inputStyle = {} }) {
  const contextData = useApp() || {};
  const {
    apiUrl, getAuthHeaders, apiRequest,
    currentUser = {},
    customers = [], setCustomers = () => {},
    setContacts = () => {},
    setMails = () => {},
  } = contextData;

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const safeCurrentUser = currentUser || {};
  const safeCustomers = Array.isArray(customers) ? customers : [];

  const getGlassEmailTemplate = (title, contentHtml) => `
    <div style="font-family: 'Tajawal', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px; direction: rtl; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color: #22c55e; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-top: 0;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.8; color: #cbd5e1;">${contentHtml}</div>
        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b; text-align: center;">
          نظام إدارة العملاء CRM &bull; ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    </div>
  `;

  const secureApiRequest = useCallback(async (path, method = "GET", body = null) => {
    if (typeof apiRequest === "function") return apiRequest(path, method, body);
    const headers = {
      ...(typeof getAuthHeaders === "function" ? getAuthHeaders() : {}),
      "Content-Type": "application/json"
    };
    const res = await fetch(`${apiUrl || ""}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `فشل الطلب (${res.status})`);
    return data;
  }, [apiUrl, getAuthHeaders, apiRequest]);

  const fetchServerData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await secureApiRequest("/customers", "GET");
      if (Array.isArray(data)) setCustomers(data);
      else if (data && Array.isArray(data.customers)) setCustomers(data.customers);
    } catch (err) {
      console.error("خطأ في جلب العملاء من السيرفر:", err);
    } finally {
      setIsLoading(false);
    }
  }, [secureApiRequest, setCustomers]);

  useEffect(() => {
    fetchServerData();
  }, [fetchServerData]);

  const sendMail = async (to, subject, rawBody, attachment = null) => {
    try {
      const mailPayload = {
        sender: safeCurrentUser?.name || "نظام CRM المركزي",
        recipient: to, subject, body: rawBody, attachment, read: false
      };
      const saved = await secureApiRequest("/mails", "POST", mailPayload).catch(() => null);
      const savedMail = saved?.mail || saved || { id: Date.now(), ...mailPayload };
      if (typeof setMails === "function") setMails((prev) => [...(Array.isArray(prev) ? prev : []), savedMail]);
      if (to) {
        const styledHtml = getGlassEmailTemplate(subject, `<p>${rawBody}</p>${attachment ? `<p style="margin-top: 15px; color: #38bdf8;">📎 المرفق: ${attachment}</p>` : ''}`);
        await secureApiRequest("/sendExternalMail", "POST", { to, subject, body: styledHtml }).catch(() => {});
      }
    } catch (err) {
      console.error("خطأ في إرسال البريد والإشعارات:", err);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!canManageCustomers(safeCurrentUser.role) && !safeCurrentUser.isOwner) {
      alert("❌ لا تملك صلاحية إضافة عملاء.");
      return;
    }
    const trimmedName = typeof newName === 'string' ? newName.trim() : '';
    const trimmedEmail = typeof newEmail === 'string' ? newEmail.trim() : '';
    const trimmedPhone = typeof newPhone === 'string' ? newPhone.trim() : '';
    const trimmedImage = typeof newImage === 'string' ? newImage.trim() : '';
    const trimmedAddress = typeof newAddress === 'string' ? newAddress.trim() : '';

    if (!trimmedName || !trimmedEmail || !trimmedPhone) {
      alert("الرجاء تعبئة الحقول الأساسية للعميل بدقة.");
      return;
    }

    try {
      const response = await secureApiRequest("/customers", "POST", {
        name: trimmedName, email: trimmedEmail, phone: trimmedPhone,
        image: trimmedImage || null, address: trimmedAddress || null,
        createdAt: new Date().toISOString(), status: 'active'
      });
      const savedCustomer = response?.customer || response || { name: trimmedName, email: trimmedEmail, phone: trimmedPhone };
      setCustomers((prev) => [...(Array.isArray(prev) ? prev : []), savedCustomer]);
      if (typeof setContacts === "function") setContacts((prev) => [...(Array.isArray(prev) ? prev : []), savedCustomer]);

      await sendMail(trimmedEmail, "🎉 أهلاً بك في متجرنا",
        `مرحباً ${trimmedName}، شكراً لتسجيلك معنا! نتطلع لخدمتك.`, "welcome_coupon.pdf");

      setNewName(""); setNewEmail(""); setNewPhone(""); setNewImage(""); setNewAddress("");
      setShowAddModal(false);
      setStatusMessage("✅ تمت إضافة العميل بنجاح وتم إرسال البريد الترحيبي.");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      console.error("خطأ في إضافة العميل:", err);
      alert(err.message || "فشل في إضافة العميل، يرجى المحاولة لاحقاً.");
    }
  };

  const handleDeleteCustomer = async (id, custName, custEmail) => {
    if (!canManageCustomers(safeCurrentUser.role) && !safeCurrentUser.isOwner) {
      alert("❌ لا تملك صلاحية حذف العملاء.");
      return;
    }
    if (!id || !window.confirm(`هل أنت متأكد من حذف العميل "${custName}" بشكل نهائي؟`)) return;

    try {
      await secureApiRequest(`/customers/${encodeURIComponent(id)}`, "DELETE");
      setCustomers((prev) => safeCustomers.filter((c) => (c._id || c.id) !== id));
      if (typeof setContacts === "function") {
        setContacts((prev) => (Array.isArray(prev) ? prev : []).filter((c) => (c._id || c.id) !== id));
      }
      await sendMail("manager@company.com", "🗑️ حذف عميل", `تم حذف العميل ${custName || "غير معروف"} من النظام.`);
      if (custEmail) await sendMail(custEmail, "تحديث بخصوص حسابك", `عزيزي العميل، تم إغلاق حسابك وإزالة بياناتك بناءً على طلب إداري.`);
      setSelectedCustomer(null);
      setStatusMessage("🗑️ تم حذف العميل بنجاح.");
      setTimeout(() => setStatusMessage(""), 3000);
    } catch (err) {
      console.error("خطأ في حذف العميل:", err);
      alert(err.message || "فشل في حذف العميل من الخادم.");
    }
  };

  const handleUpdateCustomer = async (id, field, value) => {
    if (!canManageCustomers(safeCurrentUser.role) && !safeCurrentUser.isOwner) {
      alert("❌ لا تملك صلاحية تعديل بيانات العملاء.");
      return;
    }
    if (!id) return;
    try {
      const customerToUpdate = safeCustomers.find((c) => (c._id || c.id) === id);
      if (!customerToUpdate) return;
      const sanitizedValue = typeof value === 'string' ? value.trim() : value;
      const updatedData = { ...customerToUpdate, [field]: sanitizedValue, lastModified: new Date().toISOString() };
      const saved = await secureApiRequest(`/customers/${encodeURIComponent(id)}`, "PUT", updatedData);
      const updatedCustomer = saved?.customer || saved || updatedData;
      setCustomers((prev) => safeCustomers.map((c) => ((c._id || c.id) === id ? updatedCustomer : c)));
      if (typeof setContacts === "function") {
        setContacts((prev) => (Array.isArray(prev) ? prev : []).map((c) => ((c._id || c.id) === id ? updatedCustomer : c)));
      }
    } catch (err) {
      console.error("خطأ في تحديث العميل:", err);
      alert(err.message || "فشل في تحديث بيانات العميل على الخادم.");
    }
  };

  const filteredCustomers = safeCustomers.filter((c) => {
    if (!c) return false;
    const sTerm = (searchTerm || "").toLowerCase();
    const nameMatch = (c.name || "").toLowerCase().includes(sTerm);
    const emailMatch = (c.email || "").toLowerCase().includes(sTerm);
    const phoneMatch = (c.phone || "").includes(sTerm);
    const addressMatch = (c.address || "").toLowerCase().includes(sTerm);
    const matchesSearch = nameMatch || emailMatch || phoneMatch || addressMatch;
    if (!matchesSearch) return false;
    if (filterType === "all") return true;
    if (filterType === "active") return c.status === 'active';
    if (filterType === "inactive") return c.status !== 'active';
    return true;
  });

  const canManage = canManageCustomers(safeCurrentUser.role) || safeCurrentUser.isOwner;

  const stats = useMemo(() => {
    return {
      total: safeCustomers.length,
      active: safeCustomers.filter(c => c?.status === 'active').length,
      inactive: safeCustomers.filter(c => c?.status !== 'active').length
    };
  }, [safeCustomers]);

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
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
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
    width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #22c55e'
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
          <h2 style={{ margin: '0 0 5px 0', color: '#22c55e', fontSize: '22px', fontWeight: 'bold' }}>
            👥 إدارة العملاء (CRM)
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
            قاعدة بيانات العملاء مع المزامنة الحية والإشعارات
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
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...glassInputStyle, width: '130px' }}>
            <option value="all" style={{ background: '#111827' }}>🌍 الكل</option>
            <option value="active" style={{ background: '#111827' }}>✅ نشط</option>
            <option value="inactive" style={{ background: '#111827' }}>❌ غير نشط</option>
          </select>
          {canManage && (
            <button onClick={() => setShowAddModal(true)} style={btnPrimary}>
              ➕ إضافة عميل
            </button>
          )}
          <button onClick={fetchServerData} disabled={isLoading} style={{ ...btnSecondary, opacity: isLoading ? 0.6 : 1 }}>
            {isLoading ? 'جاري...' : '↻ تحديث'}
          </button>
        </div>
      </div>

      {/* ─── الإحصائيات ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
        <div style={statCardStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>👥 إجمالي العملاء</span>
          <h3 style={{ margin: '5px 0 0 0', color: '#38bdf8', fontSize: '22px' }}>{stats.total}</h3>
        </div>
        <div style={statCardStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>✅ نشط</span>
          <h3 style={{ margin: '5px 0 0 0', color: '#10b981', fontSize: '22px' }}>{stats.active}</h3>
        </div>
        <div style={statCardStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>❌ غير نشط</span>
          <h3 style={{ margin: '5px 0 0 0', color: '#ef4444', fontSize: '22px' }}>{stats.inactive}</h3>
        </div>
      </div>

      {statusMessage && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', color: '#34d399' }}>
          {statusMessage}
        </div>
      )}

      {/* ─── شبكة البطاقات ─── */}
      {isLoading ? (
        <p style={{ color: '#38bdf8', textAlign: 'center', padding: '30px' }}>جاري مزامنة بيانات العملاء من الخادم...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {filteredCustomers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <p style={{ fontSize: '18px' }}>👥 لا يوجد عملاء مطابقين</p>
            </div>
          ) : (
            filteredCustomers.map((c) => {
              if (!c) return null;
              const cid = c._id || c.id;
              return (
                <div key={cid} style={glassCardStyle} onClick={() => setSelectedCustomer(c)}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                    {c.image ? (
                      <img src={c.image} alt={c.name || "Customer"} style={avatarStyle} />
                    ) : (
                      <div style={placeholderAvatarStyle}>👤</div>
                    )}
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{c.name}</h4>
                      <span style={{
                        fontSize: '11px', color: c.status === 'active' ? '#10b981' : '#ef4444',
                        fontWeight: 'bold', background: 'rgba(15, 23, 42, 0.6)', padding: '4px 10px',
                        borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'inline-block'
                      }}>
                        {c.status === 'active' ? '✅ نشط' : '❌ غير نشط'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
                      <div>📧 {c.email}</div>
                      <div>📱 {c.phone}</div>
                      {c.address && <div>📍 {c.address}</div>}
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
            <h3 style={{ margin: '0 0 5px 0', color: '#22c55e', fontSize: '18px', fontWeight: 'bold' }}>➕ إضافة عميل جديد</h3>
            <p style={{ margin: '0 0 15px 0', color: '#94a3b8', fontSize: '12px' }}>سيتم حفظ البيانات فوراً وبثها لكل أقسام النظام.</p>

            <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="اسم العميل... *" value={newName} onChange={(e) => setNewName(e.target.value)} style={glassInputStyle} />
              <input type="email" placeholder="الإيميل... *" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={glassInputStyle} dir="ltr" />
              <input type="text" placeholder="رقم الهاتف... *" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} style={glassInputStyle} dir="ltr" />
              <input type="text" placeholder="العنوان..." value={newAddress} onChange={(e) => setNewAddress(e.target.value)} style={glassInputStyle} />
              <input type="text" placeholder="رابط صورة العميل..." value={newImage} onChange={(e) => setNewImage(e.target.value)} style={glassInputStyle} dir="ltr" />
              <button type="submit" style={{ ...btnPrimary, marginTop: '10px' }}>💾 حفظ وإضافة</button>
            </form>
          </div>
        </div>
      )}

      {/* ─── نافذة التفاصيل ─── */}
      {selectedCustomer && (
        <div style={modalOverlayStyle} onClick={() => setSelectedCustomer(null)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedCustomer(null)} style={closeButtonStyle}>✕</button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px' }}>
              {selectedCustomer.image ? (
                <img src={selectedCustomer.image} alt={selectedCustomer.name} style={{ ...avatarStyle, width: '100px', height: '100px' }} />
              ) : (
                <div style={{ ...placeholderAvatarStyle, width: '100px', height: '100px', fontSize: '40px' }}>👤</div>
              )}
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '20px' }}>{selectedCustomer.name}</h3>
                <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 'bold' }}>
                  {selectedCustomer.status === 'active' ? '✅ عميل نشط' : '❌ غير نشط'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>الاسم:</label>
                <input type="text" defaultValue={selectedCustomer.name || ""} onBlur={(e) => handleUpdateCustomer(selectedCustomer._id || selectedCustomer.id, "name", e.target.value)} style={glassInputStyle} disabled={!canManage} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>البريد الإلكتروني:</label>
                <input type="email" defaultValue={selectedCustomer.email || ""} onBlur={(e) => handleUpdateCustomer(selectedCustomer._id || selectedCustomer.id, "email", e.target.value)} style={glassInputStyle} disabled={!canManage} dir="ltr" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>رقم الهاتف:</label>
                <input type="text" defaultValue={selectedCustomer.phone || ""} onBlur={(e) => handleUpdateCustomer(selectedCustomer._id || selectedCustomer.id, "phone", e.target.value)} style={glassInputStyle} disabled={!canManage} dir="ltr" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>العنوان:</label>
                <input type="text" defaultValue={selectedCustomer.address || ""} onBlur={(e) => handleUpdateCustomer(selectedCustomer._id || selectedCustomer.id, "address", e.target.value)} style={glassInputStyle} disabled={!canManage} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>رابط الصورة:</label>
                <input type="text" defaultValue={selectedCustomer.image || ""} onBlur={(e) => handleUpdateCustomer(selectedCustomer._id || selectedCustomer.id, "image", e.target.value)} style={glassInputStyle} disabled={!canManage} dir="ltr" />
              </div>
            </div>

            {canManage && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={() => handleDeleteCustomer(selectedCustomer._id || selectedCustomer.id, selectedCustomer.name, selectedCustomer.email)} style={{ flex: 1, ...btnDanger, padding: '10px' }}>
                  🗑️ حذف العميل
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;