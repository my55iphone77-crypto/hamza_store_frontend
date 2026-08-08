import React, { useState, useEffect, useRef } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Achievements({ inputStyle = {} }) {
  const fullBleedStyle = useFullBleedStyle();
  const { apiUrl, getAuthHeaders, currentUser, socket, hasPermission } = useApp();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingState, setSavingState] = useState("");

  const [achievements, setAchievements] = useState(() => {
    try {
      const saved = window.localStorage.getItem("store_achievements");
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const didInit = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("store_achievements", JSON.stringify(achievements));
      window.dispatchEvent(new Event("storage_updated"));
    } catch (e) {
      console.error("فشل الحفظ في التخزين المركزي:", e);
    }
  }, [achievements]);

  function apiFetch(path, options = {}) {
    return fetch(`${apiUrl}${path}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
    }).then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || `فشل الطلب (${res.status})`);
      return data;
    });
  }

  const loadAchievements = async () => {
    try {
      setLoadError(null);
      const data = await apiFetch("/achievements");
      if (Array.isArray(data)) {
        setAchievements(data);
      } else if (data && Array.isArray(data.achievements)) {
        setAchievements(data.achievements);
      }
    } catch (err) {
      console.error("خطأ في جلب الإنجازات:", err);
      setLoadError("تعذر الاتصال بالسيرفر — يتم الاعتماد على البيانات المحلية.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadAchievements();

    const handleStorageSync = () => {
      try {
        const updated = window.localStorage.getItem("store_achievements");
        if (updated) setAchievements(JSON.parse(updated));
      } catch (e) {}
    };

    window.addEventListener("storage", handleStorageSync);
    window.addEventListener("storage_updated", handleStorageSync);

    if (socket) {
      socket.on("achievement_added", (newAch) => {
        setAchievements((prev) => [newAch, ...(Array.isArray(prev) ? prev : [])]);
      });
      socket.on("achievement_deleted", (deletedId) => {
        setAchievements((prev) => (Array.isArray(prev) ? prev : []).filter((a) => (a.id || a._id) !== deletedId));
      });
      socket.on("achievement_updated", (updatedAch) => {
        setAchievements((prev) =>
          (Array.isArray(prev) ? prev : []).map((a) => ((a.id || a._id) === (updatedAch.id || updatedAch._id) ? updatedAch : a))
        );
      });
    }

    return () => {
      window.removeEventListener("storage", handleStorageSync);
      window.removeEventListener("storage_updated", handleStorageSync);
      if (socket) {
        socket.off("achievement_added");
        socket.off("achievement_deleted");
        socket.off("achievement_updated");
      }
    };
  }, [socket]);

  const flashSaving = (msg) => {
    setSavingState(msg);
    setTimeout(() => setSavingState(""), 3000);
  };

  const sendMailApi = async (to, subject, body, attachment = null) => {
    try {
      await apiFetch("/mails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: currentUser?.name || "نظام الإنجازات",
          recipient: to, subject, body, attachment,
          read: false, date: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("خطأ أثناء إرسال البريد:", error);
    }
  };

  const handleAddAchievement = async (e) => {
    e.preventDefault();
    if (!hasPermission || !hasPermission('view_dashboard')) {
      alert('⛔ لا تملك صلاحية إضافة إنجازات.');
      return;
    }
    const trimmedTitle = (newTitle || "").trim();
    const trimmedDesc = (newDescription || "").trim();

    if (!trimmedTitle || !trimmedDesc) {
      alert("⚠️ يرجى إدخال عنوان الإنجاز ووصفه.");
      return;
    }

    const newObj = {
      id: Date.now().toString(),
      title: trimmedTitle,
      description: trimmedDesc,
      date: new Date().toISOString()
    };

    try {
      const savedAchievement = await apiFetch("/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, description: trimmedDesc }),
      });
      if (savedAchievement) Object.assign(newObj, savedAchievement);
    } catch (err) {}

    setAchievements(prev => [newObj, ...(Array.isArray(prev) ? prev : [])]);
    flashSaving("✅ تم توثيق الإنجاز بنجاح");

    await sendMailApi(
      "manager@company.com",
      "🏆 تسجيل إنجاز مؤسسي جديد",
      `تم تسجيل إنجاز جديد: (${trimmedTitle}).\nالتفاصيل: ${trimmedDesc}\nبواسطة: ${currentUser?.name || "مدير النظام"}`,
      "achievement_report.pdf"
    );

    setNewTitle("");
    setNewDescription("");
  };

  const handleDeleteAchievement = async (id) => {
    if (!hasPermission || !hasPermission('view_dashboard')) {
      alert('⛔ لا تملك صلاحية الحذف.');
      return;
    }
    const target = (achievements || []).find((a) => (a.id || a._id) === id);
    if (!target) return;

    const confirmed = window.confirm(`هل أنت متأكد من حذف الإنجاز؟\n"${target.title}"`);
    if (!confirmed) return;

    try {
      await apiFetch(`/achievements/${id}`, { method: "DELETE" });
    } catch (err) {}

    setAchievements(prev => (Array.isArray(prev) ? prev : []).filter(a => (a.id || a._id) !== id));
    await sendMailApi("manager@company.com", "🗑️ حذف إنجاز", `تم حذف إنجاز: (${target.title}).`);
    flashSaving("🗑️ تم حذف الإنجاز بنجاح");
  };

  const startEditing = (ach) => {
    setEditingId(ach.id || ach._id);
    setEditTitle(ach.title || "");
    setEditDescription(ach.description || "");
  };

  const saveEdit = async (id) => {
    const trimmedEditTitle = (editTitle || "").trim();
    const trimmedEditDesc = (editDescription || "").trim();
    if (!trimmedEditTitle || !trimmedEditDesc) {
      alert("⚠️ لا يمكن ترك الحقول فارغة.");
      return;
    }
    try {
      await apiFetch(`/achievements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedEditTitle, description: trimmedEditDesc }),
      });
    } catch (err) {}

    setAchievements(prev => (Array.isArray(prev) ? prev : []).map(a => 
      (a.id || a._id) === id ? { ...a, title: trimmedEditTitle, description: trimmedEditDesc } : a
    ));
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    flashSaving("✅ تم تحديث الإنجاز بنجاح");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const safeAchievements = Array.isArray(achievements) ? achievements : [];
  const safeSearch = (searchTerm || "").toLowerCase();

  const filteredAchievements = safeAchievements.filter(
    (a) =>
      (a.title && a.title.toLowerCase().includes(safeSearch)) ||
      (a.description && a.description.toLowerCase().includes(safeSearch))
  );

  if (isLoading) {
    return (
      <div style={{ background: "linear-gradient(135deg, #0b0f19 0%, #111827 100%)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "60px", color: "#94a3b8", fontFamily: "Tajawal, sans-serif", textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.08)", display: 'flex', alignItems: 'center', justifyContent: 'center', ...fullBleedStyle }} dir="rtl">
        ⏳ جاري تحميل سجل الإنجازات...
      </div>
    );
  }

  return (
    <div style={{ background: "linear-gradient(135deg, #0b0f19 0%, #111827 100%)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "30px", color: "#fff", fontFamily: "Tajawal, sans-serif", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)", ...fullBleedStyle }} dir="rtl">

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "15px", flexWrap: "wrap", gap: "15px" }}>
        <div>
          <h2 style={{ margin: "0 0 5px 0", color: "#facc15", fontSize: "22px", fontWeight: "bold" }}>
            🏆 لوحة إدارة الإنجازات الشاملة
          </h2>
          <p style={{ margin: "0", color: "#94a3b8", fontSize: "13px" }}>
            متصل بكل أقسام النظام والبريد الإلكتروني.
            {loadError && <span style={{ color: "#f87171" }}> ⚠️ {loadError}</span>}
            {savingState && <span style={{ color: "#34d399", fontWeight: "bold" }}> {savingState}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button type="button" onClick={loadAchievements} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "12px", fontSize: "13px", cursor: "pointer", fontWeight: "bold" }}>
            تحديث 🔄
          </button>
          <div style={{ background: "rgba(30, 41, 59, 0.7)", color: "#38bdf8", padding: "10px 16px", borderRadius: "12px", fontSize: "13px", border: "1px solid rgba(255, 255, 255, 0.08)", fontWeight: "bold" }}>
            الإجمالي: {safeAchievements.length}
          </div>
        </div>
      </div>

      <form onSubmit={handleAddAchievement} style={{ background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "20px", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.08)", marginBottom: "25px", display: "flex", flexDirection: "column", gap: "15px" }}>
        <h4 style={{ margin: "0", color: "#38bdf8", fontSize: "15px" }}>➕ توثيق إنجاز مؤسسي جديد</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <input type="text" placeholder="عنوان الإنجاز..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "10px 14px", borderRadius: "10px", color: "#fff", fontSize: "13px", fontFamily: 'Tajawal, sans-serif' }} />
          <input type="text" placeholder="تفاصيل الإنجاز..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "10px 14px", borderRadius: "10px", color: "#fff", fontSize: "13px", fontFamily: 'Tajawal, sans-serif' }} />
        </div>
        <button type="submit" style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
          إضافة وتوثيق وإرسال إيميل ⚡📧
        </button>
      </form>

      <div style={{ background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "20px", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.08)", marginBottom: "25px", display: "flex", flexDirection: "column", gap: "15px" }}>
        <h4 style={{ margin: "0", color: "#facc15", fontSize: "14px" }}>🔍 البحث في سجل الإنجازات</h4>
        <input type="text" placeholder="ابحث في عناوين ووصف الإنجازات..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "10px 14px", borderRadius: "10px", color: "#fff", fontSize: "13px", fontFamily: 'Tajawal, sans-serif' }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {filteredAchievements.length === 0 ? (
          <p style={{ color: "#94a3b8", textAlign: "center", padding: "20px" }}>
            {safeAchievements.length === 0 ? "لا توجد أي إنجازات مسجّلة بعد." : "لا توجد إنجازات مطابقة"}
          </p>
        ) : (
          filteredAchievements.map((a) => {
            const currentId = a.id || a._id;
            return (
              <div key={currentId} style={{ background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "16px", borderRadius: "14px", border: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>

                {editingId === currentId ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1" }}>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "8px 12px", borderRadius: "8px", color: "#fff", fontSize: "13px", fontFamily: 'Tajawal, sans-serif' }} />
                    <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "8px 12px", borderRadius: "8px", color: "#fff", fontSize: "13px", fontFamily: 'Tajawal, sans-serif' }} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "13px" }}>
                      <span style={{ color: "#94a3b8" }}>📅 {a.date ? new Date(a.date).toLocaleString("ar-JO") : "وقت سابق"}</span>
                      <strong style={{ color: "#facc15", fontSize: "15px" }}>{a.title}</strong>
                    </div>
                    <p style={{ margin: "4px 0 0 0", color: "#fff", fontSize: "14px" }}>📝 {a.description}</p>
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px" }}>
                  {editingId === currentId ? (
                    <>
                      <button type="button" onClick={() => saveEdit(currentId)} style={{ background: "#10b981", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>
                        حفظ ✔️
                      </button>
                      <button type="button" onClick={cancelEdit} style={{ background: "#4b5563", color: "#fff", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>
                        إلغاء
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startEditing(a)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>
                      تعديل ✏️
                    </button>
                  )}
                  <button type="button" onClick={() => handleDeleteAchievement(currentId)} style={{ background: "#ef4444", color: "#fff", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>
                    حذف 🗑️
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Achievements;