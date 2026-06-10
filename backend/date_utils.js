const TZ = 'America/Sao_Paulo';

// Retorna 'YYYY-MM-DD' no fuso horário de Brasília, independente do
// fuso horário do servidor (Railway roda em UTC).
export function localDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Soma/subtrai dias de uma data 'YYYY-MM-DD', retornando 'YYYY-MM-DD'.
export function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
