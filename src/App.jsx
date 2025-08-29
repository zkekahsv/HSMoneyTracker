/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import CalendarPage from "./pages/CalendarPage";
import GroupPage from "./pages/GroupPage";

import useMonthlyModel from "./hooks/useMonthlyModel";
import { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID, COLORS } from "./constants";
import { KRW, thisYM, shiftYM } from "./utils/format";
import { normalizePercents } from "./utils/percent";
import { makeBackupPayload, downloadTextFile, restoreFromBackupObject } from "./utils/storage";
import { applyAutomations } from "./logic/automations";

export default function App() {
  const [ym, setYM] = useState(thisYM());
  const [selectedDate, setSelectedDate] = useState(() => `${ym}-01`);
  useEffect(() => { setSelectedDate(`${ym}-01`); }, [ym]);

  const [model, setModel] = useMonthlyModel(ym);

  // Firebase (optional) disabled here for brevity; you can re-enable in your project setup

  // UI states
  const [mainTab, setMainTab] = useState("calendar");
  const fileInputRef = useRef(null);

  // Groups/Categories
  const groups = model.groups || [];
  const categories = useMemo(() => (model.categories || []).map((c) => ({ ...c, groupId: c.groupId || c.group || "salary", bankName: typeof c.bankName === "string" ? c.bankName : "" })), [model.categories]);

  useEffect(() => {
    const ids = new Set(groups.map((g) => g.id));
    if (mainTab !== "calendar" && !ids.has(mainTab)) setMainTab("calendar");
  }, [groups, mainTab]);

  const updateGroup = (id, patch) => setModel((m) => ({ ...m, groups: m.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const addGroup = () => {
    const name = prompt("새 메인 탭 이름 (예: 비상금통장)"); if (!name) return;
    const isSalary = confirm("이 그룹을 '월급 그룹'으로 설정할까요?");
    const id = `grp_${Date.now().toString(36)}`;
    setModel((m) => ({ ...m, groups: [...m.groups, { id, name, type: isSalary ? "salary" : "generic", pool: 0 }], categories: [...m.categories, { id: MAIN_CAT_ID(id), name: `${name} (메인)`, amount: 0, groupId: id, isMain: true, bankName: "" }] }));
    setMainTab(id);
  };
  const renameGroup = (id) => {
    const g = groups.find((x) => x.id === id);
    const name = prompt("그룹 이름 변경", g?.name || ""); if (!name) return;
    updateGroup(id, { name });
    setModel((m) => ({ ...m, categories: (m.categories || []).map((c) => c.id === MAIN_CAT_ID(id) ? { ...c, name: `${name} (메인)` } : c) }));
  };
  const toggleGroupType = (id) => {
    const g = groups.find((x) => x.id === id); if (!g) return;
    updateGroup(id, { type: g.type === "salary" ? "generic" : "salary" });
  };
  const deleteGroup = (id) => {
    const hasCats = categories.some((c) => c.groupId === id && !c.isMain);
    if (!confirm(hasCats ? "이 그룹의 통장/기록까지 모두 삭제할까요?" : "그룹을 삭제할까요?")) return;
    setModel((m) => {
      const mainId = MAIN_CAT_ID(id);
      return {
        ...m,
        groups: m.groups.filter((g) => g.id !== id),
        categories: m.categories.filter((c) => c.groupId !== id),
        entries: Object.fromEntries(Object.entries(m.entries || {}).filter(([catId]) => catId !== mainId && !(m.categories || []).some((c) => c.id === catId && c.groupId === id))),
      };
    });
    setMainTab("calendar");
  };

  // Categories & entries
  const ROWS_PER_PAGE = 6;
  const [allocPageByGroup, setAllocPageByGroup] = useState({});
  const getAllocPage = (gid) => allocPageByGroup[gid] || 1;
  const setAllocPage = (gid, page) => setAllocPageByGroup((p) => ({ ...p, [gid]: page }));

  const addCategoryRow = (groupId) => {
    const name = prompt("새 통장 이름", "새 통장"); if (!name) return;
    const bankName = prompt("은행 이름(선택)", "") || "";
    const id = `cat_${Date.now().toString(36)}`;
    setModel((m) => ({ ...m, categories: [...m.categories, { id, name, amount: 0, groupId, isMain: false, bankName }] }));
    const count = categories.filter((c) => c.groupId === groupId && !c.isMain).length + 1;
    const last = Math.max(1, Math.ceil(count / ROWS_PER_PAGE));
    setAllocPage(groupId, last);
  };
  const updateCategory = (id, field, value) => {
    if (id === "__GROUP__" && field === "pool" && value?.groupId) {
      return setModel((m) => ({ ...m, groups: m.groups.map((g) => (g.id === value.groupId ? { ...g, pool: value.value } : g)) }));
    }
    setModel((m) => ({ ...m, categories: m.categories.map((c) => (c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c)) }));
  };
  const deleteCategoryRow = (id) => {
    const cat = categories.find((c) => c.id === id);
    if (cat?.isMain) return alert("메인 통장은 삭제할 수 없습니다.");
    const hasEntries = (model.entries?.[id] || []).length > 0;
    if (!confirm(hasEntries ? "이 통장에 기록이 있습니다. 삭제할까요?" : "삭제할까요?")) return;
    setModel((m) => ({ ...m, categories: m.categories.filter((c) => c.id !== id), entries: Object.fromEntries(Object.entries(m.entries || {}).filter(([k]) => k !== id)) }));
  };
  const addEntry = (catId, entry) => setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: [...(m.entries?.[catId] || []), entry] } }));
  const removeEntry = (catId, idx) => setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx) } }));

  const activeGroup = groups.find((g) => g.id === mainTab);
  const catsOfActive = (model.categories || []).filter((c) => c.groupId === activeGroup?.id);
  const catsForAlloc = catsOfActive.filter((c) => !c.isMain);

  const totalPages = Math.max(1, Math.ceil(catsForAlloc.length / ROWS_PER_PAGE));
  const currentPage = activeGroup ? Math.min(getAllocPage(activeGroup.id), totalPages) : 1;
  const startIdx = (currentPage - 1) * ROWS_PER_PAGE;
  const endIdx = startIdx + ROWS_PER_PAGE;

  // Backup/Restore
  const handleExportAll = () => {
    const payload = makeBackupPayload();
    const filename = `budget-backup-${new Date().toISOString().replaceAll(":", "-")}.json`;
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
  };
  const openImportDialog = () => fileInputRef.current?.click();
  const onImportFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const result = await restoreFromBackupObject(obj, { askBeforeOverwrite: true });
      if (result) {
        alert(`복원 완료! 총 ${result.total}개 중 ${result.overwritten}개 덮어씀.`);
        setModel((prev) => {
          try { const raw = localStorage.getItem(`budget-${ym}`); return raw ? JSON.parse(raw) : prev; }
          catch { return prev; }
        });
      }
    } catch {
      alert("백업 파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resetAll = () => {
    if (!confirm(`${ym} 데이터를 모두 초기화할까요?`)) return;
    setModel({ month: ym, groups: DEFAULT_GROUPS.map((g)=>({...g})), categories: [...DEFAULT_GROUPS.map((g)=>({ id: MAIN_CAT_ID(g.id), name: `${g.name} (메인)`, amount:0, groupId:g.id, isMain:true, bankName:""})), ...DEFAULT_CATEGORIES.map((c)=>({...c,isMain:false}))], entries:{} });
    setSelectedDate(`${ym}-01`);
    setMainTab("calendar");
  };

  // re-run automations when month changes
  useEffect(() => { setModel((m) => applyAutomations(m, ym)); }, [ym]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">{ym} 가계부</h1>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleExportAll} className="px-3 py-1.5 rounded-xl text-sm bg-amber-100 text-amber-900 hover:bg-amber-200">백업 저장(내보내기)</button>
              <button onClick={openImportDialog} className="px-3 py-1.5 rounded-xl text-sm bg-amber-100 text-amber-900 hover:bg-amber-200">백업 불러오기(복원)</button>
              <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFileSelected} />
              <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">초기화</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setYM(shiftYM(ym, -1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">◀ 이전달</button>
            <div className="px-4 py-1.5 rounded-xl bg-white border text-slate-700">{ym}</div>
            <button onClick={() => setYM(shiftYM(ym, 1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">다음달 ▶</button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setMainTab("calendar")} className={`px-4 py-2 rounded-xl text-sm ${mainTab === "calendar" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>달력</button>
            {groups.map((g) => (
              <button key={g.id} onClick={() => setMainTab(g.id)} className={`px-4 py-2 rounded-xl text-sm ${mainTab === g.id ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`} title={g.type === "salary" ? "월급 그룹" : "일반 그룹"}>{g.name}</button>
            ))}
            <button onClick={addGroup} className="px-3 py-2 rounded-xl text-sm bg-emerald-100 text-emerald-800 hover:bg-emerald-200">+ 그룹 추가</button>
            {activeGroup && mainTab !== "calendar" && (
              <>
                <button onClick={() => renameGroup(activeGroup.id)} className="px-3 py-2 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">이름변경</button>
                <button onClick={() => toggleGroupType(activeGroup.id)} className="px-3 py-2 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">{activeGroup.type === "salary" ? "일반 그룹으로 변경" : "월급 그룹으로 지정"}</button>
                <button onClick={() => deleteGroup(activeGroup.id)} className="px-3 py-2 rounded-xl text-sm bg-red-100 text-red-700 hover:bg-red-200">그룹 삭제</button>
              </>
            )}
          </div>
        </div>
      </header>

      {mainTab === "calendar" ? (
        <CalendarPage
          ym={ym}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          categories={categories}
          entries={model.entries}
          addEntry={addEntry}
          removeEntry={removeEntry}
        />
      ) : (
        <GroupPage
          activeGroup={activeGroup}
          catsOfActive={categories.filter((c) => c.groupId === activeGroup?.id)}
          catsForAlloc={categories.filter((c) => c.groupId === activeGroup?.id && !c.isMain)}
          rowsPerPage={ROWS_PER_PAGE}
          startIdx={startIdx}
          endIdx={endIdx}
          currentPage={currentPage}
          totalPages={totalPages}
          setAllocPage={setAllocPage}
          addCategoryRow={addCategoryRow}
          updateCategory={updateCategory}
          deleteCategoryRow={deleteCategoryRow}
          entries={model.entries}
          addEntry={addEntry}
          removeEntry={removeEntry}
        />
      )}
    </div>
  );
}
