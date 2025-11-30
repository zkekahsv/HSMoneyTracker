import React from "react";

export default function SimpleCalendar({ year, month, selectedDate, onDateClick, dailyAmounts }) {
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push({ id: `empty-${i}`, day: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendarDays.push({ id: `day-${d}`, day: d, fullDate: dateStr });
  }

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "5px",
    marginTop: "10px",
  };
  
  const cellStyle = (isSelected, isToday) => ({
    height: "70px",
    border: isSelected ? "2px solid #2563eb" : "1px solid #eee",
    borderRadius: "8px",
    padding: "4px",
    cursor: "pointer",
    backgroundColor: isToday ? "#eff6ff" : "#fff",
    position: "relative",
  });

  const amountBaseStyle = {
    fontSize: "10px",
    position: "absolute",
    bottom: "4px",
    right: "4px",
    fontWeight: "bold",
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", fontWeight: "bold", color: "#666", marginBottom:"5px" }}>
        <div style={{color:"red"}}>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div style={{color:"blue"}}>토</div>
      </div>

      <div style={gridStyle}>
        {calendarDays.map((item) => {
          if (!item.day) return <div key={item.id}></div>;

          const isSelected = item.fullDate === selectedDate;
          const isToday = item.fullDate === todayStr;
          const dayAmount = dailyAmounts[item.fullDate] || 0;

          return (
            <div
              key={item.id}
              onClick={() => onDateClick(item.fullDate)}
              style={cellStyle(isSelected, isToday)}
            >
              <div style={{ fontSize: "12px", fontWeight: isToday ? "bold" : "normal" }}>{item.day}</div>
              
              {dayAmount !== 0 && (
                <div style={{ 
                  ...amountBaseStyle, 
                  color: dayAmount > 0 ? "blue" : "red"
                }}>
                  {dayAmount > 0 ? "+" : ""}{dayAmount.toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}