const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPERJOB_KEY = process.env.SUPERJOB_KEY;

const HEADERS = { 'X-Api-App-Id': SUPERJOB_KEY };

const KEYWORDS = [
  'менеджер по работе с клиентами',
  'менеджер по закупкам',
  'менеджер по снабжению',
  'менеджер по продажам',
  'оператор call-центра',
  'специалист поддержки клиентов',
  'ассистент менеджера',
  'координатор',
  'менеджер маркетплейса',
  'без опыта удаленно',
  'удаленная работа',
  'подработка удаленно',
  'работа на дому'
];

const MIN_SALARY_FOR_FULLTIME = 80000;

const PHYSICAL_JOB_BLOCKLIST = [
  /кухонный работник/i, /повар/i, /официант/i, /бариста/i, /кассир/i,
  /продавец/i, /грузчик/i, /курьер/i, /водитель/i, /охранник/i,
  /уборщи/i, /дворник/i, /разнорабоч/i, /слесар/i, /сварщик/i,
  /электрик/i, /сантехник/i, /парикмахер/i, /массажист/i, /мастер маникюр/i,
  /горничн/i, /швея/i, /кладовщик/i, /упаковщик/i, /монтажник/i,
  /строител/i, /отделочник/i, /сборщик/i, /мерчендайзер/i,
  // инженерные и "гибридные" специальности, обычно требующие присутствия на объекте/производстве
  /инженер-конструктор/i, /инженер-технолог/i, /инженер по монтажу/i,
  /инженер по эксплуатации/i, /инженер-строитель/i, /прораб/i,
  /мастер участка/i, /технолог производства/i, /наладчик/i,
  /инженер пусконаладочных работ/i, /геодезист/i, /кадастров(ый|ой) инженер/i
];

const UNPAID_BLOCKLIST = [
  /волонт/i, /неоплачива/i, /безвозмездн/i, /без оплаты/i
];

const DEFENSE_SVO_BLOCKLIST = [
  /оборонн/i, /\bопк\b/i, /военно-промышленн/i, /\bсво\b/i,
  /спецоперац/i, /военн(ый|ая) завод/i, /боеприпас/i, /вооружени/i,
  /мобилизац/i, /военкомат/i, /контрактн(ая) служба/i, /оборонзаказ/i
];

const TRADING_BLOCKLIST = [
  /трейдер/i, /трейдинг/i, /криптовалют/i, /крипто-?арбитраж/i,
  /форекс/i, /\bforex\b/i, /бинарн(ые|ых) опцион/i, /арбитраж(?!ный суд)/i,
  /майнинг/i, /биржа крипт/i, /crypto/i
];

const HALAL_BLOCKLIST = [
  /алкогол/i, /пивовар/i, /винодел/i, /ликёр/i, /виски/i, /водочн/i,
  /казино/i, /букмекер/i, /азартн/i, /покер-рум/i, /беттинг/i, /ставки на спорт/i,
  /свинин/i, /свиноводств/i, /свиноферм/i,
  /микрозайм/i, /\bмфо\b/i, /коллектор/i, /банк[а-я]*\s*(вакансия|сотрудник|специалист|менеджер|кредит)/i, /потребительск(ий|ое) кредит/i, /страхован/i, /кредитн(ый|ая) организац/i,
  /интим-услуг/i, /эскорт/i, /стриптиз/i, /вебкам/i, /контент для взрослых/i, /18\+/,
  /ночной клуб/i, /пивной бар/i, /коктейльный бар/i, /стриптиз-клуб/i,
  /табачн/i, /сигарет/i, /вейп/i, /электронн(ая|ые) сигарет/i,
  /млм/i, /\bmlm\b/i, /сетевой маркетинг/i, /финансовая пирамида/i, /структурный бизнес/i,
  ...DEFENSE_SVO_BLOCKLIST,
  ...UNPAID_BLOCKLIST,
  ...TRADING_BLOCKLIST
];

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

function isPhysicalJob(vacancy) {
  const title = vacancy.profession || '';
  return PHYSICAL_JOB_BLOCKLIST.some(pattern => pattern.test(title));
}

function isHalal(vacancy) {
  const text = `${vacancy.profession || ''} ${vacancy.firm_name || ''} ${vacancy.candidat || ''} ${vacancy.work || ''}`.toLowerCase();
  return !HALAL_BLOCKLIST.some(pattern => pattern.test(text));
}

function isFulltime(vacancy) {
  const typeTitle = (vacancy.type_of_work?.title || '').toLowerCase();
  return /полн/.test(typeTitle);
}

function getLabel(vacancy) {
  if (isFulltime(vacancy)) return '💼 ОСНОВНАЯ РАБОТА';
  return '🕐 ПОДРАБОТКА';
}

function passesSalaryRule(vacancy) {
  if (!isFulltime(vacancy)) return true;
  const amount = vacancy.payment_from || vacancy.payment_to;
  if (!amount) return false;
  if (vacancy.currency && vacancy.currency !== 'rub') return true;
  return amount >= MIN_SALARY_FOR_FULLTIME;
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
  const label = getLabel(v);
  return `${label}\n<b>${v.profession}</b>\n${v.firm_name || ''}\nЗарплата: ${salary}\n${v.link}`;
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
  const notPhysicalItems = remoteItems.filter(v => !isPhysicalJob(v));
  const halalItems = notPhysicalItems.filter(isHalal);
  const finalItems = halalItems.filter(passesSalaryRule);

  console.log(`Всего найдено: ${allVacancies.size}, удалённых: ${remoteItems.length}, не физический труд: ${notPhysicalItems.length}, прошли халяль/волонтёр/трейдинг-фильтр: ${halalItems.length}, прошли фильтр зарплаты: ${finalItems.length}`);

  let newCount = 0;
  for (const v of finalItems) {
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