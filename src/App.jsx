// src/App.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { INITIAL_DATA } from "./data/initialData";
import SimpleCalendar from "./components/SimpleCalendar"; 
import { db } from "./fbase"; // 방금 만든 firebase.js 불러오기
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

// --- 스타일 정의 ---
const containerStyle = { maxWidth: "600px", margin: "0 auto", padding: "20px 20px 80px 20px", fontFamily: "sans-serif", minHeight: "100vh", position: "relative" };
const cardStyle = { backgroundColor: "#fff", padding: "20px", borderRadius: "15px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", marginBottom: "20px" };
const titleStyle = { fontSize: "18px", fontWeight: "bold", marginBottom: "15px", borderBottom: "2px solid #eee", paddingBottom: "10px" };
const inputStyle = { width: "100%", padding: "10px", marginBottom: "10px", border: "1px solid #ddd", borderRadius: "5px", boxSizing: "border-box" };
const btnStyle = { width: "100%", padding: "12px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" };
const resetBtnStyle = { fontSize: "12px", color: "#999", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", float: "right" };

const navBtnStyle = { background: "none", border: "1px solid #ddd", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };

const bottomNavStyle = {
  position: "fixed", bottom: 0, left: 0, right: 0, height: "60px", backgroundColor: "white", borderTop: "1px solid #eee",
  display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 900, maxWidth: "600px", margin: "0 auto"
};
const bottomNavItemStyle = (isActive) => ({
  flex: 1, textAlign: "center", fontSize: "12px", color: isActive ? "#2563eb" : "#94a3b8", cursor: "pointer", fontWeight: isActive ? "bold" : "normal"
});

const chartBarStyle = (width, color) => ({
  height: "100%", backgroundColor: color, borderRadius: "4px", width: width, transition: "width 0.5s ease"
});

const smallBtnStyle = { fontSize: "11px", padding: "2px 6px", marginLeft: "8px", backgroundColor: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: "4px", cursor: "pointer" };
const deleteTxBtnStyle = { fontSize: "12px", padding: "4px 8px", marginLeft: "10px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" };
const addWalletStyle = { display: "flex", gap: "5px", marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed #eee" };
const fillWalletBtnStyle = { width: "100%", padding: "8px", marginBottom: "10px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" };

const actionBtnStyle = (color, bg) => ({ fontSize: "11px", padding: "3px 6px", marginLeft: "4px", backgroundColor: bg, color: color, border: "none", borderRadius: "4px", cursor: "pointer" });
const editInputNameStyle = { width: "120px", padding: "3px", fontSize: "13px", border: "1px solid #2563eb", borderRadius: "3px" };
const addItemBtnStyle = { width: "100%", padding: "5px", marginTop: "5px", border: "1px dashed #aaa", borderRadius: "5px", background: "none", color: "#666", fontSize: "12px", cursor: "pointer" };

const clickableAmountStyle = (color) => ({ color: color, fontWeight: "bold", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" });
const clickableNameStyle = { cursor: "pointer", borderBottom: "1px dotted #999" };
const toggleBtnStyle = { width: "100%", padding: "10px", marginBottom: "15px", backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" };
const listGroupStyle = { marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px dashed #eee" };
const listHeaderStyle = { fontSize: "14px", fontWeight: "bold", marginBottom: "8px", color: "#555" };
const dashboardStyle = { display: "flex", justifyContent: "space-between", backgroundColor: "#f8fafc", padding: "15px", borderRadius: "12px", marginBottom: "20px", border: "1px solid #e2e8f0" };
const dashItemStyle = { textAlign: "center", flex: 1 };
const dashLabelStyle = { fontSize: "12px", color: "#64748b", marginBottom: "5px" };
const dashValueStyle = (color) => ({ fontSize: "16px", fontWeight: "bold", color: color });

const typeToggleContainer = { display: "flex", gap: "10px", marginBottom: "10px" };
// src/App.jsx 의 typeBtnStyle 부분을 이것으로 교체!

const typeBtnStyle = (isActive, type) => ({
  flex: 1, 
  padding: "10px", 
  // border: "none",  <-- (삭제됨) 이 부분이 중복 원인이었습니다!
  borderRadius: "8px", 
  fontWeight: "bold", 
  cursor: "pointer",
  backgroundColor: isActive ? (type === "income" ? "#eff6ff" : "#fef2f2") : "#f3f4f6",
  color: isActive ? (type === "income" ? "#2563eb" : "#ef4444") : "#9ca3af",
  border: isActive ? (type === "income" ? "2px solid #2563eb" : "2px solid #ef4444") : "2px solid transparent"
});

const modalOverlayStyle = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle = { backgroundColor: "white", padding: "25px", borderRadius: "15px", width: "90%", maxWidth: "400px", boxShadow: "0 4px 10px rgba(0,0,0,0.2)", position: "relative" };
const closeBtnStyle = { position: "absolute", top: "15px", right: "15px", background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#999" };

const EXPENSE_CATEGORIES = ["식비", "교통/차량", "쇼핑", "문화/여가", "생활/마트", "육아/교육", "경조사", "기타"];
const INCOME_CATEGORIES = ["월급", "용돈", "보너스", "당근마켓", "기타수입"];
const CATEGORY_COLORS = { "식비": "#f87171", "교통/차량": "#fb923c", "쇼핑": "#fbbf24", "문화/여가": "#a3e635", "생활/마트": "#34d399", "육아/교육": "#22d3ee", "경조사": "#818cf8", "기타": "#a78bfa" };

// --- DB Doc ID (우리 가족 공유 키) ---
const DOC_ID = "family_budget_v1"; 

function App() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`; 

  const [activeTab, setActiveTab] = useState("calendar");
  const [isLoading, setIsLoading] = useState(true);

  // Firestore에서 실시간으로 받아올 상태들
  const [allData, setAllData] = useState({ wallets: [], months: {} });
  const [transactions, setTransactions] = useState([]);
  
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState("expense"); 
  const [inputCategory, setInputCategory] = useState("식비");
  const [inputDesc, setInputDesc] = useState("");
  const [inputAmount, setInputAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState(""); 
  
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("");
  const [showFixedList, setShowFixedList] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null); 
  const [editingNameVal, setEditingNameVal] = useState(""); 
  const [searchTerm, setSearchTerm] = useState("");

  const currentMonthData = allData.months && allData.months[monthKey] 
    ? allData.months[monthKey] 
    : { income: INITIAL_DATA.income, fixedExpenses: INITIAL_DATA.fixedExpenses };

  // --- 🔥 Firebase 실시간 연동 (핵심) ---
  useEffect(() => {
    // 1. 데이터 구독 (누가 수정하면 즉시 반영됨)
    const docRef = doc(db, "budget", DOC_ID);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const remoteData = docSnap.data();
        setAllData(remoteData.allData || { wallets: INITIAL_DATA.wallets, months: {} });
        setTransactions(remoteData.transactions || []);
        setIsLoading(false);
      } else {
        // 데이터가 아예 없으면(처음) 초기값으로 생성
        const initPayload = {
          allData: { wallets: INITIAL_DATA.wallets, months: { [monthKey]: { income: INITIAL_DATA.income, fixedExpenses: INITIAL_DATA.fixedExpenses } } },
          transactions: []
        };
        setDoc(docRef, initPayload);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- 🔥 Firebase 저장 함수 ---
  // 로컬 스테이트만 바꾸는 게 아니라, DB에 쏴주는 함수
  const saveToFirebase = async (newAllData, newTransactions) => {
    // 1. 즉시 로컬 반영 (빠른 반응속도)
    if(newAllData) setAllData(newAllData);
    if(newTransactions) setTransactions(newTransactions);

    // 2. 클라우드 전송
    try {
      const docRef = doc(db, "budget", DOC_ID);
      await updateDoc(docRef, {
        allData: newAllData || allData,
        transactions: newTransactions || transactions
      });
    } catch (e) {
      console.error("저장 실패:", e);
      alert("인터넷 연결을 확인해주세요. 저장이 안 됐을 수 있습니다.");
    }
  };

  // --- Effects (자동 월 데이터 생성) ---
  useEffect(() => {
    if (!isLoading && allData.months && !allData.months[monthKey]) {
      const newData = { 
        ...allData, 
        months: { ...allData.months, [monthKey]: { income: INITIAL_DATA.income, fixedExpenses: INITIAL_DATA.fixedExpenses } } 
      };
      saveToFirebase(newData, null);
    }
  }, [monthKey, isLoading, allData.months]);

  useEffect(() => {
    if (!selectedWalletId && allData.wallets && allData.wallets.length > 0) {
      setSelectedWalletId(allData.wallets[0].id);
    }
  }, [allData.wallets, selectedWalletId]);


  const handlePrevMonth = () => {
    let newYear = year; let newMonth = month - 1;
    if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    setYear(newYear); setMonth(newMonth);
    setSelectedDate(`${newYear}-${String(newMonth).padStart(2, "0")}-01`);
    setEditingItemId(null); 
  };

  const handleNextMonth = () => {
    let newYear = year; let newMonth = month + 1;
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    setYear(newYear); setMonth(newMonth);
    setSelectedDate(`${newYear}-${String(newMonth).padStart(2, "0")}-01`);
    setEditingItemId(null);
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setIsModalOpen(true); 
    setInputDesc(""); setInputAmount(""); setTxType("expense"); 
    setInputCategory("식비");
  };

  const handleFillWallets = () => {
    if (!window.confirm("지갑 잔액을 설정된 예산 금액으로 초기화하시겠습니까? (공유된 모든 사람에게 반영됩니다)")) return;
    const resetWallets = allData.wallets.map(w => {
       const initialW = INITIAL_DATA.wallets.find(iw => iw.id === w.id);
       if (initialW) { return { ...w, balance: initialW.balance }; }
       return w;
    });
    const newData = { ...allData, wallets: resetWallets };
    saveToFirebase(newData, null);
    alert("지갑 잔액이 채워졌습니다!");
  };

  // --- Transactions ---
  const handleAddTransaction = () => {
    if (!inputDesc || !inputAmount) return alert("내용과 금액을 입력해주세요!");
    if (!selectedWalletId) return alert("통장을 선택해주세요!");
    const amount = Number(inputAmount);
    const newTx = { 
      id: Date.now(), date: selectedDate, desc: inputDesc, amount: amount, walletId: selectedWalletId, type: txType, category: inputCategory
    };
    
    const newTxs = [...transactions, newTx];
    const updatedWallets = allData.wallets.map(wallet => {
      if (wallet.id === selectedWalletId) {
        if (txType === 'income') return { ...wallet, balance: wallet.balance + amount };
        else return { ...wallet, balance: wallet.balance - amount };
      }
      return wallet;
    });
    const newData = { ...allData, wallets: updatedWallets };
    
    saveToFirebase(newData, newTxs);
    setIsModalOpen(false); setInputDesc(""); setInputAmount("");
  };

  const handleDeleteTransaction = (txId) => {
    const targetTx = transactions.find(tx => tx.id === txId);
    if (!targetTx) return;
    if (!window.confirm("이 내역을 삭제하시겠습니까? (잔액이 원상복구됩니다)")) return;
    
    const newTxs = transactions.filter(tx => tx.id !== txId);
    const updatedWallets = allData.wallets.map(wallet => {
      if (wallet.id === targetTx.walletId) {
        if (targetTx.type === 'income') return { ...wallet, balance: wallet.balance - targetTx.amount };
        else return { ...wallet, balance: wallet.balance + targetTx.amount };
      }
      return wallet;
    });
    const newData = { ...allData, wallets: updatedWallets };
    saveToFirebase(newData, newTxs);
  };

  // --- Stats Calculation ---
  const monthlyStats = useMemo(() => {
    const totalFixedIncome = currentMonthData.income.total;
    const totalFixedExpense = currentMonthData.fixedExpenses.autoTransfers.reduce((s, i) => s + i.amount, 0) + 
                              currentMonthData.fixedExpenses.cardBills.reduce((s, i) => s + i.amount, 0);
    const monthTxs = transactions.filter(tx => tx.date.startsWith(monthKey));
    const variableIncome = monthTxs.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const variableExpense = monthTxs.filter(tx => !tx.type || tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    const totalIncome = totalFixedIncome + variableIncome;
    const totalExpense = totalFixedExpense + variableExpense;
    const balance = totalIncome - totalExpense;
    
    const catStats = {};
    monthTxs.filter(tx => !tx.type || tx.type === 'expense').forEach(tx => {
      const cat = tx.category || "기타";
      catStats[cat] = (catStats[cat] || 0) + tx.amount;
    });
    const sortedCatStats = Object.entries(catStats).sort((a, b) => b[1] - a[1]);

    return { totalIncome, totalExpense, balance, sortedCatStats, variableExpense };
  }, [currentMonthData, transactions, monthKey]);

  const dailyInfo = useMemo(() => {
    const info = {};
    const yStr = year; const mStr = String(month).padStart(2, "0");
    const mData = currentMonthData;
    const payday = `${yStr}-${mStr}-25`;
    if (!info[payday]) info[payday] = 0; info[payday] += mData.income.total;
    const transferDay = `${yStr}-${mStr}-26`;
    if (!info[transferDay]) info[transferDay] = 0; 
    const totalAutoTransfer = mData.fixedExpenses.autoTransfers.reduce((sum, item) => sum + item.amount, 0);
    info[transferDay] -= totalAutoTransfer;
    const cardDay = `${yStr}-${mStr}-15`;
    if (!info[cardDay]) info[cardDay] = 0;
    const totalCard = mData.fixedExpenses.cardBills.reduce((sum, item) => sum + item.amount, 0);
    info[cardDay] -= totalCard;

    transactions.forEach(tx => {
      if (!info[tx.date]) info[tx.date] = 0;
      if (tx.type === 'income') info[tx.date] += tx.amount;
      else info[tx.date] -= tx.amount;
    });
    return info;
  }, [transactions, currentMonthData, year, month]);

  // Firebase 저장용 래퍼 함수들
  const handleEditAmount = (type, category, id, currentVal, name) => {
    const inputVal = window.prompt(`[${name}]의 수정할 금액을 입력하세요:`, currentVal);
    if (inputVal === null || inputVal.trim() === "") return;
    const newAmount = Number(inputVal); if (isNaN(newAmount)) return alert("숫자만 입력해주세요.");
    
    const prevMonthData = allData.months[monthKey] || currentMonthData;
    let updatedMonthData = { ...prevMonthData };
    if (type === "income") {
      const updatedItems = prevMonthData.income.items.map(item => item.id === id ? { ...item, amount: newAmount } : item);
      updatedMonthData.income = { ...prevMonthData.income, items: updatedItems, total: updatedItems.reduce((s, i) => s + i.amount, 0) };
    } else {
      const updatedList = prevMonthData.fixedExpenses[category].map(item => item.id === id ? { ...item, amount: newAmount } : item);
      updatedMonthData.fixedExpenses = { ...prevMonthData.fixedExpenses, [category]: updatedList };
    }
    const newData = { ...allData, months: { ...allData.months, [monthKey]: updatedMonthData } };
    saveToFirebase(newData, null);
  };

  const startEditingName = (id, currentName) => { setEditingItemId(id); setEditingNameVal(currentName); };
  
  const saveEditingName = (type, category, id) => {
    if (!editingNameVal.trim()) return alert("이름을 입력해주세요.");
    const prevMonthData = allData.months[monthKey] || currentMonthData;
    let updatedMonthData = { ...prevMonthData };
    if (type === "income") {
      const updatedItems = prevMonthData.income.items.map(item => item.id === id ? { ...item, name: editingNameVal } : item);
      updatedMonthData.income = { ...prevMonthData.income, items: updatedItems };
    } else {
      const updatedList = prevMonthData.fixedExpenses[category].map(item => item.id === id ? { ...item, name: editingNameVal } : item);
      updatedMonthData.fixedExpenses = { ...prevMonthData.fixedExpenses, [category]: updatedList };
    }
    const newData = { ...allData, months: { ...allData.months, [monthKey]: updatedMonthData } };
    saveToFirebase(newData, null);
    setEditingItemId(null);
  };

  const handleDeleteFixedItem = (type, category, id) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    const prevMonthData = allData.months[monthKey] || currentMonthData;
    let updatedMonthData = { ...prevMonthData };
    if (type === "income") {
      const filteredItems = prevMonthData.income.items.filter(item => item.id !== id);
      updatedMonthData.income = { ...prevMonthData.income, items: filteredItems, total: filteredItems.reduce((s, i) => s + i.amount, 0) };
    } else {
      const filteredList = prevMonthData.fixedExpenses[category].filter(item => item.id !== id);
      updatedMonthData.fixedExpenses = { ...prevMonthData.fixedExpenses, [category]: filteredList };
    }
    const newData = { ...allData, months: { ...allData.months, [monthKey]: updatedMonthData } };
    saveToFirebase(newData, null);
  };

  const handleAddFixedItem = (type, category) => {
    const name = window.prompt("추가할 항목의 이름을 입력하세요:"); if (!name) return;
    const amountStr = window.prompt("금액을 입력하세요:", "0"); const amount = Number(amountStr); if (isNaN(amount)) return alert("숫자여야 합니다.");
    const newItem = { id: `added_${Date.now()}`, name, amount, desc: "추가됨" };
    const prevMonthData = allData.months[monthKey] || currentMonthData;
    let updatedMonthData = { ...prevMonthData };
    if (type === "income") {
      const newItems = [...prevMonthData.income.items, newItem];
      updatedMonthData.income = { ...prevMonthData.income, items: newItems, total: newItems.reduce((s, i) => s + i.amount, 0) };
    } else {
      const newList = [...prevMonthData.fixedExpenses[category], newItem];
      updatedMonthData.fixedExpenses = { ...prevMonthData.fixedExpenses, [category]: newList };
    }
    const newData = { ...allData, months: { ...allData.months, [monthKey]: updatedMonthData } };
    saveToFirebase(newData, null);
  };

  const handleAddWallet = () => { 
    if (!newWalletName) return alert("이름 입력!"); const initialBalance = Number(newWalletBalance) || 0; 
    const newWallet = { id: `w_${Date.now()}`, name: newWalletName, balance: initialBalance, type: "cash" }; 
    const newData = { ...allData, wallets: [...allData.wallets, newWallet] };
    saveToFirebase(newData, null);
    setNewWalletName(""); setNewWalletBalance("");
  };

  const handleDeleteWallet = (id, name) => { 
    if (window.confirm(`[${name}] 통장 삭제?`)) { 
      const newData = { ...allData, wallets: allData.wallets.filter(w => w.id !== id) };
      saveToFirebase(newData, null);
      if (selectedWalletId === id) setSelectedWalletId("");
    } 
  };

  const handleReset = () => { 
    if (window.confirm("🚨 전체 데이터를 초기화하시겠습니까? (공유된 모든 데이터가 삭제됩니다)")) { 
      // DB를 초기 데이터로 리셋
      const initPayload = {
        allData: { wallets: INITIAL_DATA.wallets, months: { [monthKey]: { income: INITIAL_DATA.income, fixedExpenses: INITIAL_DATA.fixedExpenses } } },
        transactions: []
      };
      saveToFirebase(initPayload.allData, initPayload.transactions);
      window.location.reload(); 
    } 
  };

  // Firebase 버전에서는 백업/복원이 필요 없지만(자동저장됨), 혹시 몰라 남겨둠
  const handleExport = () => { alert("현재는 자동 저장 모드입니다. 별도 백업이 필요 없습니다! (데이터는 안전하게 구글 서버에 있어요)"); };
  const handleImportClick = () => { alert("현재는 자동 저장 모드입니다."); };
  const handleFileChange = () => {};

  if (isLoading) return <div style={{display:"flex",justifyContent:"center",alignItems:"center",height:"100vh"}}>로딩중...</div>;

  // ... 렌더링 로직 (기존과 거의 동일) ...
  // ... (View Functions: renderCalendarView, renderListView, renderStatsView) ...
  // [여기서부터는 UI 코드입니다. 분량상 위에서 작성한 render 함수들을 그대로 씁니다.]
  // [실제 적용시에는 위 코드의 return 문 안쪽 내용을 그대로 쓰면 됩니다.]
  
  // (지면 관계상 핵심 렌더링 부분만 다시 적어드립니다. 위 코드의 렌더링 로직을 그대로 사용하세요)
  const renderCalendarView = () => (
    <>
      <div style={dashboardStyle}>
        <div style={dashItemStyle}><div style={dashLabelStyle}>총 수입</div><div style={dashValueStyle("blue")}>+{monthlyStats.totalIncome.toLocaleString()}</div></div>
        <div style={{ width: "1px", backgroundColor: "#e2e8f0" }}></div>
        <div style={dashItemStyle}><div style={dashLabelStyle}>총 지출</div><div style={dashValueStyle("red")}>-{monthlyStats.totalExpense.toLocaleString()}</div></div>
        <div style={{ width: "1px", backgroundColor: "#e2e8f0" }}></div>
        <div style={dashItemStyle}><div style={dashLabelStyle}>순수익</div><div style={dashValueStyle(monthlyStats.balance >= 0 ? "blue" : "red")}>{monthlyStats.balance >= 0 ? "+" : ""}{monthlyStats.balance.toLocaleString()}</div></div>
      </div>

      <button onClick={() => setShowFixedList(!showFixedList)} style={toggleBtnStyle}>{showFixedList ? "🔼 목록 접기" : "📋 고정 수입/지출 목록 관리"}</button>
      {showFixedList && (
        <div style={{ ...cardStyle, border: "2px solid #2563eb", backgroundColor: "#f0f9ff" }}>
          {/* ... 고정 지출 렌더링 ... */}
          <div style={listGroupStyle}>
            <div style={listHeaderStyle}>💰 고정 수입 (25일)</div>
            {currentMonthData.income.items.map(item => <RenderListItem key={item.id} item={item} type="income" category={null} />)}
            <div style={{ textAlign: "right", fontWeight: "bold", marginTop: "5px", color: "blue" }}>합계: +{currentMonthData.income.total.toLocaleString()}원</div>
            <button onClick={() => handleAddFixedItem("income", null)} style={addItemBtnStyle}>+ 수입 항목 추가</button>
          </div>
          <div style={listGroupStyle}>
            <div style={listHeaderStyle}>🏦 자동이체 (26일)</div>
            {currentMonthData.fixedExpenses.autoTransfers.map(item => <RenderListItem key={item.id} item={item} type="expense" category="autoTransfers" />)}
            <div style={{ textAlign: "right", fontWeight: "bold", marginTop: "5px", color: "red" }}>합계: -{currentMonthData.fixedExpenses.autoTransfers.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원</div>
            <button onClick={() => handleAddFixedItem("expense", "autoTransfers")} style={addItemBtnStyle}>+ 자동이체 항목 추가</button>
          </div>
          <div>
            <div style={listHeaderStyle}>💳 카드/공과금 (15일)</div>
            {currentMonthData.fixedExpenses.cardBills.map(item => <RenderListItem key={item.id} item={item} type="expense" category="cardBills" />)}
            <div style={{ textAlign: "right", fontWeight: "bold", marginTop: "5px", color: "red" }}>합계: -{currentMonthData.fixedExpenses.cardBills.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원</div>
            <button onClick={() => handleAddFixedItem("expense", "cardBills")} style={addItemBtnStyle}>+ 카드/공과금 항목 추가</button>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <SimpleCalendar year={year} month={month} selectedDate={selectedDate} onDateClick={handleDateClick} dailyAmounts={dailyInfo} />
      </div>
      
      {selectedFixedEvents.length > 0 && (
        <div style={{ ...cardStyle, border: "2px solid #ddd", backgroundColor: "#f9fafb" }}>
          <div style={titleStyle}>📌 {selectedDate} 고정 일정</div>
          {selectedFixedEvents.map((evt, idx) => (
            <div key={idx} style={{marginBottom:"10px"}}>
              <div style={{ marginBottom: "5px", fontSize: "16px", fontWeight: "bold", color: evt.type === "income" ? "blue" : "red" }}>{evt.name} ({evt.type === "income" ? "+" : "-"}{evt.amount.toLocaleString()}원)</div>
              <div style={{ fontSize: "13px", color: "#555", backgroundColor: "#eee", padding: "10px", borderRadius: "8px" }}>
                {evt.items.map(item => <div key={item.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}><span>{item.name}</span><span>{item.amount.toLocaleString()}</span></div>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {transactions.filter(tx => tx.date === selectedDate).length > 0 && (
        <div style={cardStyle}>
          <div style={titleStyle}>📝 {selectedDate} 내역</div>
          {transactions.filter(tx => tx.date === selectedDate).map(tx => (
            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{flex:1}}>
                <div style={{fontWeight:"bold"}}>{tx.desc}</div>
                <div style={{fontSize:"11px", color:"#666"}}>{tx.category || "기타"} | {allData.wallets && allData.wallets.find(w=>w.id===tx.walletId)?.name || "삭제된통장"}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <span style={{ color: tx.type === 'income' ? "blue" : "red", fontWeight: "bold", display:"block" }}>
                  {tx.type === 'income' ? "+" : "-"}{tx.amount.toLocaleString()}원
                </span>
                <button onClick={() => handleDeleteTransaction(tx.id)} style={deleteTxBtnStyle}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={cardStyle}>
        <div style={titleStyle}>👛 지갑 잔액 현황</div>
        <button onClick={handleFillWallets} style={fillWalletBtnStyle}>🔄 예산대로 지갑 잔액 채우기</button>
        <div style={{ marginBottom: "15px" }}>
          {allData.wallets && allData.wallets.map(w => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div><span>{w.name}</span><button onClick={() => handleDeleteWallet(w.id, w.name)} style={smallBtnStyle}>삭제</button></div>
              <span style={{ fontWeight: "bold", color: w.balance < 0 ? "red" : "black" }}>{w.balance.toLocaleString()}원</span>
            </div>
          ))}
        </div>
        <div style={addWalletStyle}>
          <input type="text" placeholder="새 통장 이름" style={{ ...inputStyle, marginBottom: 0, flex: 2 }} value={newWalletName} onChange={(e) => setNewWalletName(e.target.value)} />
          <input type="number" placeholder="초기 잔액" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={newWalletBalance} onChange={(e) => setNewWalletBalance(e.target.value)} />
          <button onClick={handleAddWallet} style={{ ...btnStyle, width: "auto", padding: "0 15px", backgroundColor: "#10b981", marginBottom: 0 }}>추가</button>
        </div>
      </div>
    </>
  );

  const renderListView = () => {
    const filteredTxs = transactions.filter(tx => 
      tx.desc.includes(searchTerm) || (tx.category && tx.category.includes(searchTerm)) || String(tx.amount).includes(searchTerm)
    ).sort((a,b) => b.date.localeCompare(a.date));

    return (
      <div style={cardStyle}>
        <div style={titleStyle}>🔍 전체 내역 검색</div>
        <input type="text" placeholder="검색어 입력 (예: 커피, 식비, 5000)" style={inputStyle} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <div style={{maxHeight: "60vh", overflowY: "auto"}}>
          {filteredTxs.length === 0 ? <div style={{textAlign:"center", color:"#999", padding:"20px"}}>내역이 없습니다.</div> : 
            filteredTxs.map(tx => (
              <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{fontSize:"12px", color:"#888", width:"80px"}}>{tx.date}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:"bold"}}>{tx.desc}</div>
                  <div style={{fontSize:"11px", color:"#666", backgroundColor:"#f3f4f6", display:"inline-block", padding:"2px 4px", borderRadius:"4px"}}>{tx.category || "기타"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{ color: tx.type === 'income' ? "blue" : "red", fontWeight: "bold" }}>
                    {tx.type === 'income' ? "+" : "-"}{tx.amount.toLocaleString()}
                  </div>
                  <button onClick={() => handleDeleteTransaction(tx.id)} style={{...deleteTxBtnStyle, marginTop:"2px"}}>삭제</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    );
  };

  const renderStatsView = () => {
    const { sortedCatStats, variableExpense } = monthlyStats;
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>{month}월 지출 통계 (변동지출)</div>
        <div style={{marginBottom:"20px", textAlign:"center", fontSize:"20px", fontWeight:"bold", color:"#333"}}>총 {variableExpense.toLocaleString()}원</div>
        {sortedCatStats.length === 0 ? <div style={{textAlign:"center", color:"#999"}}>지출 내역이 없습니다.</div> :
          sortedCatStats.map(([cat, amount]) => {
            const percentage = variableExpense === 0 ? 0 : Math.round((amount / variableExpense) * 100);
            return (
              <div key={cat} style={{marginBottom:"15px"}}>
                <div style={{display:"flex", justifyContent:"space-between", marginBottom:"5px", fontSize:"13px"}}>
                  <span style={{fontWeight:"bold"}}>{cat}</span>
                  <span>{amount.toLocaleString()}원 ({percentage}%)</span>
                </div>
                <div style={{width:"100%", height:"10px", backgroundColor:"#f3f4f6", borderRadius:"4px", overflow:"hidden"}}>
                  <div style={chartBarStyle(`${percentage}%`, CATEGORY_COLORS[cat] || "#ccc")}></div>
                </div>
              </div>
            )
          })
        }
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#f5f7fa", minHeight: "100vh" }}>
      <div style={containerStyle}>
        {/* 상단바 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h2 style={{ fontSize: "18px", margin: 0 }}>My 가계부 (공유중 🟢)</h2>
          {/* 자동저장이므로 백업 버튼 제거/숨김 처리 */}
        </div>

        {activeTab !== 'list' && (
          <div style={headerStyle}>
            <button onClick={handlePrevMonth} style={navBtnStyle}>◀</button>
            <h2 style={{ margin: 0 }}>{year}년 {month}월</h2>
            <button onClick={handleNextMonth} style={navBtnStyle}>▶</button>
          </div>
        )}
        <div style={{ textAlign: "right", marginBottom: "10px" }}><button onClick={handleReset} style={resetBtnStyle}>초기화</button></div>

        {activeTab === 'calendar' && renderCalendarView()}
        {activeTab === 'list' && renderListView()}
        {activeTab === 'stats' && renderStatsView()}
      </div>

      <div style={bottomNavStyle}>
        <div style={bottomNavItemStyle(activeTab === 'calendar')} onClick={() => setActiveTab('calendar')}>📅 달력</div>
        <div style={bottomNavItemStyle(activeTab === 'list')} onClick={() => setActiveTab('list')}>🔍 리스트</div>
        <div style={bottomNavItemStyle(activeTab === 'stats')} onClick={() => setActiveTab('stats')}>📊 통계</div>
      </div>

      {isModalOpen && (
        <div style={modalOverlayStyle} onClick={() => setIsModalOpen(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button style={closeBtnStyle} onClick={() => setIsModalOpen(false)}>✕</button>
            <div style={titleStyle}>{selectedDate} 기록</div>
            <div style={typeToggleContainer}>
              <button onClick={() => setTxType("expense")} style={typeBtnStyle(txType === "expense", "expense")}>🔴 지출 (-)</button>
              <button onClick={() => setTxType("income")} style={typeBtnStyle(txType === "income", "income")}>🔵 수입 (+)</button>
            </div>
            <div style={{marginBottom:"10px"}}>
              <label style={{fontSize:"12px", color:"#666", marginBottom:"4px", display:"block"}}>카테고리</label>
              <select style={inputStyle} value={inputCategory} onChange={(e) => setInputCategory(e.target.value)}>
                {(txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <input type="text" placeholder="내용 (예: 커피)" style={inputStyle} value={inputDesc} onChange={(e) => setInputDesc(e.target.value)} autoFocus />
            <input type="number" placeholder="금액 (원)" style={inputStyle} value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} />
            <select style={inputStyle} value={selectedWalletId} onChange={(e) => setSelectedWalletId(e.target.value)}>
              <option value="" disabled>어느 통장인가요?</option>
              {allData.wallets && allData.wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name} (잔액: {wallet.balance.toLocaleString()}원)</option>)}
            </select>
            <button onClick={handleAddTransaction} style={btnStyle}>저장하기</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;