# Бухал өвс: 1-р хэсэг (суурь + 1-р үе шат)

## Ажиллуулах
    npm install
    ADMIN_KEY=нууц-түлхүүр SESSION_SECRET=урт-санамсаргүй-тэмдэгт npm start

Render дээр: Build `npm install`, Start `npm start`. Орчны хувьсагчид: `SESSION_SECRET`, `ADMIN_KEY`, `NODE_ENV=production`,
`DB_PATH=/var/data/data.db` (Render-ийн байнгын диск холбож, өгөгдөл устахгүй болгоно).

## Эрх олгох (төлбөр баталгаажсаны дараа)
    curl -X POST https://САЙТ/api/admin/grant -H "x-admin-key: нууц-түлхүүр" -H "Content-Type: application/json" -d '{"email":"хэрэглэгч@жишээ.mn"}'
Энэ нь тухайн мөчөөс 30 хоногийн эрх үүсгэнэ. QR төлбөрийн автомат урсгалтай дараа нь холбоно.
