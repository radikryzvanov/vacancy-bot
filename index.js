const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const HEADERS = { 'User-Agent': 'vacancy-bot-personal (test@example.com)' };

const COUNTRIES = ['Россия', 'Казахстан', 'Беларусь', 'Узбекистан', 'Киргизия', 'Азербайджан', 'Грузия'];

const KEYWORDS = [
  'менеджер по работе с клиентами',
  'менеджер по закупкам',
  'менеджер по снабжению'
];

const MIN_SALARY_RUB = 80000;

// Примерные курсы валют к рублю для грубой прикидки зарплаты.
// Это не точный курс, а ориентир — чтобы не пропустить вакансии в другой валюте.
const RATES_TO_RUB = {
  USD: 95, EUR: 103, KZT: 0.18, BYN: 29,
  UZS: 0.0075, KGS: 1.1, AZN: 56, GEL: 35
};

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
  // храним не больше 3000 последних id, чтобы файл не рос бесконечно
  const arr = Array.from(seenSet).slice(-3000);
  await fs.writeFile(SEEN_FILE, JSON.stringify(arr));
}

async function getCountryAreaIds() {
  const res = await fetch('https://api.hh.ru/areas', { headers: HEADERS });
  const data = await res.json();
  const ids = {};
  for (const country of data) {
    for (const target of COUNTRIES) {
      if (!ids[target] && country.name.toLowerCase() === target.toLowerCase()) {
        ids[target] = country.id;
      }
    }
  }
  return ids;
}

function isRemote(vacancy) {
  if (vacancy.schedule && vacancy.schedule.id === 'remote') return true;
  const text = `${vacancy.name} ${vacancy.snippet?.requirement || ''} ${vacancy.snippet?.responsibility || ''}`.toLowerCase();
  return /удал[её]нн|дистанцион|remote/.test(text);
}

function salaryOk(vacancy) {
  const s = vacancy.salary;
  if (!s) return false; // зарплата не указана — пока пропускаем такие
  let amount = s.from || s.to;
  if (!amount) return false;
  if (s.currency && s.currency !== 'RUR') {
    const rate = RATES_TO_RUB[s.currency];
    if (!rate) return true; // валюту не знаем — не отсеиваем, пусть человек сам посмотрит
    amount = amount * rate;
  }
  return amount >= MIN_SALARY_RUB;
}

async function searchVacancies(areaId) {
  const text = KEYWORDS.map(k => `"${k}"`).join(' OR ');
  const url = `https://api.hh.ru/vacancies?text=${encodeURIComponent(text)}&area=${areaId}&per_page=50&order_by=publication_time`;
  const res = await fetch(url, { headers: HEADERS });
  const data = await res.json();
  return data.items || [];
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
}

function formatVacancy(v) {
  const salary = v.salary
    ? `${v.salary.from ?? ''}${v.salary.from && v.salary.to ? '–' : ''}${v.salary.to ?? ''} ${v.salary.currency}`
    : 'не указана';
  return `<b>${v.name}</b>\n${v.employer?.name || ''}\nЗарплата: ${salary}\n${v.alternate_url}`;
}

async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Не заданы TELEGRAM_TOKEN или TELEGRAM_CHAT_ID');
  }

  const seen = await loadSeen();
  const areaIds = await getCountryAreaIds();
  let newCount = 0;

  for (const country of COUNTRIES) {
    const areaId = areaIds[country];
    if (!areaId) continue;

    const items = await searchVacancies(areaId);

    for (const v of items) {
      if (seen.has(v.id)) continue;
      if (!isRemote(v)) continue;
      if (!salaryOk(v)) continue;

      await sendTelegramMessage(formatVacancy(v));
      seen.add(v.id);
      newCount++;
      await new Promise(r => setTimeout(r, 500)); // небольшая пауза между сообщениями
    }
  }

  await saveSeen(seen);
  console.log(`Готово. Новых вакансий отправлено: ${newCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});