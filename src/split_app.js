const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const appJsPath = path.join(srcDir, 'App.js');
const content = fs.readFileSync(appJsPath, 'utf8');

function extractBetween(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    if (start === -1) return '';
    const end = endMarker ? text.indexOf(endMarker, start) : text.length;
    return text.substring(start, end);
}

const dirs = [
    'theme', 'utils', 'data', 'components', 'pages/scm', 'pages/platform'
];
dirs.forEach(d => fs.mkdirSync(path.join(srcDir, d), { recursive: true }));

const globalCssMatch = content.match(/const GLOBAL_CSS = `([\s\S]*?)`;/);
const css = globalCssMatch ? globalCssMatch[1] : '';

const themeCode = 'export const T = {\n' +
    '  bg:"#070B12",surface:"#0C1018",card:"#111827",cardHov:"#141F30",panel:"#0F1621",\n' +
    '  border:"#1A2436",borderLt:"#243048",\n' +
    '  gold:"#F4B942",goldDim:"#C4922A",goldGlow:"rgba(244,185,66,0.18)",goldFg:"rgba(244,185,66,0.08)",\n' +
    '  emerald:"#10D9A0",emerGlow:"rgba(16,217,160,0.15)",\n' +
    '  sapphire:"#3B82F6",sapGlow:"rgba(59,130,246,0.18)",\n' +
    '  coral:"#F87171",corGlow:"rgba(248,113,113,0.18)",\n' +
    '  violet:"#A78BFA",violGlow:"rgba(167,139,250,0.18)",\n' +
    '  amber:"#FBBF24",sky:"#38BDF8",rose:"#FB7185",lime:"#84CC16",\n' +
    '  text:"#EEF2FF",textSub:"#94A3B8",textDim:"#475569",textFaint:"#1E293B",\n' +
    '  success:"#10D9A0",warning:"#FBBF24",danger:"#F87171",info:"#38BDF8",\n' +
    '};\n\n' +
    'export const P = {\n' +
    '  bg: "#0A0D14", surface: "#111520", card: "#161C2D", border: "#1E2A45",\n' +
    '  primary: "#3B6FFF", primaryGlow: "rgba(59,111,255,0.25)",\n' +
    '  accent: "#FF6B35", accentGlow: "rgba(255,107,53,0.2)",\n' +
    '  emerald: "#00E5A0", emeraldGlow: "rgba(0,229,160,0.2)",\n' +
    '  purple: "#9B6DFF", text: "#F0F4FF", textMuted: "#6B7A99", textDim: "#3A4560",\n' +
    '  success: "#00E5A0", warning: "#FFB800", danger: "#FF4757",\n' +
    '};\n\n' +
    'export const GLOBAL_CSS = `' + css + '`;\n';

fs.writeFileSync(path.join(srcDir, 'theme/theme.js'), themeCode);

const utilsCode = "import { useState, useRef, useEffect, useCallback } from 'react';\n\n" +
    "export const fmt = (n) => {\n  if (n == null || isNaN(n)) return '₹0';\n  return n >= 100000 ? '₹' + (n/100000).toFixed(2) + 'L' : n >= 1000 ? '₹' + (n/1000).toFixed(1) + 'k' : '₹' + n;\n};\n\n" +
    "export const fmtFull = (n) => {\n  if (n == null || isNaN(n)) return '₹0.00';\n  return '₹' + Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});\n};\n\n" +
    "export const clamp = (v, lo=0, hi=100) => Math.max(lo, Math.min(hi, v));\n\n" +
    "export const calcProfit = (p) => {\n  if (!p) return { gst:0, netRevenue:0, totalCost:0, grossProfit:0, marginPct:0, savingsVsMrp:0, costRatio:0 };\n  const gst = (p.sellingPrice||0) * ((p.gstRate||0)/100);\n  const netRevenue = (p.sellingPrice||0) - gst;\n  const totalCost = (p.costPrice||0) + (p.deliveryAlloc||0) + (p.platformComm||0);\n  const grossProfit = netRevenue - totalCost;\n  const marginPct = (p.sellingPrice||0) > 0 ? (grossProfit / p.sellingPrice) * 100 : 0;\n  const savingsVsMrp = (p.mrp||0) - (p.sellingPrice||0);\n  const costRatio = (p.sellingPrice||0) > 0 ? ((p.costPrice||0) / p.sellingPrice)*100 : 0;\n  return { gst, netRevenue, totalCost, grossProfit, marginPct, savingsVsMrp, costRatio };\n};\n\n" +
    "export const useToast = () => {\n  const [toast, setToast] = useState(null);\n  const timerRef = useRef(null);\n  const showToast = useCallback((msg, type='gold') => {\n    setToast({ msg, type });\n    clearTimeout(timerRef.current);\n    timerRef.current = setTimeout(() => setToast(null), 3500);\n  }, []);\n  useEffect(() => () => clearTimeout(timerRef.current), []);\n  return [toast, showToast, () => setToast(null)];\n};\n";

fs.writeFileSync(path.join(srcDir, 'utils/helpers.js'), utilsCode);

const dataSection = extractBetween(content, '//  SECTION B:', '// ───');
const suppMatch = dataSection.match(/const SUPPLIERS = (\[[\s\S]*?\]);/);
const poMatch = dataSection.match(/const PURCHASE_ORDERS = (\[[\s\S]*?\]);/);
const prodMatch = dataSection.match(/const PRODUCTS = (\[[\s\S]*?\]);/);

let dataCode = '';
if (suppMatch) dataCode += 'export const SUPPLIERS = ' + suppMatch[1] + ';\n\n';
if (poMatch) dataCode += 'export const PURCHASE_ORDERS = ' + poMatch[1] + ';\n\n';
if (prodMatch) dataCode += 'export const PRODUCTS = ' + prodMatch[1] + ';\n\n';
fs.writeFileSync(path.join(srcDir, 'data/mockData.js'), dataCode);

const scmCompSec = extractBetween(content, '//  SECTION C:', '// ───');
const comps = ['Sparkline', 'DonutRing', 'Stars', 'TierBadge', 'StatusBadge', 'SupplierAvatar', 'ScmToast'];
let scmCompCode = "import React, { memo, useRef } from 'react';\nimport { T } from '../theme/theme';\nimport { clamp } from '../utils/helpers';\n\n";

for (const c of comps) {
    let patt = new RegExp('const ' + c + ' = memo\\(\\(.*?\\)\\s*=>\\s*\\{[\\s\\S]*?\\}\\);|const ' + c + ' = memo\\(\\(.*?\\)\\s*=>\\s*\\(.*?\\)\\);');
    let match = scmCompSec.match(patt);
    if (!match) {
        let patt2 = new RegExp('const ' + c + ' = memo\\([\\s\\S]*?\\)(?=\\n\\n|\\nconst |$)');
        match = scmCompSec.match(patt2);
    }
    if (match) {
        scmCompCode += 'export ' + match[0] + '\n\n';
    }
}
fs.writeFileSync(path.join(srcDir, 'components/ScmComponents.js'), scmCompCode);

const scmPagesSec = extractBetween(content, '//  SECTION D:', '// ───');
const pages = ["OverviewDashboard", "SupplierManagement", "ProcurementTracker", "ProfitEngine", "SmartPricing", "InventoryIntelligence", "AccountingFinance", "SupplyChainView", "AdminOversight"];
const commonImports = "import React, { memo, useState, useMemo, useCallback } from 'react';\nimport { T } from '../../theme/theme';\nimport { fmt, fmtFull, calcProfit, clamp } from '../../utils/helpers';\nimport { SUPPLIERS, PURCHASE_ORDERS, PRODUCTS } from '../../data/mockData';\nimport { Sparkline, DonutRing, Stars, TierBadge, StatusBadge, SupplierAvatar } from '../../components/ScmComponents';\n\n";

for (const p of pages) {
    let pCode = commonImports;
    let matchCurr = scmPagesSec.match(new RegExp('const ' + p + ' = memo\\('));
    if (matchCurr) {
        let startIdx = matchCurr.index;
        let nextIdx = scmPagesSec.length;
        for (const op of pages) {
            if (op !== p) {
                let mo = scmPagesSec.substring(startIdx + 1).match(new RegExp('const ' + op + ' = memo\\('));
                if (mo) {
                    nextIdx = Math.min(nextIdx, startIdx + 1 + mo.index);
                }
            }
        }
        pCode += 'export ' + scmPagesSec.substring(startIdx, nextIdx).trim() + '\n';
        fs.writeFileSync(path.join(srcDir, 'pages/scm/' + p + '.js'), pCode);
    }
}

const scmModSec = extractBetween(content, '// SCM tabs config', '// ───');
let scmModCode = "import React, { useState, useCallback } from 'react';\nimport { T } from '../../theme/theme';\nimport { useToast } from '../../utils/helpers';\nimport { ScmToast } from '../../components/ScmComponents';\n";
for (const p of pages) {
    scmModCode += "import { " + p + " } from './" + p + "';\n";
}
scmModCode += '\n' + scmModSec.replace('const SCMModule', 'export const SCMModule').replace('const SCM_TABS =', 'export const SCM_TABS =');
fs.writeFileSync(path.join(srcDir, 'pages/scm/SCMModule.js'), scmModCode);

const platCompSec = extractBetween(content, '// Shared platform sparkline', '// ── CUSTOMER APP');
const compsPlat = ["PSparkline", "PDonut", "PBarChart", "MapView"];
let platCompCode = "import React, { memo } from 'react';\nimport { P } from '../theme/theme';\nimport { clamp } from '../utils/helpers';\n\n";

for (const c of compsPlat) {
    let patt = new RegExp('const ' + c + ' = memo\\([\\s\\S]*?\\)(?=\\n\\nconst |$)');
    let m = platCompSec.match(patt);
    if (m) {
        platCompCode += 'export ' + m[0] + '\n\n';
    }
}
fs.writeFileSync(path.join(srcDir, 'components/PlatformComponents.js'), platCompCode);

const platPagesSec = extractBetween(content, '// ── CUSTOMER APP', '// ───');
const platPages = ["CustomerApp", "SellerDashboard", "DeliveryApp", "SupportPanel", "AdminDashboard"];
const pcImports = "import React, { memo, useState, useCallback, useMemo } from 'react';\nimport { P } from '../../theme/theme';\nimport { clamp } from '../../utils/helpers';\nimport { PSparkline, PDonut, PBarChart, MapView } from '../../components/PlatformComponents';\n\n";

for (const p of platPages) {
    let pCode = pcImports;
    let startMatch = platPagesSec.match(new RegExp('const ' + p + ' = memo\\('));
    if (startMatch) {
        let startIdx = startMatch.index;
        let nextIdx = platPagesSec.length;
        for (const op of platPages) {
            if (op !== p) {
                let mo = platPagesSec.substring(startIdx + 1).match(new RegExp('const ' + op + ' = memo\\('));
                if (mo) {
                    nextIdx = Math.min(nextIdx, startIdx + 1 + mo.index);
                }
            }
        }
        pCode += 'export ' + platPagesSec.substring(startIdx, nextIdx).trim() + '\n';
        fs.writeFileSync(path.join(srcDir, 'pages/platform/' + p + '.js'), pCode);
    }
}

const platModSec = extractBetween(content, 'const ROLES = [', '// ───');
let platModCode = "import React, { useState, useMemo } from 'react';\nimport { P } from '../../theme/theme';\nimport { useToast } from '../../utils/helpers';\n";
for (const p of platPages) {
    platModCode += "import { " + p + " } from './" + p + "';\n";
}
platModCode += "\nconst ROLES = [" + platModSec.split("const ROLES = [")[1].replace("const PlatformModule", "export const PlatformModule");
fs.writeFileSync(path.join(srcDir, 'pages/platform/PlatformModule.js'), platModCode);

const mainAppCode = `import React, { useState } from "react";
import { GLOBAL_CSS, T } from "./theme/theme";
import { SCMModule } from "./pages/scm/SCMModule";
import { PlatformModule } from "./pages/platform/PlatformModule";

export default function NearMartApp() {
  const [mode, setMode] = useState("scm");

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: GLOBAL_CSS}}/>
      <div className="mode-bar">
        <div style={{fontSize:13,fontWeight:800,color:T.gold,marginRight:12,letterSpacing:".5px"}}>NearMart</div>
        {[
          {key:"scm",label:"⛓ Vendor SCM Module"},
          {key:"platform",label:"🌐 Multi-Role Platform"},
        ].map(m=>(
          <button key={m.key} className={\`mode-btn \${mode===m.key?"active":""}\`} onClick={()=>setMode(m.key)}>{m.label}</button>
        ))}
        <div style={{marginLeft:"auto",fontSize:10,color:T.textDim,letterSpacing:".5px"}}>v2.0 · Production Ready</div>
      </div>

      <div className="mode-content">
        {mode==="scm"?<SCMModule/>:<PlatformModule/>}
      </div>
    </>
  );
}
`;

fs.writeFileSync(path.join(srcDir, 'App.js'), mainAppCode);
console.log('Split complete!');
