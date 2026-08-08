import { useState, useEffect, useCallback, useRef } from "react";

export function useSyncedState(key, initialValue, apiEndpoint = "/api/state", currentUser = null, globalEventBus = null) {
  const [state, setState] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const getAuthToken = useCallback(() => {
    try {
      const tokenFromUser = currentUser && typeof currentUser === "object" ? currentUser.token : "";
      const tokenFromStorage = (typeof window !== "undefined" && localStorage.getItem("token")) || "";
      const finalToken = tokenFromUser || tokenFromStorage;
      return typeof finalToken === "string" ? finalToken.trim() : "";
    } catch (e) { return ""; }
  }, [currentUser]);

  const apiFetch = useCallback(async (endpoint, options = {}) => {
    const token = getAuthToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(endpoint, { ...options, headers });
    return res;
  }, [getAuthToken]);

  const fetchStateFromApi = useCallback(async () => {
    if (isMounted.current) setLoading(true);
    try {
      const safeKey = encodeURIComponent(String(key));
      const response = await apiFetch(`${apiEndpoint}/${safeKey}`);
      if (!response.ok) {
        if (response.status === 404) {
          if (isMounted.current) { setState(initialValue); setError(null); }
          return;
        }
        throw new Error("فشل في جلب البيانات من السيرفر");
      }
      const data = await response.json();
      if (isMounted.current) {
        setState(data && data.value !== undefined ? data.value : initialValue);
        setError(null);
      }
    } catch (err) {
      console.error(`Error fetching state for key "${key}":`, err);
      if (isMounted.current) setError(err.message || "حدث خطأ غير معروف");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [key, apiEndpoint, initialValue, apiFetch]);

  useEffect(() => { fetchStateFromApi(); }, [fetchStateFromApi]);

  // LocalStorage sync + Global Bus
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (isMounted.current) setState(parsed);
        }
      } catch (e) { /* ignore */ }
    };

    const handleGlobal = (e) => {
      if (e?.detail?.key === key && isMounted.current) {
        if (e.detail.value !== undefined) setState(e.detail.value);
        else fetchStateFromApi();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("app_global_sync", handleGlobal);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("app_global_sync", handleGlobal);
    };
  }, [key, fetchStateFromApi]);

  const setSyncedState = useCallback(async (newState) => {
    const updatedValue = typeof newState === "function" ? newState(state) : newState;
    if (isMounted.current) setState(updatedValue);

    // Global Bus notify
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("app_global_sync", { detail: { key, value: updatedValue } }));
    }

    // Persist locally
    try { localStorage.setItem(key, JSON.stringify(updatedValue)); } catch (e) { console.warn("localStorage full", e); }

    // API sync
    try {
      const safeKey = encodeURIComponent(String(key));
      await apiFetch(`${apiEndpoint}/${safeKey}`, {
        method: "PUT",
        body: JSON.stringify({ value: updatedValue }),
      });
    } catch (err) {
      console.error(`Sync error for key "${key}":`, err);
      if (isMounted.current) setError(err.message || "خطأ في المزامنة");
    }
  }, [key, state, apiFetch]);

  return [state, setSyncedState, { loading, error, refetch: fetchStateFromApi }];
}