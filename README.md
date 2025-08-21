# 8월 가계부 – Vercel 배포용 (Vite + React + Tailwind)

## 빠른 시작
```bash
npm i
npm run dev
```
브라우저에서 `http://localhost:5173` 접속.

## 배포 (Vercel)
1. 이 폴더를 GitHub에 푸시
2. [Vercel](https://vercel.com) → New Project → 해당 저장소 선택 → Deploy
   - 빌드 명령: `npm run build`
   - 출력 디렉토리: `dist`

또는 Vercel CLI:
```bash
npm i -g vercel
vercel
```
