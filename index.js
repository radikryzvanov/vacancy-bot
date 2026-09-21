const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPERJOB_KEY = process.env.SUPERJOB_KEY;

const HEADERS = { 'X-Api-App-Id': SUPERJOB_KEY };

const KEYWORDS = [
  'менеджер по работе с клиентами',
  'менеджер по закупкам',
  'менеджер по снабжению'
];

const MIN_SALARY_RUB = 80000;

const fs = await import('node:fs/promises');
const SEEN_FILE = 'seen.json';

async function loadSeen() {
  try {
    const raw = await fs.readFile(SEEN_FILE, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function saveSeen(seenSet) {
  const arr = Array.from(seenSet).slice(-3000);
  await fs.writeFile(SEEN_FILE, JSON.stringify(arr));
}

function isRemote(vacancy) {
  const placeTitle = vacancy.place_of_work?.title || '';
  const text = `${vacancy.profession || ''} ${placeTitle} ${vacancy.candidat || ''} ${vacancy.work || ''}`.toLowerCase();
  return /удал[её]нн|дистанцион|remote|на дому/.test(text);
}

function salaryOk(vacancy) {
  const amount = vacancy.payment_from || vacancy.payment_to;
  if (!amount) return false;
  // SuperJob обычно указывает зарплату сразу в рублях (currency: "rub")
  if (vacancy.currency && vacancy.currency !== 'rub') return true; // не рубли — не отсеиваем, пусть человек сам посмотрит
  return amount >= MIN_SALARY_RUB;
}

async function searchVacancies(keyword) {
  const url = `https://api.superjob.ru/2.0/vacancies/?keyword=${encodeURIComponent(keyword)}&count=100`;
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    const body = await res.text();
    console.log(`ОШИБКА запроса по "${keyword}", статус ${res.status}. Ответ сервера: ${body.slice(0, 500)}`);
    return [];
  }

  const data = await res.json();
  return data.objects || [];
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  if (!res.ok) {
    console.log('Ошибка отправки в Telegram:', await res.text());
  }
}

function formatVacancy(v) {
  const salary = v.payment_from || v.payment_to
    ? `${v.payment_from || ''}${v.payment_from && v.payment_to ? '–' : ''}${v.payment_to || ''} ${v.currency || ''}`
    : 'не указана';
  return `<b>${v.profession}</b>\n${v.firm_name || ''}\nЗарплата: ${salary}\n${v.link}`;
}

async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID || !SUPERJOB_KEY) {
    throw new Error('Не заданы TELEGRAM_TOKEN, TELEGRAM_CHAT_ID или SUPERJOB_KEY');
  }

  const seen = await loadSeen();
  const allVacancies = new Map();

  for (const keyword of KEYWORDS) {
    const items = await searchVacancies(keyword);
    for (const v of items) {
      allVacancies.set(v.id, v);
    }
  }

  const remoteItems = Array.from(allVacancies.values()).filter(isRemote);
  const salaryItems = remoteItems.filter(salaryOk);

  console.log(`Всего найдено уникальных вакансий: ${allVacancies.size}, из них удалённых: ${remoteItems.length}, с подходящей зарплатой: ${salaryItems.length}`);

  let newCount = 0;
  for (const v of salaryItems) {
    if (seen.has(v.id)) continue;
    await sendTelegramMessage(formatVacancy(v));
    seen.add(v.id);
    newCount++;
    await new Promise(r => setTimeout(r, 500));
  }

  await saveSeen(seen);
  console.log(`Готово. Новых вакансий отправлено: ${newCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});