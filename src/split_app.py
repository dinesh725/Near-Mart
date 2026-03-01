import os
import re

APP_JS_PATH = r"c:\Users\dines\OneDrive\Desktop\App\nearmart\src\App.js"
SRC_DIR = r"c:\Users\dines\OneDrive\Desktop\App\nearmart\src"

def extract_between(text, start_marker, end_marker):
    start = text.find(start_marker)
    if start == -1: return ""
    end = text.find(end_marker, start) if end_marker else len(text)
    return text[start:end]

with open(APP_JS_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# Create directories
dirs = [
    "theme",
    "utils",
    "data",
    "components",
    "pages/scm",
    "pages/platform"
]
for d in dirs:
    os.makedirs(os.path.join(SRC_DIR, d), exist_ok=True)

# 1. Theme
theme_code = """export const T = {
  bg:"#070B12",surface:"#0C1018",card:"#111827",cardHov:"#141F30",panel:"#0F1621",
  border:"#1A2436",borderLt:"#243048",
  gold:"#F4B942",goldDim:"#C4922A",goldGlow:"rgba(244,185,66,0.18)",goldFg:"rgba(244,185,66,0.08)",
  emerald:"#10D9A0",emerGlow:"rgba(16,217,160,0.15)",
  sapphire:"#3B82F6",sapGlow:"rgba(59,130,246,0.18)",
  coral:"#F87171",corGlow:"rgba(248,113,113,0.18)",
  violet:"#A78BFA",violGlow:"rgba(167,139,250,0.18)",
  amber:"#FBBF24",sky:"#38BDF8",rose:"#FB7185",lime:"#84CC16",
  text:"#EEF2FF",textSub:"#94A3B8",textDim:"#475569",textFaint:"#1E293B",
  success:"#10D9A0",warning:"#FBBF24",danger:"#F87171",info:"#38BDF8",
};

export const P = {
  bg: "#0A0D14", surface: "#111520", card: "#161C2D", border: "#1E2A45",
  primary: "#3B6FFF", primaryGlow: "rgba(59,111,255,0.25)",
  accent: "#FF6B35", accentGlow: "rgba(255,107,53,0.2)",
  emerald: "#00E5A0", emeraldGlow: "rgba(0,229,160,0.2)",
  purple: "#9B6DFF", text: "#F0F4FF", textMuted: "#6B7A99", textDim: "#3A4560",
  success: "#00E5A0", warning: "#FFB800", danger: "#FF4757",
};

"""
global_css_match = re.search(r'const GLOBAL_CSS = `(.*?)`;', content, re.DOTALL)
if global_css_match:
    theme_code += f'export const GLOBAL_CSS = `{global_css_match.group(1)}`;\n'

with open(os.path.join(SRC_DIR, "theme", "theme.js"), "w", encoding="utf-8") as f:
    f.write(theme_code)

# 2. Utils
utils_section = extract_between(content, "//  SECTION A:", "// ───")
# Extract functions: fmt, fmtFull, clamp, calcProfit, useToast
utils_code = """import { useState, useRef, useEffect, useCallback } from 'react';

export const fmt = (n) => {
  if (n == null || isNaN(n)) return "₹0";
  return n >= 100000 ? `₹${(n/100000).toFixed(2)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}k` : `₹${n}`;
};

export const fmtFull = (n) => {
  if (n == null || isNaN(n)) return "₹0.00";
  return `₹${Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
};

export const clamp = (v, lo=0, hi=100) => Math.max(lo, Math.min(hi, v));

export const calcProfit = (p) => {
  if (!p) return { gst:0, netRevenue:0, totalCost:0, grossProfit:0, marginPct:0, savingsVsMrp:0, costRatio:0 };
  const gst = (p.sellingPrice||0) * ((p.gstRate||0)/100);
  const netRevenue = (p.sellingPrice||0) - gst;
  const totalCost = (p.costPrice||0) + (p.deliveryAlloc||0) + (p.platformComm||0);
  const grossProfit = netRevenue - totalCost;
  const marginPct = (p.sellingPrice||0) > 0 ? (grossProfit / p.sellingPrice) * 100 : 0;
  const savingsVsMrp = (p.mrp||0) - (p.sellingPrice||0);
  const costRatio = (p.sellingPrice||0) > 0 ? ((p.costPrice||0) / p.sellingPrice)*100 : 0;
  return { gst, netRevenue, totalCost, grossProfit, marginPct, savingsVsMrp, costRatio };
};

export const useToast = () => {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const showToast = useCallback((msg, type="gold") => {
    setToast({ msg, type });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return [toast, showToast, () => setToast(null)];
};
"""
with open(os.path.join(SRC_DIR, "utils", "helpers.js"), "w", encoding="utf-8") as f:
    f.write(utils_code)

# 3. Mock Data
data_section = extract_between(content, "//  SECTION B:", "// ───")
supp_match = re.search(r'const SUPPLIERS = (\[.*?\]);', data_section, re.DOTALL)
po_match = re.search(r'const PURCHASE_ORDERS = (\[.*?\]);', data_section, re.DOTALL)
prod_match = re.search(r'const PRODUCTS = (\[.*?\]);', data_section, re.DOTALL)

data_code = ""
if supp_match: data_code += f"export const SUPPLIERS = {supp_match.group(1)};\n\n"
if po_match: data_code += f"export const PURCHASE_ORDERS = {po_match.group(1)};\n\n"
if prod_match: data_code += f"export const PRODUCTS = {prod_match.group(1)};\n\n"

with open(os.path.join(SRC_DIR, "data", "mockData.js"), "w", encoding="utf-8") as f:
    f.write(data_code)

# 4. SCM Components
scm_comp_sec = extract_between(content, "//  SECTION C:", "// ───")
# Extract each component from this section manually to prefix with export
comps = ["Sparkline", "DonutRing", "Stars", "TierBadge", "StatusBadge", "SupplierAvatar", "ScmToast"]
scm_comp_code = "import React, { memo, useRef } from 'react';\nimport { T } from '../theme/theme';\nimport { clamp } from '../utils/helpers';\n\n"
for c in comps:
    # Match const ComponentName = memo(...);
    # Since these might be multiline, we need to carefully match
    pattern = rf'const {c} = memo\(\(.*?\)\s*=>\s*{{.*?}}\);|const {c} = memo\(\(.*?\)\s*=>\s*\(.*?\)\);'
    match = re.search(pattern, scm_comp_sec, re.DOTALL)
    if not match:
        # Fallback for simpler patterns
        pattern2 = rf'const {c} = memo\(.*?\)(?=\n\n|\nconst |\Z)'
        match = re.search(pattern2, scm_comp_sec, re.DOTALL)
    
    if match:
        scm_comp_code += f"export {match.group(0)}\n\n"

        
with open(os.path.join(SRC_DIR, "components", "ScmComponents.js"), "w", encoding="utf-8") as f:
    f.write(scm_comp_code)


# 5. Pages / SCM
scm_pages_sec = extract_between(content, "//  SECTION D:", "// ───")

pages = ["OverviewDashboard", "SupplierManagement", "ProcurementTracker", "ProfitEngine", "SmartPricing", "InventoryIntelligence", "AccountingFinance", "SupplyChainView", "AdminOversight"]

common_imports = "import React, { memo, useState, useMemo, useCallback } from 'react';\nimport { T } from '../../theme/theme';\nimport { fmt, fmtFull, calcProfit, clamp } from '../../utils/helpers';\nimport { SUPPLIERS, PURCHASE_ORDERS, PRODUCTS } from '../../data/mockData';\nimport { Sparkline, DonutRing, Stars, TierBadge, StatusBadge, SupplierAvatar } from '../../components/ScmComponents';\n\n"

for p in pages:
    # Find the const P = ...
    p_code = common_imports
    
    # We regex search for const P = memo(
    # The end is either next const PageName = memo or end of string
    next_index = len(scm_pages_sec)
    match_curr = re.search(rf'const {p} = memo\(', scm_pages_sec)
    if match_curr:
        start_idx = match_curr.start()
        # Find the next component
        for other_p in pages:
            if other_p != p:
                match_other = re.search(rf'const {other_p} = memo\(', scm_pages_sec[start_idx+1:])
                if match_other:
                    next_index = min(next_index, start_idx + 1 + match_other.start())
        
        comp_str = scm_pages_sec[start_idx:next_index].strip()
        p_code += f"export {comp_str}\n"
        
        with open(os.path.join(SRC_DIR, "pages/scm", f"{p}.js"), "w", encoding="utf-8") as f:
            f.write(p_code)

# SCM_TABS and SCMModule
scm_mod_sec = extract_between(content, "// SCM tabs config", "// ───")
# Just add imports
scm_mod_code = """import React, { useState, useCallback } from 'react';
import { T } from '../../theme/theme';
import { useToast } from '../../utils/helpers';
import { ScmToast } from '../../components/ScmComponents';
"""
for p in pages:
    scm_mod_code += f"import {{ {p} }} from './{p}';\n"

scm_mod_code += "\n" + scm_mod_sec.replace("const SCMModule", "export const SCMModule").replace("const SCM_TABS =", "export const SCM_TABS =")

with open(os.path.join(SRC_DIR, "pages/scm", "SCMModule.js"), "w", encoding="utf-8") as f:
    f.write(scm_mod_code)


# 6. Platform Components
plat_comp_sec = extract_between(content, "// Shared platform sparkline", "// ── CUSTOMER APP")

comps_plat = ["PSparkline", "PDonut", "PBarChart", "MapView"]
plat_comp_code = "import React, { memo } from 'react';\nimport { P } from '../theme/theme';\nimport { clamp } from '../utils/helpers';\n\n"

for c in comps_plat:
    patt = rf'const {c} = memo\(.*?\)(?=\n\nconst |\Z)'
    m = re.search(patt, plat_comp_sec, re.DOTALL)
    if m:
        plat_comp_code += f"export {m.group(0)}\n\n"
        
with open(os.path.join(SRC_DIR, "components", "PlatformComponents.js"), "w", encoding="utf-8") as f:
    f.write(plat_comp_code)


# 7. Pages / Platform
plat_pages_sec = extract_between(content, "// ── CUSTOMER APP", "// ───")

plat_pages = ["CustomerApp", "SellerDashboard", "DeliveryApp", "SupportPanel", "AdminDashboard"]

pc_imports = "import React, { memo, useState, useCallback, useMemo } from 'react';\nimport { P } from '../../theme/theme';\nimport { clamp } from '../../utils/helpers';\nimport { PSparkline, PDonut, PBarChart, MapView } from '../../components/PlatformComponents';\n\n"

for p in plat_pages:
    p_code = pc_imports
    
    start_match = re.search(rf'const {p} = memo\(', plat_pages_sec)
    if start_match:
        start_idx = start_match.start()
        next_idx = len(plat_pages_sec)
        for other_p in plat_pages:
            if other_p != p:
                match_other = re.search(rf'const {other_p} = memo\(', plat_pages_sec[start_idx+1:])
                if match_other:
                    next_idx = min(next_idx, start_idx + 1 + match_other.start())
        
        comp_str = plat_pages_sec[start_idx:next_idx].strip()
        p_code += f"export {comp_str}\n"
        
        with open(os.path.join(SRC_DIR, "pages/platform", f"{p}.js"), "w", encoding="utf-8") as f:
            f.write(p_code)

# Platform Module Root
plat_mod_sec = extract_between(content, "const ROLES = [", "// ───")
plat_mod_code = """import React, { useState, useMemo } from 'react';
import { P } from '../../theme/theme';
import { useToast } from '../../utils/helpers';
"""
for p in plat_pages:
    plat_mod_code += f"import {{ {p} }} from './{p}';\n"

plat_mod_code += "\nconst ROLES = [" + plat_mod_sec.split("const ROLES = [")[1].replace("const PlatformModule", "export const PlatformModule")

with open(os.path.join(SRC_DIR, "pages/platform", "PlatformModule.js"), "w", encoding="utf-8") as f:
    f.write(plat_mod_code)


# 8. Main App.js Refactor
main_app_code = """import React, { useState } from "react";
import { GLOBAL_CSS, T } from "./theme/theme";
import { SCMModule } from "./pages/scm/SCMModule";
import { PlatformModule } from "./pages/platform/PlatformModule";

export default function NearMartApp() {
  const [mode, setMode] = useState("scm");

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: GLOBAL_CSS}}/>
      {/* Top mode switcher */}
      <div className="mode-bar">
        <div style={{fontSize:13,fontWeight:800,color:T.gold,marginRight:12,letterSpacing:".5px"}}>NearMart</div>
        {[
          {key:"scm",label:"⛓ Vendor SCM Module"},
          {key:"platform",label:"🌐 Multi-Role Platform"},
        ].map(m=>(
          <button key={m.key} className={`mode-btn ${mode===m.key?"active":""}`} onClick={()=>setMode(m.key)}>{m.label}</button>
        ))}
        <div style={{marginLeft:"auto",fontSize:10,color:T.textDim,letterSpacing:".5px"}}>v2.0 · Production Ready</div>
      </div>

      <div className="mode-content">
        {mode==="scm"?<SCMModule/>:<PlatformModule/>}
      </div>
    </>
  );
}
"""

with open(os.path.join(SRC_DIR, "App.js"), "w", encoding="utf-8") as f:
    f.write(main_app_code)

print("Split complete!")
