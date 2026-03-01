import { useState, useRef, useEffect, useCallback } from "react";

export const fmt = (n) => {
  if (n == null || isNaN(n)) return "₹0";
  return n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`;
};

export const fmtFull = (n) => {
  if (n == null || isNaN(n)) return "₹0.00";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export const calcProfit = (p) => {
  if (!p) return { gst: 0, netRevenue: 0, totalCost: 0, grossProfit: 0, marginPct: 0, savingsVsMrp: 0, costRatio: 0 };
  const gst = (p.sellingPrice || 0) * ((p.gstRate || 0) / 100);
  const netRevenue = (p.sellingPrice || 0) - gst;
  const totalCost = (p.costPrice || 0) + (p.deliveryAlloc || 0) + (p.platformComm || 0);
  const grossProfit = netRevenue - totalCost;
  const marginPct = (p.sellingPrice || 0) > 0 ? (grossProfit / p.sellingPrice) * 100 : 0;
  const savingsVsMrp = (p.mrp || 0) - (p.sellingPrice || 0);
  const costRatio = (p.sellingPrice || 0) > 0 ? ((p.costPrice || 0) / p.sellingPrice) * 100 : 0;
  return { gst, netRevenue, totalCost, grossProfit, marginPct, savingsVsMrp, costRatio };
};

export const useToast = () => {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const showToast = useCallback((msg, type = "gold") => {
    setToast({ msg, type });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return [toast, showToast, () => setToast(null)];
};
