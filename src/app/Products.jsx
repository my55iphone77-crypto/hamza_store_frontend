import React, { useState, useEffect, useRef } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

const MAX_IMAGE_DIMENSION = 800;
const IMAGE_JPEG_QUALITY = 0.8;
const UNCATEGORIZED = "غير مصنف";

const DELIVERY_TYPES = [
  { value: "code", label: "🔑 كود جاهز (جوجل بلاي / ستيم / آيتونز...)" },
  { value: "id_topup", label: "🆔 تعبئة عن طريق آيدي (ببجي / فري فاير...)" },
  { value: "subscription", label: "🔁 اشتراك موقع (نتفليكس / شاهد...)" },
];

function fileToCompressedBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("الملف المختار ليس صورة صالحة."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("تعذّر تحميل الصورة."));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const isPng = file.type === "image/png";
        resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", isPng ? undefined : IMAGE_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Products() {
  const { apiUrl, getAuthHeaders, products = [], setProducts, globalBus, triggerGlobalSync } = useApp();

  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingState, setSavingState] = useState("");

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("الكل");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false); // نافذة إرسال الإيميل
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingEditImage, setIsUploadingEditImage] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");

  // حقول الإرسال عبر الإيميل الحقيقي
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("تقرير المنتجات والمخزون الرقمي");
  const [emailBody, setEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // حقول الإضافة الحقيقية
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [deliveryType, setDeliveryType] = useState("code");
  const [price, setPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [image, setImage] = useState("");
  const [status, setStatus] = useState("منشور");
  const [scheduledDate, setScheduledDate] = useState("");
  const [unpublishDate, setUnpublishDate] = useState("");
  const [manualStock, setManualStock] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState(3);
  const [maxStockThreshold, setMaxStockThreshold] = useState(50);
  const [newCodeText, setNewCodeText] = useState("");

  // حقول التعديل الحقيقية
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDiscountPrice, setEditDiscountPrice] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editUnpublishDate, setEditUnpublishDate] = useState("");
  const [editLowStockThreshold, setEditLowStockThreshold] = useState(3);
  const [editMaxStockThreshold, setEditMaxStockThreshold] = useState(50);
  const [editManualStock, setEditManualStock] = useState("");

  const didInit = useRef(false);

  function apiFetch(path, options = {}) {
    return fetch(`${apiUrl}${path}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
    }).then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error((data && data.error) || `فشل الطلب (${res.status})`);
      return data;
    });
  }

  const loadAll = async () => {
    try {
      const [prodData, catData] = await Promise.all([
        apiFetch("/products"),
        apiFetch("/categories"),
      ]);
      setProducts(prodData || []);
      setCategories((catData || []).map((c) => c.name));
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "تعذّر الاتصال بالسيرفر");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadAll();
  }, []);

  // المزامنة اللحظية عبر الـ Global Bus State
  useEffect(() => {
    if (globalBus && globalBus.type === "PRODUCT_SYNC") {
      loadAll();
    }
  }, [globalBus]);

  const flashSaving = (msg, syncType = "PRODUCT_SYNC") => {
    setSavingState(msg);
    setTimeout(() => setSavingState(""), 3000);
    if (typeof triggerGlobalSync === "function") {
      triggerGlobalSync({ type: syncType, timestamp: Date.now() });
    }
  };

  const handleImageFileSelect = async (e, isEdit) => {
    const file = e.target.files?.[0];
    if (!file) return;
    isEdit ? setIsUploadingEditImage(true) : setIsUploadingImage(true);
    try {
      const dataUrl = await fileToCompressedBase64(file);
      isEdit ? setEditImage(dataUrl) : setImage(dataUrl);
    } catch (err) {
      alert(err.message);
    } finally {
      isEdit ? setIsUploadingEditImage(false) : setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      await apiFetch("/categories", { method: "POST", body: JSON.stringify({ name: trimmed }) });
      setCategories((prev) => [...prev, trimmed]);
      setNewCategoryName("");
      flashSaving("✅ تمت إضافة الفئة بنجاح", "CATEGORY_SYNC");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteCategory = async (catName, e) => {
    if (e) e.stopPropagation();
    const count = products.filter(p => p.category === catName).length;
    if (!window.confirm(count > 0 ? `سيتم نقل ${count} منتج إلى قسم "${UNCATEGORIZED}". هل تريد الاستمرار؟` : `متأكد من حذف فئة "${catName}"؟`)) return;
    try {
      await apiFetch(`/categories/${encodeURIComponent(catName)}`, { method: "DELETE" });
      setCategories((prev) => prev.filter((c) => c !== catName));
      setProducts((prev) => prev.map((p) => (p.category === catName ? { ...p, category: UNCATEGORIZED } : p)));
      flashSaving("🗑️ تم حذف الفئة بنجاح", "CATEGORY_SYNC");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!name || !price) {
      alert("الرجاء إدخال اسم المنتج والسعر الأساسي على الأقل!");
      return;
    }
    const codesArray = deliveryType === "code" || deliveryType === "subscription" 
      ? newCodeText.split('\n').filter(c => c.trim() !== '') 
      : [];

    const payload = {
      name, description, category: category || UNCATEGORIZED, deliveryType,
      price: parseFloat(price), discountPrice: discountPrice ? parseFloat(discountPrice) : undefined,
      image: image || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300",
      status, scheduledDate: scheduledDate || undefined, unpublishDate: unpublishDate || undefined,
      lowStockThreshold: parseInt(lowStockThreshold) || 3,
      maxStockThreshold: parseInt(maxStockThreshold) || 50,
      codes: codesArray, stock: deliveryType === "id_topup" ? parseInt(manualStock) || 0 : codesArray.length,
    };

    try {
      const newProduct = await apiFetch("/products", { method: "POST", body: JSON.stringify(payload) });
      setProducts((prev) => [newProduct, ...prev]);
      flashSaving("✅ تم حفظ وإضافة المنتج بنجاح");
      setIsAddModalOpen(false);
      setName(""); setDescription(""); setPrice(""); setDiscountPrice(""); setImage(""); setNewCodeText(""); setManualStock("");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartEdit = (prod) => {
    setSelectedProduct(prod);
    setEditName(prod.name || "");
    setEditDescription(prod.description || "");
    setEditCategory(prod.category || "");
    setEditPrice(prod.price || "");
    setEditDiscountPrice(prod.discountPrice || "");
    setEditImage(prod.image || "");
    setEditStatus(prod.status || "منشور");
    setEditScheduledDate(prod.scheduledDate ? String(prod.scheduledDate).slice(0, 16) : "");
    setEditUnpublishDate(prod.unpublishDate ? String(prod.unpublishDate).slice(0, 16) : "");
    setEditLowStockThreshold(prod.lowStockThreshold ?? 3);
    setEditMaxStockThreshold(prod.maxStockThreshold ?? 50);
    setEditManualStock(prod.stock ?? 0);
    setIsEditing(true);
    setActiveTab("details");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const payload = {
      name: editName, description: editDescription || "", category: editCategory,
      price: parseFloat(editPrice), discountPrice: editDiscountPrice !== "" ? parseFloat(editDiscountPrice) : null,
      image: editImage, status: editStatus,
      scheduledDate: editScheduledDate || null, unpublishDate: editUnpublishDate || null,
      lowStockThreshold: parseInt(editLowStockThreshold) || 3,
      maxStockThreshold: parseInt(editMaxStockThreshold) || 50,
    };
    if (selectedProduct.deliveryType === "id_topup") payload.stock = parseInt(editManualStock) || 0;

    try {
      const updated = await apiFetch(`/products/${selectedProduct._id}`, { method: "PUT", body: JSON.stringify(payload) });
      setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setSelectedProduct(updated);
      setIsEditing(false);
      flashSaving("✅ تم تحديث المنتج بنجاح");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleTogglePublish = async (prod) => {
    const newStatus = prod.status === "منشور" ? "غير منشور" : "منشور";
    try {
      const updated = await apiFetch(`/products/${prod._id}/status`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setSelectedProduct(updated);
      flashSaving(`🔄 تم تغيير الحالة إلى: ${newStatus}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteProduct = async (id, prodName) => {
    if (!window.confirm(`هل أنت متأكد من حذف المنتج "${prodName}" نهائياً؟`)) return;
    try {
      await apiFetch(`/products/${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p._id !== id));
      setSelectedProduct(null);
      setIsEditing(false);
      flashSaving("🗑️ تم حذف المنتج بنجاح");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddCode = async (e) => {
    e.preventDefault();
    if (!newCodeText.trim()) return;
    try {
      const updated = await apiFetch(`/products/${selectedProduct._id}/codes`, { method: "POST", body: JSON.stringify({ code: newCodeText.trim() }) });
      setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setSelectedProduct(updated);
      setNewCodeText("");
      flashSaving("➕ تمت إضافة الكود بنجاح");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteCode = async (codeValue) => {
    try {
      const updated = await apiFetch(`/products/${selectedProduct._id}/codes`, { method: "DELETE", body: JSON.stringify({ code: codeValue }) });
      setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setSelectedProduct(updated);
      flashSaving("🗑️ تم حذف الكود بنجاح");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateManualStock = async (newStock) => {
    try {
      const updated = await apiFetch(`/products/${selectedProduct._id}/stock`, { method: "PATCH", body: JSON.stringify({ stock: newStock }) });
      setProducts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setSelectedProduct(updated);
      flashSaving("📦 تم تحديث المخزون بنجاح");
    } catch (err) {
      alert(err.message);
    }
  };

  // دالة إرسال الإيميل الحقيقي عبر الباك اند
  const handleSendRealEmail = async (e) => {
    e.preventDefault();
    if (!emailRecipient) {
      alert("الرجاء إدخال بريد المشتلم!");
      return;
    }
    setIsSendingEmail(true);
    try {
      await apiFetch("/send-email", {
        method: "POST",
        body: JSON.stringify({
          to: emailRecipient,
          subject: emailSubject,
          message: emailBody || `تقرير عام لعدد المنتجات: ${products.length} في متجر الكروت الرقمية.`,
        }),
      });
      alert("📧 تم إرسال البريد الإلكتروني بنجاح!");
      setIsEmailModalOpen(false);
      setEmailRecipient("");
      setEmailBody("");
    } catch (err) {
      alert("فشل إرسال الإيميل: " + err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const stockOf = (prod) => (prod.deliveryType === "id_topup" ? prod.stock || 0 : prod.codes?.length || 0);
  const deliveryLabel = (type) => DELIVERY_TYPES.find((d) => d.value === type)?.label || type;
  const fmtJOD = (n) => `${n} د.أ`;

  if (isLoading) {
    return (
      <div style={glassContainerStyle} dir="rtl">
        <div style={{ textAlign: "center", color: "#38bdf8", padding: "40px" }}>⏳ جاري تحميل لوحة التحكم والبيانات والمزامنة اللحظية...</div>
      </div>
    );
  }

  return (
    <div style={glassContainerStyle} dir="rtl">
      {/* الهيدر العلوي */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: "0 0 5px 0", color: "#f97316", fontSize: "22px", fontWeight: "bold" }}>⚡ لوحة إدارة المنتجات والمخزون الرقمي (متزامنة لحظياً)</h2>
          <p style={{ margin: "0", color: "#94a3b8", fontSize: "13px" }}>
            {loadError && <span style={{ color: "#f87171" }}>⚠️ {loadError}</span>}
            {savingState && <span style={{ color: "#34d399", fontWeight: "bold" }}> {savingState}</span>}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="بحث عن منتج أو قسم..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={glassInputStyle}
          />
          <button onClick={() => setIsEmailModalOpen(true)} style={secondaryButtonStyle}>
            📨 إرسال تقرير إيميل
          </button>
          <button onClick={() => { setIsAddModalOpen(true); setIsEditing(false); }} style={primaryButtonStyle}>
            + إضافة منتج جديد
          </button>
        </div>
      </div>

      {/* قسم إدارة الفئات */}
      <div style={glassSubContainerStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
          <h4 style={{ margin: "0", color: "#38bdf8", fontSize: "15px" }}>🏷️ الأقسام والفئات الرقمية</h4>
          <form onSubmit={handleAddCategory} style={{ display: "flex", gap: "6px" }}>
            <input
              type="text"
              placeholder="اسم الفئة الجديدة..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              style={{ ...glassInputStyle, width: "160px" }}
            />
            <button type="submit" style={secondaryButtonStyle}>+ إضافة فئة</button>
          </form>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => setSelectedCategoryFilter("الكل")} style={filterChipStyle(selectedCategoryFilter === "الكل")}>
            الكل ({products.length})
          </button>
          {categories.map((cat, idx) => {
            const count = products.filter(p => p.category === cat).length;
            return (
              <div key={idx} onClick={() => setSelectedCategoryFilter(cat)} style={filterChipStyle(selectedCategoryFilter === cat)}>
                <span>{cat} ({count})</span>
                <span onClick={(e) => handleDeleteCategory(cat, e)} style={{ color: "#ef4444", marginLeft: "6px", cursor: "pointer", fontSize: "11px" }}>✕</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* شبكة المنتجات */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "20px", marginTop: "20px" }}>
        {products.filter(prod => {
          const matchesSearch = !searchTerm || prod.name.toLowerCase().includes(searchTerm.toLowerCase()) || prod.category.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCat = selectedCategoryFilter === "الكل" || prod.category === selectedCategoryFilter;
          return matchesSearch && matchesCat;
        }).map((prod) => {
          const currentStock = stockOf(prod);
          const isLow = currentStock <= (prod.lowStockThreshold ?? 3);
          const hasDiscount = prod.discountPrice && prod.discountPrice < prod.price;
          return (
            <div key={prod._id} onClick={() => { setSelectedProduct(prod); setIsEditing(false); setActiveTab("details"); }} style={glassCardStyle}>
              <span style={badgeStyle(prod.status === "منشور")}>{prod.status}</span>
              {hasDiscount && <span style={discountBadgeStyle}>🔥 خصم</span>}
              <img src={prod.image || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300"} alt={prod.name} style={{ width: "65px", height: "65px", borderRadius: "10px", objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)", marginTop: "10px" }} />
              <div>
                <h4 style={{ margin: "4px 0", color: "#fff", fontSize: "14px", fontWeight: "bold" }}>{prod.name}</h4>
                <span style={{ fontSize: "11px", color: "#38bdf8" }}>{prod.category}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: "auto", fontSize: "12px", color: "#94a3b8" }}>
                {hasDiscount ? (
                  <span><s style={{ color: "#64748b" }}>{fmtJOD(prod.price)}</s> <strong style={{ color: "#fb923c" }}>{fmtJOD(prod.discountPrice)}</strong></span>
                ) : (
                  <span>السعر: <strong style={{ color: "#10b981" }}>{fmtJOD(prod.price)}</strong></span>
                )}
                <span>الكمية: <strong style={{ color: isLow ? "#f87171" : "#facc15" }}>{currentStock}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* نافذة إرسال الإيميل الزجاجية */}
      {isEmailModalOpen && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => setIsEmailModalOpen(false)} style={closeBtnStyle}>✕</button>
            <h3 style={{ color: "#38bdf8", margin: "0 0 15px 0" }}>📨 إرسال تقرير بريدي حقيقي</h3>
            <form onSubmit={handleSendRealEmail} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="email" placeholder="البريد الإلكتروني للمستلم *" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} style={glassInputStyle} required />
              <input type="text" placeholder="عنوان الرسالة..." value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} style={glassInputStyle} />
              <textarea placeholder="محتوى التقرير أو الملاحظات..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={4} style={glassInputStyle} />
              <button type="submit" style={primaryButtonStyle} disabled={isSendingEmail}>
                {isSendingEmail ? "⏳ جاري إرسال الإيميل..." : "إرسال الآن 🚀"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إضافة منتج جديد */}
      {isAddModalOpen && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => setIsAddModalOpen(false)} style={closeBtnStyle}>✕</button>
            <h3 style={{ color: "#10b981", margin: "0 0 15px 0" }}>+ إضافة بطاقة أو منتج جديد</h3>
            <form onSubmit={handleAddProduct} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="text" placeholder="اسم المنتج *" value={name} onChange={(e) => setName(e.target.value)} style={glassInputStyle} required />
              <textarea placeholder="وصف المنتج..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={glassInputStyle} />
              <select value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)} style={glassInputStyle}>
                {DELIVERY_TYPES.map(d => <option key={d.value} value={d.value} style={{ background: "#1e293b" }}>{d.label}</option>)}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={glassInputStyle}>
                <option value="" style={{ background: "#1e293b" }}>— اختر فئة —</option>
                {categories.map((c, i) => <option key={i} value={c} style={{ background: "#1e293b" }}>{c}</option>)}
              </select>
              <div style={{ display: "flex", gap: "10px" }}>
                <input type="number" step="0.01" placeholder="السعر *" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...glassInputStyle, flex: 1 }} required />
                <input type="number" step="0.01" placeholder="سعر الخصم" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} style={{ ...glassInputStyle, flex: 1 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="file" accept="image/*" onChange={(e) => handleImageFileSelect(e, false)} style={{ color: "#94a3b8", fontSize: "12px" }} />
                {isUploadingImage && <span style={{ color: "#38bdf8", fontSize: "11px" }}>⏳ جاري معالجة وضغط الصورة...</span>}
              </div>
              {image && <img src={image} alt="معاينة" style={{ width: "50px", height: "50px", borderRadius: "8px", objectFit: "cover" }} />}
              {deliveryType === "id_topup" ? (
                <input type="number" placeholder="الكمية المتوفرة يدوياً" value={manualStock} onChange={(e) => setManualStock(e.target.value)} style={glassInputStyle} />
              ) : (
                <textarea placeholder="الأكواد أو الاشتراكات (كل كود في سطر)..." value={newCodeText} onChange={(e) => setNewCodeText(e.target.value)} rows={3} style={{ ...glassInputStyle, fontFamily: "monospace" }} />
              )}
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={glassInputStyle}>
                <option value="منشور" style={{ background: "#1e293b" }}>🟢 منشور فوراً</option>
                <option value="غير منشور" style={{ background: "#1e293b" }}>🔴 غير منشور</option>
              </select>
              <button type="submit" style={primaryButtonStyle}>حفظ وإضافة المنتج 🚀</button>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل وتعديل المنتج */}
      {selectedProduct && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => { setSelectedProduct(null); setIsEditing(false); }} style={closeBtnStyle}>✕</button>
            {!isEditing ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "15px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px" }}>
                  <img src={selectedProduct.image || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300"} alt={selectedProduct.name} style={{ width: "65px", height: "65px", borderRadius: "10px", objectFit: "cover", border: "1px solid #38bdf8" }} />
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", color: "#fff", fontSize: "16px", fontWeight: "bold" }}>{selectedProduct.name}</h3>
                    <span style={{ fontSize: "12px", color: "#38bdf8" }}>{selectedProduct.category} · {deliveryLabel(selectedProduct.deliveryType)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", background: "rgba(15,23,42,0.6)", padding: "6px", borderRadius: "10px", marginTop: "12px" }}>
                  <button onClick={() => setActiveTab("details")} style={tabButtonStyle(activeTab === "details", "#facc15")}>📋 التفاصيل</button>
                  <button onClick={() => setActiveTab("stock")} style={tabButtonStyle(activeTab === "stock", "#38bdf8")}>
                    {selectedProduct.deliveryType === "id_topup" ? "📦 الكمية" : "🔑 الأكواد"} ({stockOf(selectedProduct)})
                  </button>
                </div>

                {activeTab === "details" ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(15,23,42,0.5)", padding: "14px", borderRadius: "10px", fontSize: "13px", marginTop: "12px" }}>
                      {selectedProduct.description && <div style={{ paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#cbd5e1" }}>{selectedProduct.description}</div>}
                      <Row label="السعر الأصلي" value={fmtJOD(selectedProduct.price)} color="#10b981" />
                      <Row label="سعر الخصم" value={selectedProduct.discountPrice ? fmtJOD(selectedProduct.discountPrice) : "لا يوجد"} color="#facc15" />
                      <Row label="الكمية الحالية" value={stockOf(selectedProduct)} color="#fff" />
                      <Row label="الحالة" value={selectedProduct.status} color={selectedProduct.status === "منشور" ? "#34d399" : "#f87171"} />
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "15px" }}>
                      <button onClick={() => handleStartEdit(selectedProduct)} style={actionBtn("#3b82f6")}>تعديل ✏️</button>
                      <button onClick={() => handleTogglePublish(selectedProduct)} style={actionBtn(selectedProduct.status === "منشور" ? "#d97706" : "#059669")}>
                        {selectedProduct.status === "منشور" ? "إلغاء النشر 🛑" : "نشر 🌐"}
                      </button>
                      <button onClick={() => handleDeleteProduct(selectedProduct._id, selectedProduct.name)} style={{ background: "#dc2626", color: "#fff", border: "none", padding: "10px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>حذف 🗑️</button>
                    </div>
                  </>
                ) : selectedProduct.deliveryType === "id_topup" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "15px" }}>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>تعديل الكمية اليدوية المتوفرة للآيدي:</div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
                      <button onClick={() => handleUpdateManualStock(Math.max(0, (selectedProduct.stock || 0) - 1))} style={stockBtnStyle}>-</button>
                      <input
                        type="number"
                        value={selectedProduct.stock || 0}
                        onChange={(e) => setSelectedProduct({ ...selectedProduct, stock: parseInt(e.target.value) || 0 })}
                        onBlur={(e) => handleUpdateManualStock(parseInt(e.target.value) || 0)}
                        style={{ ...glassInputStyle, textAlign: "center", width: "90px" }}
                      />
                      <button onClick={() => handleUpdateManualStock((selectedProduct.stock || 0) + 1)} style={stockBtnStyle}>+</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "15px" }}>
                    <form onSubmit={handleAddCode} style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="أضف كود جديد..."
                        value={newCodeText}
                        onChange={(e) => setNewCodeText(e.target.value)}
                        style={{ flex: 1, ...glassInputStyle }}
                      />
                      <button type="submit" style={secondaryButtonStyle}>+ إضافة</button>
                    </form>
                    <div style={{ maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", background: "rgba(15,23,42,0.5)", padding: "10px", borderRadius: "8px" }}>
                      {(!selectedProduct.codes || selectedProduct.codes.length === 0) ? (
                        <span style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "15px" }}>لا توجد أكواد مضافة.</span>
                      ) : (
                        selectedProduct.codes.map((code, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(30,41,59,0.7)", padding: "8px 12px", borderRadius: "6px" }}>
                            <span style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: "13px" }}>{code}</span>
                            <button onClick={() => handleDeleteCode(code)} style={{ background: "transparent", color: "#ef4444", border: "none", cursor: "pointer", fontWeight: "bold" }}>✕</button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h3 style={{ margin: "0 0 5px 0", color: "#38bdf8", fontSize: "16px", fontWeight: "bold" }}>تعديل تفاصيل المنتج</h3>
                <input type="text" placeholder="اسم المنتج..." value={editName} onChange={(e) => setEditName(e.target.value)} style={glassInputStyle} required />
                <textarea placeholder="وصف المنتج..." value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} style={glassInputStyle} />
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={glassInputStyle}>
                  {categories.map((c, i) => <option key={i} value={c} style={{ background: "#1e293b" }}>{c}</option>)}
                </select>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input type="number" step="0.01" placeholder="السعر..." value={editPrice} onChange={(e) => setEditPrice(e.target.value)} style={{ ...glassInputStyle, flex: 1 }} required />
                  <input type="number" step="0.01" placeholder="سعر الخصم..." value={editDiscountPrice} onChange={(e) => setEditDiscountPrice(e.target.value)} style={{ ...glassInputStyle, flex: 1 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="file" accept="image/*" onChange={(e) => handleImageFileSelect(e, true)} style={{ color: "#94a3b8", fontSize: "12px" }} />
                  {isUploadingEditImage && <span style={{ color: "#38bdf8", fontSize: "11px" }}>⏳ جاري المعالجة...</span>}
                </div>
                {editImage && <img src={editImage} alt="معاينة" style={{ width: "50px", height: "50px", borderRadius: "8px", objectFit: "cover" }} />}
                {selectedProduct.deliveryType === "id_topup" && (
                  <input type="number" placeholder="الكمية..." value={editManualStock} onChange={(e) => setEditManualStock(e.target.value)} style={glassInputStyle} />
                )}
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={glassInputStyle}>
                  <option value="منشور" style={{ background: "#1e293b" }}>🟢 منشور</option>
                  <option value="غير منشور" style={{ background: "#1e293b" }}>🔴 غير منشور</option>
                </select>
                <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <button type="submit" style={{ flex: 1, ...primaryButtonStyle }}>حفظ التعديلات ✅</button>
                  <button type="button" onClick={() => setIsEditing(false)} style={{ flex: 1, ...secondaryButtonStyle, background: "#334155" }}>إلغاء ✕</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// 🎨 التصميم الزجاجي الفاخر (Glassmorphism Styles)
// ------------------------------------------------------------------
const glassContainerStyle = {
  background: "rgba(15, 23, 42, 0.78)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  padding: "30px",
  borderRadius: "24px",
  color: "#fff",
  fontFamily: "Tajawal, sans-serif",
  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)"
};

const glassSubContainerStyle = {
  background: "rgba(30, 41, 59, 0.45)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "18px",
  borderRadius: "16px",
  marginTop: "20px"
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  paddingBottom: "15px",
  flexWrap: "wrap",
  gap: "15px"
};

const glassInputStyle = {
  background: "rgba(15, 23, 42, 0.65)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  padding: "10px 14px",
  borderRadius: "10px",
  color: "#fff",
  fontSize: "13px",
  outline: "none",
  width: "100%"
};

const primaryButtonStyle = {
  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
  color: "#fff",
  border: "none",
  padding: "10px 18px",
  borderRadius: "10px",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "13px",
  boxShadow: "0 4px 12px rgba(249, 115, 22, 0.3)"
};

const secondaryButtonStyle = {
  background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  color: "#fff",
  border: "none",
  padding: "8px 14px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: "bold"
};

const glassCardStyle = {
  background: "rgba(30, 41, 59, 0.55)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "16px",
  padding: "18px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "10px",
  cursor: "pointer",
  position: "relative",
  boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
};

const badgeStyle = (isPublished) => ({
  position: "absolute", top: "10px", left: "10px", fontSize: "10px", padding: "2px 8px", borderRadius: "10px",
  background: isPublished ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
  color: isPublished ? "#34d399" : "#f87171", border: "1px solid", borderColor: isPublished ? "#059669" : "#dc2626"
});

const discountBadgeStyle = {
  position: "absolute", top: "10px", right: "10px", fontSize: "10px", padding: "2px 8px", borderRadius: "10px",
  background: "rgba(249, 115, 22, 0.2)", color: "#fb923c", border: "1px solid #ea580c", fontWeight: "bold"
};

const modalOverlayStyle = {
  position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
  background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(10px)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px"
};

const modalContentStyle = {
  background: "rgba(30, 41, 59, 0.88)", backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "20px",
  padding: "25px", width: "100%", maxWidth: "480px", maxHeight: "90vh",
  overflowY: "auto", position: "relative", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)"
};

const closeBtnStyle = {
  position: "absolute", top: "15px", left: "15px", background: "rgba(255,255,255,0.1)",
  color: "#fff", border: "none", width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", fontWeight: "bold"
};

const filterChipStyle = (BusActive) => ({
  background: BusActive ? "linear-gradient(135deg, #facc15 0%, #eab308 100%)" : "rgba(15, 23, 42, 0.6)",
  color: BusActive ? "#000" : "#94a3b8", border: "1px solid rgba(255, 255, 255, 0.1)",
  padding: "6px 14px", borderRadius: "20px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", display: "flex", alignItems: "center"
});

const tabButtonStyle = (active, activeColor) => ({
  flex: 1, background: active ? "rgba(30, 41, 59, 0.9)" : "transparent",
  color: active ? activeColor : "#94a3b8", border: "none", padding: "8px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "12px"
});

const actionBtn = (bg) => ({
  flex: 1, background: bg, color: "#fff", border: "none", padding: "10px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "12px"
});

const stockBtnStyle = {
  background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", width: "36px", height: "36px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold"
};

function Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8" }}>
      <span>{label}:</span>
      <span style={{ color, fontWeight: "bold" }}>{value}</span>
    </div>
  );
}