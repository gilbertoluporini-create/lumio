/**
 * Regressão do PERÍODO LETIVO — a lógica mais perigosa da Agenda.
 *
 * É ela que decide até quando as aulas da grade horária se repetem. Quando erra
 * pra menos, o aluno abre o app e não vê UMA aula do semestre que está cursando,
 * com um banner dizendo "fora do período letivo" — e não existe UI pra desfazer.
 * Já aconteceu duas vezes por caminhos diferentes (regex do título, e depois o
 * PDF de um semestre só), então cada caso vira um assert aqui.
 *
 * Rode: npm run test:periodo   (node 24 faz type-stripping do .ts direto)
 */
import {
  getTermWindows,
  getNonTeachingDays,
  isWithinTerm,
} from "../src/lib/academic-calendar.ts";

let fails = 0;
// Só start/end importam: o tipo TermWindow pode ganhar campos (ex: coverageStart)
// sem que isso seja regressão.
function so(x) {
  if (Array.isArray(x)) return x.map(so);
  if (x && typeof x === "object" && "start" in x && "end" in x)
    return { start: x.start, end: x.end };
  return x;
}
function check(nome, real, esperado) {
  const ok = JSON.stringify(so(real)) === JSON.stringify(so(esperado));
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      real     ${JSON.stringify(real)}`);
}

const cal = (events, year = 2026) => ({ institution: "Mandic", year, events });
const ev = (date, title, category = "marco", extra = {}) => ({
  date, title, category, semester: null, endDate: null, ...extra,
});

// 1) Mandic real: os títulos que a regex ANTIGA casava. Não pode regredir.
check("mandic titulos originais", getTermWindows(cal([
  ev("2026-02-02", "Início do semestre letivo"),
  ev("2026-06-20", "Término do período letivo"),
  ev("2026-08-03", "Início do semestre letivo"),
  ev("2026-12-12", "Término do período letivo"),
])), [
  { start: "2026-02-02", end: "2026-06-20" },
  { start: "2026-08-03", end: "2026-12-12" },
]);

// 2) Mesma coisa com semester preenchido (o extrator emite quando consegue).
check("agrupado por semestre", getTermWindows(cal([
  ev("2026-02-02", "Início do 1º semestre letivo", "marco", { semester: 1 }),
  ev("2026-06-20", "Término do 1º período letivo", "marco", { semester: 1 }),
  ev("2026-08-03", "Início do 2º semestre letivo", "marco", { semester: 2 }),
  ev("2026-12-12", "Término do 2º período letivo", "marco", { semester: 2 }),
])), [
  { start: "2026-02-02", end: "2026-06-20" },
  { start: "2026-08-03", end: "2026-12-12" },
]);

// 3) termBoundary explícito manda mais que o título.
check("termBoundary explicito", getTermWindows(cal([
  ev("2026-02-02", "Aula inaugural", "marco", { termBoundary: "start" }),
  ev("2026-06-20", "Colação de grau", "marco", { termBoundary: "end" }),
])), [{ start: "2026-02-02", end: "2026-06-20" }]);

// 4) FAIL-OPEN: início sem término não pode virar zero janelas (antes: [] = sem
//    limite; agora: fecha em 31/12 — o que importa é NÃO apagar o semestre).
const semFim = getTermWindows(cal([ev("2026-08-03", "Início das aulas")]));
check("inicio sem termino fecha no fim do ano", semFim, [
  { start: "2026-08-03", end: "2026-12-31" },
]);
check("  -> aula de agosto continua visivel", isWithinTerm("2026-08-10", semFim), true);

// 5) Redação alternativa (outra faculdade) que a regex antiga NÃO pegava.
check("redacao alternativa", getTermWindows(cal([
  ev("2026-02-02", "INÍCIO DAS AULAS"),
  ev("2026-06-20", "Último dia de aulas"),
])), [{ start: "2026-02-02", end: "2026-06-20" }]);

// 6) "Fim do recesso" é retomada, não término: não pode fechar a janela em julho.
check("fim do recesso nao vira termino", getTermWindows(cal([
  ev("2026-02-02", "Início do semestre letivo"),
  ev("2026-07-01", "Fim do recesso de meio de ano"),
  ev("2026-06-20", "Término do período letivo"),
])), [{ start: "2026-02-02", end: "2026-06-20" }]);

// 6b) O bug que o loop achou na MINHA correção anterior: o veto de recesso era
//     cego e comia o início do semestre quando o título citava o recesso.
check("retomada que cita o recesso ainda e inicio", getTermWindows(cal([
  ev("2026-08-03", "Retorno das aulas após o recesso de julho"),
  ev("2026-12-12", "Término do período letivo"),
])), [{ start: "2026-08-03", end: "2026-12-12" }]);

check("termino que cita o recesso ainda e termino", getTermWindows(cal([
  ev("2026-02-02", "Início do semestre letivo"),
  ev("2026-06-20", "Término do semestre letivo e início do recesso"),
])), [{ start: "2026-02-02", end: "2026-06-20" }]);

// 6c) Mas o recesso puro continua VETADO (senão julho vira período letivo).
check("inicio do recesso continua vetado", getTermWindows(cal([
  ev("2026-02-02", "Início do semestre letivo"),
  ev("2026-06-20", "Término do período letivo"),
  ev("2026-07-01", "Início do recesso do meio de ano"),
])), [{ start: "2026-02-02", end: "2026-06-20" }]);

// 6d) coverageStart: PDF de UM semestre não pode apagar o semestre em curso.
const soSegundo = getTermWindows(cal([
  ev("2026-08-03", "Início do semestre letivo"),
  ev("2026-12-12", "Término do período letivo"),
]));
check("antes da cobertura do PDF nao restringe", isWithinTerm("2026-05-12", soSegundo), true);
check("dentro da janela do PDF vale", isWithinTerm("2026-09-10", soSegundo), true);
check("depois do fim do PDF restringe", isWithinTerm("2027-03-10", soSegundo), false);

// 7) Sem nenhum marco: sem restrição (aula aparece sempre).
check("sem marcos = sem janela", getTermWindows(cal([
  ev("2026-04-21", "Tiradentes", "feriado"),
])), []);
check("  -> sem janela nao restringe", isWithinTerm("2026-01-15", []), true);

// 8) Dias não letivos: intervalo expandido com data LOCAL (o bug do toISOString
//    deslocava o Set inteiro em fuso positivo).
const nt = getNonTeachingDays(cal([
  ev("2026-06-22", "Recesso", "recesso", { endDate: "2026-06-26" }),
  ev("2026-04-21", "Tiradentes", "feriado"),
]));
check("recesso expandido", [...nt].sort(), [
  "2026-04-21", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26",
]);

// 9) O caso do Giba: julho fora do período, agosto dentro.
const gibaTerms = getTermWindows(cal([
  ev("2026-02-02", "Início do semestre letivo"),
  ev("2026-06-20", "Término do período letivo"),
  ev("2026-08-03", "Início do semestre letivo"),
  ev("2026-12-12", "Término do período letivo"),
]));
check("julho fora do periodo", isWithinTerm("2026-07-15", gibaTerms), false);
check("agosto dentro do periodo", isWithinTerm("2026-08-10", gibaTerms), true);
check("borda inicio inclusiva", isWithinTerm("2026-08-03", gibaTerms), true);
check("borda termino inclusiva", isWithinTerm("2026-06-20", gibaTerms), true);

console.log(fails === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${fails} FALHA(S)`);
process.exit(fails === 0 ? 0 : 1);
