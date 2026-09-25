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
  /инженер-конструктор/i, /инженер-технолог/i, /инженер по монтажу/i,
  /инженер по эксплуатации/i, /инженер-строитель/i, /прораб/i,
  /мастер участка/i, /технолог производства/i, /наладчик/i,
  /инженер пусконаладочных работ/i, /геодезист/i, /кадастров(ый|ой) инженер/i,
  /врач/i, /учитель/i, /воспитатель/i, /фельдшер/i, /медсестр/i, /медбрат/i
];

const UNPAID_BLOCKLIST = [
  /волонт/i, /неоплачива/i, /безвозмездн/i, /без оплаты/i
];

const DEFENSE_SVO_BLOCKLIST = [
  /оборонн/i, /(?<![a-zа-яё])опк(?![a-zа-яё])/i, /военно-промышленн/i,
  /(?<![a-zа-яё])сво(?![a-zа-яё])/i,
  /спецоперац/i, /военн(ый|ая) завод/i, /боеприпас/i, /вооружени/i,
  /мобилизац/i, /военкомат/i, /контрактн(ая|ую) служб/i, /оборонзаказ/i,
  /военную службу по контракту/i, /контракт(ник|ную службу)/i,
  /министерства обороны/i, /пункт отбора/i, /рекрутер сво/i
];

const TRADING_BLOCKLIST = [
  /трейдер/i, /трейдинг/i, /криптовалют/i, /крипто-?арбитраж/i,
  /форекс/i, /\bforex\b/i, /бинарн(ые|ых) опцион/i, /арбитраж(?!ный суд)/i,
  /майнинг/i, /биржа крипт/i, /crypto/i,
  /инвестиционн(ый|ая) агент/i, /инвестиционн(ый|ая) консультант/i,
  /инвестиционн(ый|ая) советник/i
];

const HALAL_BLOCKLIST = [
  /алкогол/i, /пивовар/i, /винодел/i, /ликёр/i, /виски/i, /водочн/i,
  /казино/i, /букмекер/i, /азартн/i, /покер-рум/i, /беттинг/i, /ставки на спорт/i,
  /свинин/i, /свиноводств/i, /свиноферм/i,
  /микрозайм/i, /(?<![a-zа-яё])мфо(?![a-zа-яё])/i, /коллектор/i,
  // упрощено: любое упоминание банка теперь исключает вакансию
  /банк/i,
  /потребительск(ий|ое) кредит/i, /страхован/i, /кредитн(ый|ая) организац/i,
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
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const obj = {};
      for (const id of parsed) obj[id] = null;
      return obj;
    }
    return parsed;
  } catch {
    return {};
  }
}

async function saveSeen(seenObj) {
  const entries = Object.entries(seenObj).slice(-3000);
  await fs.writeFile(SEEN_FILE, JSON.stringify(Object.fromEntries(entries)));
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

// Отсеиваем вакансии, где чётко требуется высшее/техническое образование
function isEducationOk(vacancy) {
  const text = (vacancy.candidat || '').toLowerCase();

  const requiresHigher = /высшее[^.]{0,25}образование|образование[^.]{0,10}высшее|высшее техническое|высшее профильное|неполное высшее/i.test(text);

  if (!requiresHigher) return true;

  // Если рядом есть смягчающие слова — считаем необязательным требованием
  const softened = /приветствуется|желательно|не обязательно|необязательно|плюсом|преимуществ/i.test(text);

  return softened;
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
  try {
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
      const body = await res.text();
      console.log('ОШИБКА отправки в Telegram:', res.status, body);
      return null;
    }
    const data = await res.json();
    return data.result?.message_id ?? null;
  } catch (err) {
    console.log('ИСКЛЮЧЕНИЕ при отправке в Telegram:', err.message);
    return null;
  }
}

async function deleteTelegramMessage(messageId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, message_id: messageId })
  });
  const data = await res.json();
  return data.ok === true;
}

function formatVacancy(v) {
  const salary = v.payment_from || v.payment_to
    ? `${v.payment_from || ''}${v.payment_from && v.payment_to ? '–' : ''}${v.payment_to || ''} ${v.currency || ''}`
    : 'не указана';
  const label = getLabel(v);
  return `${label}\n<b>${v.profession}</b>\n${v.firm_name || ''}\nЗарплата: ${salary}\n${v.link}`;
}

async function runSearch() {
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
  const educationOkItems = notPhysicalItems.filter(isEducationOk);
  const halalItems = educationOkItems.filter(isHalal);
  const finalItems = halalItems.filter(passesSalaryRule);

  console.log(`Всего найдено: ${allVacancies.size}, удалённых: ${remoteItems.length}, не физический труд: ${notPhysicalItems.length}, без обязательного высшего: ${educationOkItems.length}, прошли халяль/волонтёр/трейдинг-фильтр: ${halalItems.length}, прошли фильтр зарплаты: ${finalItems.length}`);

  let newCount = 0;
  let failCount = 0;

  for (const v of finalItems) {
    if (seen[v.id] !== undefined) continue;

    const messageId = await sendTelegramMessage(formatVacancy(v));

    if (messageId !== null) {
      seen[v.id] = messageId;
      newCount++;
    } else {
      failCount++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  await saveSeen(seen);
  console.log(`Готово. Успешно отправлено: ${newCount}. Не удалось отправить: ${failCount}.`);
}

async function runDelete(vacancyId) {
  const seen = await loadSeen();
  const messageId = seen[vacancyId];

  if (messageId === undefined) {
    console.log(`Вакансия с ID ${vacancyId} не найдена в seen.json`);
    return;
  }
  if (messageId === null) {
    console.log(`Для вакансии ${vacancyId} не сохранён message_id (старая запись) — удалите сообщение вручную в Telegram`);
    return;
  }

  const ok = await deleteTelegramMessage(messageId);
  console.log(ok
    ? `Сообщение для вакансии ${vacancyId} успешно удалено из Telegram`
    : `Не удалось удалить сообщение для вакансии ${vacancyId} (возможно, уже удалено или прошло больше 48 часов)`);
}

async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID || !SUPERJOB_KEY) {
    throw new Error('Не заданы TELEGRAM_TOKEN, TELEGRAM_CHAT_ID или SUPERJOB_KEY');
  }

  const [, , command, arg] = process.argv;

  if (command === 'delete' && arg) {
    await runDelete(arg);
  } else {
    await runSearch();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});