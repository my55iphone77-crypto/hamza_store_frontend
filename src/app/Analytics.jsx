import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Analytics() {
  const fullBleedStyle = useFullBleedStyle();
  const contextData = useApp() || {};
  const {
    token, apiUrl, apiRequest, getAuthHeaders,
    currentUser, socket,
    employees = [], customers = [], products = [],
    accountingTransactions: transactions = [],
    tickets = [], workHours = [],
    setEmployees = () => {}, setCustomers = () => {},
    setProducts = () => {}, setAccountingTransactions: setTransactions = () => {},
    setTickets = () => {}, setWorkHours = () => {}
  } = contextData;

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [savingState, setSavingState] = useState("");
  const didInit = useRef(false);

  useEffect(() => {
    try {
      const syncGlobalData = () => {
        try {
          const savedTrans = window.localStorage.getItem("store_accountingTransactions");
          if (savedTrans && typeof setTransactions === 'function') setTransactions(JSON.parse(savedTrans));
          const savedProd = window.localStorage.getItem("store_products");
          if (savedProd && typeof setProducts === 'function') setProducts(JSON.parse(savedProd));
          const savedEmp = window.localStorage.getItem("store_employees");
          if (savedEmp && typeof setEmployees === 'function') setEmployees(JSON.parse(savedEmp));
          const savedCust = window.localStorage.getItem("store_customers");
          if (savedCust && typeof setCustomers === 'function') setCustomers(JSON.parse(savedCust));
          const savedTick = window.localStorage.getItem("store_tickets");
          if (savedTick && typeof setTickets === 'function') setTickets(JSON.parse(savedTick));
          const savedWork = window.localStorage.getItem("store_workHours");
          if (savedWork && typeof setWorkHours === 'function') setWorkHours(JSON.parse(savedWork));
        } catch (e) {}
      };
      window.addEventListener("storage", syncGlobalData);
      window.addEventListener("storage_updated", syncGlobalData);
      return () => {
        window.removeEventListener("storage", syncGlobalData);
        window.removeEventListener("storage_updated", syncGlobalData);
      };
    } catch (e) {}
  }, [setTransactions, setProducts, setEmployees, setCustomers, setTickets, setWorkHours]);

  const secureApiRequest = useCallback(async (endpoint, method = 'GET', body = null) => {
    if (typeof apiRequest === 'function') return apiRequest(endpoint, method, body);
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await fetch(`${apiUrl}${endpoint}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP error! status: ${res.status}`);
    return data;
  }, [apiRequest, getAuthHeaders, apiUrl, token]);

  const sendMailApi = async (to, subject, body, attachment = null) => {
    try {
      await secureApiRequest("/mails", "POST", {
        sender: currentUser?.name || "نظام التحليلات", recipient: to, subject, body, attachment,
        read: false, date: new Date().toISOString(),
      });
    } catch (error) {
      console.error("خطأ في إرسال البريد:", error);
    }
  };

  const flashSaving = (msg) => {
    setSavingState(msg);
    setTimeout(() => setSavingState(""), 3000);
  };

  const fetchAnalyticsData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [empRes, custRes, prodRes, transRes, tickRes, workRes] = await Promise.all([
        secureApiRequest('/employees', 'GET').catch(() => null),
        secureApiRequest('/customers', 'GET').catch(() => null),
        secureApiRequest('/products', 'GET').catch(() => null),
        secureApiRequest('/accounting/transactions', 'GET').catch(() => null),
        secureApiRequest('/tickets', 'GET').catch(() => null),
        secureApiRequest('/work-hours', 'GET').catch(() => null)
      ]);

      if (empRes && typeof setEmployees === 'function') {
        const dataList = Array.isArray(empRes) ? empRes : (empRes.employees || []);
        setEmployees(dataList);
        window.localStorage.setItem("store_employees", JSON.stringify(dataList));
      }
      if (custRes && typeof setCustomers === 'function') {
        const dataList = Array.isArray(custRes) ? custRes : (custRes.customers || []);
        setCustomers(dataList);
        window.localStorage.setItem("store_customers", JSON.stringify(dataList));
      }
      if (prodRes && typeof setProducts === 'function') {
        const dataList = Array.isArray(prodRes) ? prodRes : (prodRes.products || []);
        setProducts(dataList);
        window.localStorage.setItem("store_products", JSON.stringify(dataList));
      }
      if (transRes && typeof setTransactions === 'function') {
        const dataList = Array.isArray(transRes) ? transRes : (transRes.transactions || []);
        setTransactions(dataList);
        window.localStorage.setItem("store_accountingTransactions", JSON.stringify(dataList));
      }
      if (tickRes && typeof setTickets === 'function') {
        const dataList = Array.isArray(tickRes) ? tickRes : (tickRes.tickets || []);
        setTickets(dataList);
        window.localStorage.setItem("store_tickets", JSON.stringify(dataList));
      }
      if (workRes && typeof setWorkHours === 'function') {
        const dataList = Array.isArray(workRes) ? workRes : (workRes.workHours || []);
        setWorkHours(dataList);
        window.localStorage.setItem("store_workHours", JSON.stringify(dataList));
      }
      flashSaving("✅ تمت مزامنة البيانات بنجاح");
    } catch (error) {
      setLoadError(error?.message || "فشل الاتصال بالسيرفر.");
    } finally {
      setLoading(false);
    }
  }, [secureApiRequest, setEmployees, setCustomers, setProducts, setTransactions, setTickets, setWorkHours]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    fetchAnalyticsData();

    if (socket) {
      socket.on("transaction_added", () => fetchAnalyticsData());
      socket.on("transaction_deleted", () => fetchAnalyticsData());
      socket.on("customer_updated", () => fetchAnalyticsData());
      socket.on("product_updated", () => fetchAnalyticsData());
      socket.on("ticket_updated", () => fetchAnalyticsData());
      socket.on("employee_updated", () => fetchAnalyticsData());
    }

    return () => {
      if (socket) {
        socket.off("transaction_added");
        socket.off("transaction_deleted");
        socket.off("customer_updated");
        socket.off("product_updated");
        socket.off("ticket_updated");
        socket.off("employee_updated");
      }
    };
  }, [fetchAnalyticsData, socket]);

  const handleExportAndEmailReport = async () => {
    flashSaving("📧 جاري إرسال التقرير...");
    await sendMailApi(
      "manager@company.com",
      "📈 تقرير التحليلات الشامل",
      `تقرير النظام المحدث.\nالموظفين: ${safeEmployees.length}\nالعملاء: ${safeCustomers.length}\nالمنتجات: ${safeProducts.length}\nصافي الأرباح: ${netProfit.toLocaleString()} دينار\nبواسطة: ${currentUser?.name || "مدير النظام"}`,
      "analytics_report.pdf"
    );
    flashSaving("✅ تم إرسال التقرير بنجاح");
  };

  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const safeWorkHours = Array.isArray(workHours) ? workHours : [];

  const totalEmployees = safeEmployees.length;
  const totalCustomers = safeCustomers.length;
  const totalProducts = safeProducts.length;
  const totalTickets = safeTickets.length;
  const openTickets = safeTickets.filter(t => t.status === 'مفتوحة' || t.status === 'open').length;
  const totalWorkHoursRecords = safeWorkHours.length;

  const totalIncome = safeTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalExpense = safeTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = totalIncome - totalExpense;

  const lowStockProducts = safeProducts.filter(p => Number(p.stock) <= 5);

  return (
    <div style={{ background: "linear-gradient(135deg, #0b0f19 0%, #111827 100%)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", padding: "30px", color: "#f8fafc", fontFamily: "Tajawal, sans-serif", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)", ...fullBleedStyle }} dir="rtl">

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "15px", flexWrap: "wrap", gap: "15px" }}>
        <div>
          <h2 style={{ margin: "0 0 5px 0", color: "#38bdf8", fontSize: "22px", fontWeight: "bold" }}>
            📊 لوحة التحليلات والإحصائيات الشاملة
          </h2>
          <p style={{ margin: "0", color: "#94a3b8", fontSize: "13px" }}>
            رؤية شاملة مرتبطة بكل أقسام النظام.
            {loadError && <span style={{ color: "#f87171" }}> ⚠️ {loadError}</span>}
            {savingState && <span style={{ color: "#34d399", fontWeight: "bold" }}> {savingState}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={handleExportAndEmailReport} style={{ background: "#10b981", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>
            إرسال التقرير 📧
          </button>
          <button type="button" onClick={fetchAnalyticsData} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "12px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>
            تحديث 🔄
          </button>
          <div style={{ background: "rgba(30, 41, 59, 0.7)", color: loading ? "#facc15" : "#34d399", padding: "10px 16px", borderRadius: "12px", fontSize: "13px", border: "1px solid rgba(255, 255, 255, 0.08)", fontWeight: "bold" }}>
            {loading ? 'جاري التحديث...' : 'متصل 🟢'}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "15px" }}>
        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>إجمالي طاقم العمل</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: "#fff" }}>{totalEmployees} موظف</span>
            <span style={{ fontSize: "22px" }}>👥</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>إجمالي العملاء</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: "#fff" }}>{totalCustomers} عميل</span>
            <span style={{ fontSize: "22px" }}>🧑‍💼</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>المنتجات المتاحة</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: "#38bdf8" }}>{totalProducts} منتج</span>
            <span style={{ fontSize: "22px" }}>📦</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>تذاكر الدعم (مفتوحة / إجمالي)</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "18px", fontWeight: "bold", color: "#f97316" }}>{openTickets} مفتوحة ({totalTickets})</span>
            <span style={{ fontSize: "22px" }}>🎫</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>سجلات الدوام</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: "#facc15" }}>{totalWorkHoursRecords} سجل</span>
            <span style={{ fontSize: "22px" }}>⏰</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>إجمالي الإيرادات</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: "#10b981" }}>{totalIncome.toLocaleString()} دينار</span>
            <span style={{ fontSize: "22px" }}>💰</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>إجمالي المصاريف</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: "#ef4444" }}>{totalExpense.toLocaleString()} دينار</span>
            <span style={{ fontSize: "22px" }}>💸</span>
          </div>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>صافي الأرباح</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: netProfit >= 0 ? '#22c55e' : '#ef4444' }}>
              {netProfit.toLocaleString()} دينار
            </span>
            <span style={{ fontSize: "22px" }}>📈</span>
          </div>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div style={{ marginTop: '25px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '15px', borderRadius: '12px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#ef4444', fontSize: '15px' }}>⚠️ منتجات على وشك النفاد ({lowStockProducts.length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {lowStockProducts.map(p => (
              <span key={p.id || p._id} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>
                {p.name} (مخزون: {p.stock})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const statCardStyle = {
  background: "rgba(17, 24, 39, 0.7)",
  backdropFilter: "blur(12px)",
  padding: "20px",
  borderRadius: "16px",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  transition: 'transform 0.2s ease'
};

export default Analytics;