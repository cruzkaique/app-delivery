const STORAGE_KEY = "delivery-kaique-entries-v1";
const GAS_KEY = "delivery-kaique-gas-price-v1";
const COST_KEY = "delivery-kaique-operational-cost-km-v1";
const DEFAULT_PLATFORM = "Geral";

const CONFIG = {
  consumptionKmPerLiter: 25,
  operationalCostPerKm: 0.45,
  monthlyGoal: 2500,
};

const state = {
  entries: [],
  view: "daily",
};

const form = document.querySelector("#entryForm");
const fields = {
  date: document.querySelector("#date"),
  platform: document.querySelector("#platform"),
  km: document.querySelector("#km"),
  hours: document.querySelector("#hours"),
  revenue: document.querySelector("#revenue"),
  gasPrice: document.querySelector("#gasPrice"),
  fuelLiters: document.querySelector("#fuelLiters"),
  operationalCostPerKm: document.querySelector("#operationalCostPerKm"),
};
const report = document.querySelector("#report");
const emptyState = document.querySelector("#emptyState");
const historyBody = document.querySelector("#historyBody");

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const number = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function parseMoney(value) {
  return Number(String(value).replace(",", ".")) || 0;
}

function loadEntries() {
  try {
    state.entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    state.entries = [];
  }
  state.entries = state.entries.map(normalizeEntry);
  sortEntries();
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function normalizeEntry(entry) {
  const platform = cleanPlatform(entry.platform);
  return {
    ...entry,
    platform,
    id: entry.id || entryKey(entry.date, platform),
  };
}

function cleanPlatform(platform) {
  const value = String(platform || "").trim();
  return value || DEFAULT_PLATFORM;
}

function entryKey(date, platform) {
  return `${date}__${cleanPlatform(platform).toLowerCase()}`;
}

function sortEntries() {
  state.entries.sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform));
}

function calculate(entry) {
  const hasActualFuel = entry.fuelLiters > 0;
  const consumptionKmPerLiter = hasActualFuel
    ? safeDivide(entry.km, entry.fuelLiters)
    : entry.consumptionKmPerLiter || CONFIG.consumptionKmPerLiter;
  const operationalCostPerKm = entry.operationalCostPerKm || CONFIG.operationalCostPerKm;
  const liters = hasActualFuel ? entry.fuelLiters : safeDivide(entry.km, consumptionKmPerLiter);
  const gasCost = liters * entry.gasPrice;
  const profitAfterGas = entry.revenue - gasCost;
  const operationalCost = entry.km * operationalCostPerKm;
  const netProfit = entry.revenue - operationalCost;
  const grossPerHour = safeDivide(entry.revenue, entry.hours);
  const netPerHour = safeDivide(netProfit, entry.hours);
  const grossPerKm = safeDivide(entry.revenue, entry.km);
  const gasCostPerKm = safeDivide(gasCost, entry.km);
  const operationalCostShare = safeDivide(operationalCost, entry.revenue) * 100;

  return {
    ...entry,
    fuelLiters: hasActualFuel ? entry.fuelLiters : 0,
    consumptionSource: hasActualFuel ? "Calculado" : "Estimado",
    consumptionKmPerLiter,
    operationalCostPerKm,
    liters,
    gasCost,
    profitAfterGas,
    operationalCost,
    netProfit,
    grossPerHour,
    netPerHour,
    grossPerKm,
    gasCostPerKm,
    operationalCostShare,
    efficiency: classifyEfficiency(grossPerKm),
  };
}

function safeDivide(value, divisor) {
  return divisor > 0 ? value / divisor : 0;
}

function classifyEfficiency(grossPerKm) {
  if (grossPerKm < 1) {
    return { label: "Muito ruim", className: "critical" };
  }
  if (grossPerKm <= 1.3) {
    return { label: "Ruim", className: "bad" };
  }
  if (grossPerKm <= 1.7) {
    return { label: "Aceitável", className: "ok" };
  }
  return { label: "Boa", className: "good" };
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR");
}

function render() {
  const calculated = state.entries.map(calculate);
  renderHistory(calculated);
  emptyState.classList.toggle("hidden", calculated.length > 0);
  report.classList.toggle("hidden", calculated.length === 0);

  if (!calculated.length) {
    report.innerHTML = "";
    return;
  }

  const latestDate = calculated[calculated.length - 1].date;
  if (state.view === "daily") {
    renderDaily(latestDate, calculated);
  }
  if (state.view === "weekly") {
    renderWeekly(calculated);
  }
  if (state.view === "monthly") {
    renderMonthly(calculated);
  }
}

function renderDaily(date, allDays) {
  const dayEntries = allDays.filter((entry) => entry.date === date);
  const day = { ...summarize(dayEntries), date };
  const monthDays = allDays.filter((entry) => sameMonth(entry.date, date));
  const monthNet = sum(monthDays, "netProfit");
  const monthProjection = projectMonth(monthDays, date);
  const remaining = Math.max(CONFIG.monthlyGoal - monthNet, 0);
  const remainingDays = daysLeftInMonth(date);
  const neededDaily = remainingDays > 0 ? remaining / remainingDays : remaining;
  const diagnosis = buildDailyDiagnosis(day);

  report.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Relatório diário</p>
        <h2>${formatDate(date)} · ${dayEntries.length} plataforma(s)</h2>
      </div>
      <span class="status ${day.efficiency.className}">${day.efficiency.label}</span>
    </div>
    ${metricGrid([
      ["Litros consumidos", `${number.format(day.liters)} L`],
      ["Gasto com gasolina", currency.format(day.gasCost)],
      ["Lucro após gasolina", currency.format(day.profitAfterGas)],
      ["Custo operacional", currency.format(day.operationalCost)],
      ["Custo operacional/km", currency.format(day.operationalCostPerKm)],
      ["Consumo medio", `${number.format(day.consumptionKmPerLiter)} km/L`],
      ["Tipo de consumo", day.consumptionSource],
      ["Gasolina por km", currency.format(day.gasCostPerKm)],
      ["Custo sobre bruto", `${number.format(day.operationalCostShare)}%`],
      ["Lucro líquido estimado", currency.format(day.netProfit)],
      ["Ganho bruto/hora", currency.format(day.grossPerHour)],
      ["Ganho líquido/hora", currency.format(day.netPerHour)],
      ["Valor bruto/km", currency.format(day.grossPerKm)],
    ])}
    <div class="analysis-box ${diagnosis.severity}">
      <h3>Análise operacional</h3>
      <ul>${diagnosis.items.map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
    ${renderPlatformComparison(dayEntries)}
    <div class="fuel-box">
      <strong>Reposição de combustível</strong>
      <p>Hoje você consumiu ${number.format(day.liters)} litros. Amanhã você deve repor pelo menos ${number.format(day.liters)} litros para manter o fluxo operacional.</p>
    </div>
    <h3>Comparação com a meta</h3>
    <ul class="report-list">
      <li>Lucro líquido acumulado no mês: <strong>${currency.format(monthNet)}</strong>.</li>
      <li>Faltam <strong>${currency.format(remaining)}</strong> para atingir R$ 2.500 líquidos.</li>
      <li>Média diária necessária daqui para frente: <strong>${currency.format(neededDaily)}</strong>.</li>
      <li>Projeção mensal pelo desempenho atual: <strong>${currency.format(monthProjection)}</strong>.</li>
    </ul>
  `;
}

function buildDailyDiagnosis(day) {
  const items = [];
  let severity = "good";

  if (day.netProfit <= 0) {
    severity = "critical";
    items.push("Sinal de prejuízo operacional: depois do custo real da moto, o dia não pagou a operação.");
  } else if (day.netPerHour < 12) {
    severity = "bad";
    items.push("O ganho líquido por hora está baixo. O tempo trabalhado não está convertendo bem em lucro.");
  } else {
    items.push("Houve lucro operacional, mas ele precisa ser comparado com km rodado e tempo para saber se valeu a pena.");
  }

  if (day.grossPerKm < 1) {
    severity = "critical";
    items.push("Você rodou demais para pouco faturamento. Esse perfil de corrida destrói margem.");
  } else if (day.grossPerKm <= 1.3) {
    severity = severity === "critical" ? severity : "bad";
    items.push("Eficiência por km ruim. Priorize corridas curtas, regiões densas e evite retorno vazio.");
  } else if (day.grossPerKm <= 1.7) {
    items.push("Eficiência aceitável, mas ainda sensível a combustível, manutenção e tempo parado.");
  } else {
    items.push("Boa eficiência por km. Provavelmente houve melhor densidade de entregas ou corridas mais bem pagas.");
  }

  if (day.grossPerHour < 20) {
    severity = severity === "critical" ? severity : "bad";
    items.push("Faturamento bruto por hora fraco. Pode indicar horário ruim, baixa demanda ou muito tempo ocioso.");
  }

  if (day.consumptionKmPerLiter < CONFIG.consumptionKmPerLiter) {
    severity = severity === "critical" ? severity : "bad";
    items.push(`Consumo medio ${day.consumptionSource.toLowerCase()} pior que a base de ${number.format(CONFIG.consumptionKmPerLiter)} km/L. Revise calibragem, excesso de peso, marcha e rotas com muito anda-e-para.`);
  } else {
    items.push(`Consumo medio ${day.consumptionSource.toLowerCase()} em ${number.format(day.consumptionKmPerLiter)} km/L. Esse valor foi usado para calcular gasolina e reposicao do dia.`);
  }

  if (day.operationalCostPerKm > CONFIG.operationalCostPerKm) {
    severity = severity === "critical" ? severity : "bad";
    items.push(`Custo operacional por km acima da base de ${currency.format(CONFIG.operationalCostPerKm)}. A margem real esta mais apertada neste dia.`);
  } else {
    items.push(`Custo operacional por km controlado em ${currency.format(day.operationalCostPerKm)}.`);
  }

  if (day.operationalCostShare > 45) {
    severity = severity === "critical" ? severity : "bad";
    items.push("O custo operacional consumiu uma fatia alta do bruto. A operacao precisa de corridas com melhor pagamento por km.");
  }

  if (day.km > 60 && day.revenue < 90) {
    severity = severity === "critical" ? severity : "bad";
    items.push("Excesso de km para pouco faturamento. Reavalie bairros, aceite menos deslocamentos longos e reduza áreas com retorno vazio.");
  }

  if (day.hours >= 4 && day.revenue / day.hours < 25) {
    items.push("Para o próximo turno, concentre mais tempo em pico de almoço/jantar e corte períodos com baixa chamada.");
  }

  if (items.length < 5) {
    items.push("Meta prática: aumentar R$/km antes de aumentar horas. Mais horas com rota ruim só aumenta desgaste.");
  }

  return { items, severity };
}

function renderWeekly(entries) {
  const latest = entries[entries.length - 1];
  const week = entries.filter((entry) => sameWeek(entry.date, latest.date));
  const summary = summarize(week);
  const dailySummaries = groupByDate(week);
  const best = bestDay(dailySummaries);
  const worst = worstDay(dailySummaries);

  report.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Relatório semanal</p>
        <h2>Semana de ${formatDate(week[0].date)} a ${formatDate(week[week.length - 1].date)}</h2>
      </div>
      <span class="status ${classifyEfficiency(summary.grossPerKm).className}">${classifyEfficiency(summary.grossPerKm).label}</span>
    </div>
    ${metricGrid([
      ["Total faturado", currency.format(summary.revenue)],
      ["Total rodado", `${number.format(summary.km)} km`],
      ["Custo operacional", currency.format(summary.operationalCost)],
      ["Consumo medio", `${number.format(summary.averageConsumption)} km/L`],
      ["Gasolina total", currency.format(summary.gasCost)],
      ["Custo medio/km", currency.format(summary.operationalCostPerKm)],
      ["Lucro estimado", currency.format(summary.netProfit)],
      ["Média por hora", currency.format(summary.netPerHour)],
      ["Média por km", currency.format(summary.grossPerKm)],
      ["Melhor dia", `${formatDate(best.date)} · ${currency.format(best.netProfit)}`],
      ["Pior dia", `${formatDate(worst.date)} · ${currency.format(worst.netProfit)}`],
    ])}
    <div class="analysis-box ${summary.netProfit <= 0 ? "critical" : summary.grossPerKm <= 1.3 ? "bad" : ""}">
      <h3>Padrões identificados</h3>
      <ul>${buildPeriodPatterns(summary, week).map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
    ${renderPlatformComparison(week)}
  `;
}

function renderMonthly(entries) {
  const latest = entries[entries.length - 1];
  const month = entries.filter((entry) => sameMonth(entry.date, latest.date));
  const summary = summarize(month);
  const projection = projectMonth(month, latest.date);
  const remaining = Math.max(CONFIG.monthlyGoal - summary.netProfit, 0);
  const dailyAverage = summary.netProfit / month.length;
  const efficiency = classifyEfficiency(summary.grossPerKm);

  report.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Relatório mensal</p>
        <h2>${monthName(latest.date)}</h2>
      </div>
      <span class="status ${efficiency.className}">${efficiency.label}</span>
    </div>
    ${metricGrid([
      ["Faturamento total", currency.format(summary.revenue)],
      ["Lucro operacional", currency.format(summary.netProfit)],
      ["Custo operacional total", currency.format(summary.operationalCost)],
      ["Consumo medio", `${number.format(summary.averageConsumption)} km/L`],
      ["Gasolina total", currency.format(summary.gasCost)],
      ["Custo medio/km", currency.format(summary.operationalCostPerKm)],
      ["Horas trabalhadas", `${number.format(summary.hours)} h`],
      ["Média diária líquida", currency.format(dailyAverage)],
      ["Projeção futura", currency.format(projection)],
      ["Eficiência média", currency.format(summary.grossPerKm)],
      ["Falta para meta", currency.format(remaining)],
    ])}
    <div class="analysis-box ${summary.netProfit <= 0 ? "critical" : projection < CONFIG.monthlyGoal ? "bad" : ""}">
      <h3>Evolução e meta</h3>
      <ul>
        <li>${projection >= CONFIG.monthlyGoal ? "A projeção atual bate a meta mensal, desde que a eficiência seja mantida." : "A projeção atual não bate a meta de R$ 2.500. É preciso aumentar lucro diário ou reduzir km improdutivo."}</li>
        <li>Para fechar a meta, faltam ${currency.format(remaining)} de lucro líquido operacional.</li>
        <li>${summary.grossPerKm <= 1.3 ? "A eficiência média está puxando o mês para baixo. O foco deve ser R$/km, não só faturamento bruto." : "A eficiência média está em nível operacionalmente aproveitável."}</li>
        <li>Consumo medio acumulado: ${number.format(summary.averageConsumption)} km/L. Custo operacional medio: ${currency.format(summary.operationalCostPerKm)} por km.</li>
        <li>Prioridade: horários de pico, corridas curtas, regiões com alta densidade e menor retorno vazio.</li>
      </ul>
    </div>
    ${renderPlatformComparison(month)}
  `;
}

function metricGrid(items) {
  return `<div class="metric-grid">${items
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("")}</div>`;
}

function renderPlatformComparison(entries) {
  const ranking = groupByPlatform(entries);
  if (ranking.length <= 1) {
    return `
      <div class="platform-box">
        <h3>Comparativo por plataforma</h3>
        <p>Com apenas uma plataforma no período, ainda não há comparação real. Continue lançando separado para medir rentabilidade.</p>
      </div>
    `;
  }

  const bestNet = ranking[0];
  const bestKm = ranking.slice().sort((a, b) => b.grossPerKm - a.grossPerKm)[0];
  const bestHour = ranking.slice().sort((a, b) => b.netPerHour - a.netPerHour)[0];

  return `
    <div class="platform-box">
      <h3>Comparativo por plataforma</h3>
      <div class="platform-summary">
        <span>Maior lucro: <strong>${bestNet.platform}</strong></span>
        <span>Melhor R$/km: <strong>${bestKm.platform}</strong></span>
        <span>Melhor R$/hora: <strong>${bestHour.platform}</strong></span>
      </div>
      <div class="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Plataforma</th>
              <th>Bruto</th>
              <th>Líquido</th>
              <th>Horas</th>
              <th>KM</th>
              <th>R$/km</th>
              <th>R$/h líq.</th>
              <th>Eficiência</th>
            </tr>
          </thead>
          <tbody>
            ${ranking
              .map(
                (item) => `
                  <tr>
                    <td>${item.platform}</td>
                    <td>${currency.format(item.revenue)}</td>
                    <td>${currency.format(item.netProfit)}</td>
                    <td>${number.format(item.hours)}</td>
                    <td>${number.format(item.km)}</td>
                    <td>${currency.format(item.grossPerKm)}</td>
                    <td>${currency.format(item.netPerHour)}</td>
                    <td><span class="status ${item.efficiency.className}">${item.efficiency.label}</span></td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderHistory(entries) {
  historyBody.innerHTML = entries
    .slice()
    .reverse()
    .map(
      (entry) => `
        <tr>
          <td>${formatDate(entry.date)}</td>
          <td>${entry.platform}</td>
          <td>${number.format(entry.km)}</td>
          <td>${number.format(entry.hours)}</td>
          <td>${currency.format(entry.revenue)}</td>
          <td>${currency.format(entry.netProfit)}</td>
          <td>${currency.format(entry.grossPerKm)}</td>
          <td>${number.format(entry.consumptionKmPerLiter)}</td>
          <td>${currency.format(entry.operationalCostPerKm)}</td>
          <td><button class="row-delete" type="button" data-id="${entry.id}">Excluir</button></td>
        </tr>
      `,
    )
    .join("");
}

function summarize(entries) {
  const revenue = sum(entries, "revenue");
  const km = sum(entries, "km");
  const hours = sum(entries, "hours");
  const liters = sum(entries, "liters");
  const gasCost = sum(entries, "gasCost");
  const profitAfterGas = revenue - gasCost;
  const operationalCost = sum(entries, "operationalCost");
  const netProfit = sum(entries, "netProfit");
  const grossPerKm = safeDivide(revenue, km);
  const operationalCostPerKm = safeDivide(operationalCost, km);

  return {
    revenue,
    km,
    hours,
    liters,
    gasCost,
    profitAfterGas,
    operationalCost,
    netProfit,
    grossPerKm,
    grossPerHour: safeDivide(revenue, hours),
    netPerHour: safeDivide(netProfit, hours),
    averageConsumption: safeDivide(km, liters),
    consumptionKmPerLiter: safeDivide(km, liters),
    operationalCostPerKm,
    gasCostPerKm: safeDivide(gasCost, km),
    operationalCostShare: safeDivide(operationalCost, revenue) * 100,
    efficiency: classifyEfficiency(grossPerKm),
  };
}

function buildPeriodPatterns(summary, entries) {
  const patterns = [];
  const badDays = entries.filter((entry) => entry.grossPerKm <= 1.3).length;
  const lowHourDays = entries.filter((entry) => entry.netPerHour < 12).length;

  if (summary.netProfit <= 0) {
    patterns.push("A semana indica prejuízo operacional. O faturamento não está cobrindo o custo real da moto.");
  } else {
    patterns.push(`A semana fechou com ${currency.format(summary.netProfit)} de lucro operacional estimado.`);
  }

  if (badDays > 0) {
    patterns.push(`${badDays} dia(s) tiveram eficiência ruim ou muito ruim por km. Esses dias precisam ser corrigidos primeiro.`);
  }

  if (lowHourDays > 0) {
    patterns.push(`${lowHourDays} dia(s) tiveram ganho líquido por hora baixo. Isso sugere tempo ocioso ou horário de baixa demanda.`);
  }

  if (summary.averageConsumption < CONFIG.consumptionKmPerLiter) {
    patterns.push(`Consumo medio do periodo abaixo da base: ${number.format(summary.averageConsumption)} km/L. Isso aumenta reposicao de gasolina e reduz sobra real.`);
  } else {
    patterns.push(`Consumo medio do periodo em ${number.format(summary.averageConsumption)} km/L, dentro ou acima da base operacional.`);
  }

  if (summary.operationalCostPerKm > CONFIG.operationalCostPerKm) {
    patterns.push(`Custo medio por km em ${currency.format(summary.operationalCostPerKm)}, acima da base. O mes precisa de melhor R$/km para compensar.`);
  }

  if (summary.grossPerKm <= 1.3) {
    patterns.push("O padrão geral é rodar demais para faturar pouco. Evite deslocamentos longos e regiões com baixa chance de próxima entrega.");
  } else {
    patterns.push("O padrão geral permite lucro, mas ainda depende de manter boa densidade de entregas.");
  }

  patterns.push("Ação recomendada: concentrar turnos no pico, filtrar corridas longas e medir quais bairros derrubam o R$/km.");
  return patterns;
}

function sum(entries, key) {
  return entries.reduce((total, entry) => total + entry[key], 0);
}

function groupByPlatform(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    if (!groups.has(entry.platform)) {
      groups.set(entry.platform, []);
    }
    groups.get(entry.platform).push(entry);
  });

  return Array.from(groups, ([platform, platformEntries]) => ({
    ...summarize(platformEntries),
    platform,
  })).sort((a, b) => b.netProfit - a.netProfit);
}

function groupByDate(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    if (!groups.has(entry.date)) {
      groups.set(entry.date, []);
    }
    groups.get(entry.date).push(entry);
  });

  return Array.from(groups, ([date, dateEntries]) => ({
    ...summarize(dateEntries),
    date,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function bestDay(entries) {
  return entries.reduce((best, entry) => (entry.netProfit > best.netProfit ? entry : best), entries[0]);
}

function worstDay(entries) {
  return entries.reduce((worst, entry) => (entry.netProfit < worst.netProfit ? entry : worst), entries[0]);
}

function sameMonth(left, right) {
  return left.slice(0, 7) === right.slice(0, 7);
}

function sameWeek(left, right) {
  const leftDate = new Date(`${left}T12:00:00`);
  const rightDate = new Date(`${right}T12:00:00`);
  return startOfWeek(leftDate).getTime() === startOfWeek(rightDate).getTime();
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysLeftInMonth(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - date.getDate() + 1, 1);
}

function projectMonth(entries, isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const workedDays = Math.max(entries.length, 1);
  return (sum(entries, "netProfit") / workedDays) * daysInMonth;
}

function monthName(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const entry = {
    date: fields.date.value,
    platform: cleanPlatform(fields.platform.value),
    km: parseMoney(fields.km.value),
    hours: parseMoney(fields.hours.value),
    revenue: parseMoney(fields.revenue.value),
    gasPrice: parseMoney(fields.gasPrice.value),
    fuelLiters: parseMoney(fields.fuelLiters.value),
    operationalCostPerKm: parseMoney(fields.operationalCostPerKm.value),
  };
  entry.id = entryKey(entry.date, entry.platform);

  const existingIndex = state.entries.findIndex((item) => normalizeEntry(item).id === entry.id);
  if (existingIndex >= 0) {
    state.entries[existingIndex] = entry;
  } else {
    state.entries.push(entry);
  }

  sortEntries();
  localStorage.setItem(GAS_KEY, String(entry.gasPrice));
  localStorage.setItem(COST_KEY, String(entry.operationalCostPerKm));
  saveEntries();
  render();
  form.reset();
  fields.date.value = todayIso();
  fields.platform.value = "";
  fields.gasPrice.value = localStorage.getItem(GAS_KEY) || "";
  fields.fuelLiters.value = "";
  fields.operationalCostPerKm.value = localStorage.getItem(COST_KEY) || String(CONFIG.operationalCostPerKm);
});

document.querySelector("#todayButton").addEventListener("click", () => {
  fields.date.value = todayIso();
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

historyBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) {
    return;
  }
  state.entries = state.entries.filter((entry) => normalizeEntry(entry).id !== button.dataset.id);
  saveEntries();
  render();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  if (!state.entries.length || !confirm("Apagar todo o histórico salvo?")) {
    return;
  }
  state.entries = [];
  saveEntries();
  render();
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const payload = JSON.stringify(state.entries, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `delivery-kaique-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

fields.date.value = todayIso();
fields.gasPrice.value = localStorage.getItem(GAS_KEY) || "";
fields.fuelLiters.value = "";
fields.operationalCostPerKm.value = localStorage.getItem(COST_KEY) || String(CONFIG.operationalCostPerKm);
loadEntries();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}
