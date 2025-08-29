import { useEffect, useState } from "react";
import { initialMonthlyModel, ensureMainCats } from "../logic/automations";
import { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID } from "../constants";

export default function useMonthlyModel(ym) {
  const STORAGE_KEY = `budget-${ym}`;
  const [model, setModel] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const m = raw ? JSON.parse(raw) : initialMonthlyModel(ym, { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID });
      return ensureMainCats(m);
    } catch {
      return initialMonthlyModel(ym, { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID });
    }
  });
  useEffect(() => {
    const key = `budget-${ym}`;
    try {
      const raw = localStorage.getItem(key);
      const m = raw ? JSON.parse(raw) : initialMonthlyModel(ym, { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID });
      setModel(ensureMainCats(m));
    } catch {
      setModel(initialMonthlyModel(ym, { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID }));
    }
  }, [ym]);
  useEffect(() => {
    try { localStorage.setItem(`budget-${ym}`, JSON.stringify(model)); } catch {}
  }, [model, ym]);
  return [model, setModel];
}
