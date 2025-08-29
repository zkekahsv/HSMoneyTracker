export function collectBudgetLocalStorage() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("budget-") && /^\d{4}-\d{2}$/.test(key.slice(7))) {
      items.push({ key, value: localStorage.getItem(key) });
    }
    if (key === "budget-fbconfig" || key === "budget-houseId") {
      items.push({ key, value: localStorage.getItem(key) });
    }
  }
  return items;
}
export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export function makeBackupPayload() {
  return { type: "budget-backup", version: 4, exportedAt: new Date().toISOString(), items: collectBudgetLocalStorage() };
}
export async function restoreFromBackupObject(obj, { askBeforeOverwrite = true } = {}) {
  if (!obj || obj.type !== "budget-backup" || !Array.isArray(obj.items)) {
    alert("백업 파일 형식이 올바르지 않습니다."); return false;
  }
  let overwritten = 0;
  for (const { key, value } of obj.items) {
    const exists = localStorage.getItem(key) !== null;
    if (exists && askBeforeOverwrite) {
      const ok = confirm(`기존 데이터가 있습니다.\n[${key}]을(를) 덮어쓸까요?`);
      if (!ok) continue;
    }
    try {
      localStorage.setItem(key, value);
      if (exists) overwritten++;
    } catch {
      alert(`[${key}] 저장 중 오류가 발생했습니다.`);
      return false;
    }
  }
  return { overwritten, total: obj.items.length };
}
