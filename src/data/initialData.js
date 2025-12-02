// src/data/initialData.js

export const INITIAL_DATA = {
  // 1. 수입
  income: {
    total: 4070000,
    items: [
      { id: "inc_1", name: "월급(이자지원포함)", amount: 3770000 },
      { id: "inc_2", name: "식대", amount: 300000 }
    ]
  },

  // 2. 고정 지출 (항목은 그대로 둡니다)
  fixedExpenses: {
    autoTransfers: [
      { id: "at_1", name: "농협352(박예은/학원비)", amount: 490000, desc: "선우어린이집(18)+태권도(15)+보험(16)" },
      { id: "at_2", name: "농협302(박예은/생활비)", amount: 600000, desc: "생활비 메인" },
      { id: "at_3", name: "카뱅3333(박예은/용돈)", amount: 165000, desc: "용돈+통신비" },
      { id: "at_4", name: "농협 수영통장", amount: 220000, desc: "교통비(12)+수영(10)" },
      { id: "at_5", name: "농협 시우특활비", amount: 230000, desc: "시우 특활비" },
      { id: "at_6", name: "농협 기름값", amount: 100000, desc: "차량 유지비" },
      { id: "at_7", name: "카뱅 현수밥값", amount: 300000, desc: "점심 식대" },
      { id: "at_8", name: "기업 현수보험", amount: 90000, desc: "현대해상" },
      { id: "at_9", name: "국민 시우선우통장", amount: 500000, desc: "청년희망적금(50)" },
      { id: "at_10", name: "우리 아이들청약", amount: 160000, desc: "실지출4만/저축12만" },
      { id: "at_11", name: "하나 청년희망", amount: 100000, desc: "청년희망적금(10)" },
      { id: "at_12", name: "농협 경조사", amount: 50000, desc: "경조사비 저축" },
      { id: "at_13", name: "농협 주택청약", amount: 50000, desc: "본인 청약" },
      { id: "at_14", name: "새 적금통장(미정)", amount: 150000, desc: "만기+청약중단분 저축" }
    ],
    cardBills: [
      { id: "cb_1", name: "아파트 관리비", amount: 200000 },
      { id: "cb_2", name: "도시가스", amount: 100000 },
      { id: "cb_3", name: "현수 통신비", amount: 40900 },
      { id: "cb_4", name: "시우 통신비", amount: 8700 },
      { id: "cb_5", name: "LG 인터넷", amount: 28000 },
      { id: "cb_6", name: "캐롯 자동차보험", amount: 50000 },
      { id: "cb_7", name: "DB 손해보험", amount: 22000 },
      { id: "cb_8", name: "고속도로 톨비", amount: 30000 },
      { id: "cb_9", name: "시우 미술학원", amount: 130000 },
      { id: "cb_10", name: "디즈니+", amount: 10000 },
      { id: "cb_11", name: "구글 원드라이브", amount: 3000 }
    ]
  },

  // 3. 지갑 (텅 빈 상태로 시작!)
  wallets: [] 
};