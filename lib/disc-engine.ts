export type Factor = 'D' | 'I' | 'S' | 'C';

export interface QuestionRow {
  id: string;
  factors: Record<Factor, string>;
}

export const discQuestions: QuestionRow[] = [
  { id: "q1", factors: { D: "Automotivado, Pioneiro, Independente", I: "Convincente, Magnético, Persuasivo", S: "Amigável, Acolhedor, Paciente", C: "Cauteloso, Exato, Focado" } },
  { id: "q2", factors: { D: "Afirmativo, Audacioso, Direto", I: "Animado, Extrovertido, Espontâneo", S: "Previsível, Calmo, Constante", C: "Analítico, Sistemático, Metódico" } },
  { id: "q3", factors: { D: "Competitivo, Obstinado, Firme", I: "Sociável, Entusiasmado, Expressivo", S: "Compreensivo, Leal, Ouvinte", C: "Rigoroso, Criterioso, Preciso" } },
  { id: "q4", factors: { D: "Aventureiro, Dominante, Desafiador", I: "Inspirador, Confiante, Caloroso", S: "Conciliador, Rotineiro, Estável", C: "Disciplinado, Lógico, Reservado" } },
  { id: "q5", factors: { D: "Focado no Resultado, Direto, Acelerado", I: "Criativo, Articulado, Otimista", S: "Protetor, Modesto, Cuidadoso", C: "Checador, Estruturado, Atento" } },
  { id: "q6", factors: { D: "Prático, Agressivo em Metas, Rápido", I: "Promotor, Sociável, Alegre", S: "Harmonioso, Cooperativo, Sensível", C: "Factual, Crítico, Perfeccionista" } },
  { id: "q7", factors: { D: "Tomador de Decisão, Enérgico, Corajoso", I: "Efusivo, Impulsivo, Encantador", S: "Prestativo, Agradável, Tolerante", C: "Investigador, Organizado, Cético" } },
  { id: "q8", factors: { D: "Líder, Confrontador, Assertivo", I: "Comunicativo, Divertido, Flexível", S: "Bom Parceiro, Empático, Pacífico", C: "Orientado a Dados, Maduro, Realista" } },
  { id: "q9", factors: { D: "Incisivo, Resoluto, Intenso", I: "Gosta de Palco, Persuasivo, Sonhador", S: "Mantém a Paz, Seguro, Rotineiro", C: "Sem Erros, Cuidadoso, Metódico" } },
  { id: "q10", factors: { D: "Impaciente, Empreendedor, Voraz", I: "Brilhante, Encantador, Influente", S: "Ponderado, Gentil, Bom Ombro", C: "Calculista, Planejador, Racional" } }
];

export function shuffleArray<T>(array: T[]): T[] {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export function calculateDiscResult(answers: Record<string, Record<Factor, number>>) {
  const scores: Record<Factor, number> = { D: 0, I: 0, S: 0, C: 0 };
  let totalPoints = 0;

  Object.values(answers).forEach((qAnswer) => {
    Object.entries(qAnswer).forEach(([factor, score]) => {
      scores[factor as Factor] += score;
      totalPoints += score;
    });
  });

  const percentages: Record<Factor, number> = {
    D: Math.round((scores.D / totalPoints) * 100) || 0,
    I: Math.round((scores.I / totalPoints) * 100) || 0,
    S: Math.round((scores.S / totalPoints) * 100) || 0,
    C: Math.round((scores.C / totalPoints) * 100) || 0,
  };

  const sortedFactors = Object.entries(percentages).sort((a, b) => b[1] - a[1]);

  const factorNames: Record<Factor, string> = {
    D: "Executor",
    I: "Comunicador",
    S: "Planejador",
    C: "Analista"
  };

  const primaryFactor = sortedFactors[0][0] as Factor;
  const secondaryFactor = sortedFactors[1][0] as Factor;

  const primaryProfile = factorNames[primaryFactor];
  const secondaryProfile = factorNames[secondaryFactor];

  const combinedKey = `${primaryFactor}${secondaryFactor}`;

  return {
    rawScores: scores,
    percentages,
    primaryProfile,
    secondaryProfile,
    combinedString: `${primaryProfile}-${secondaryProfile}`,
    relationships: getRelationships(primaryProfile),
    reportCopy: getReportCopy(combinedKey)
  };
}

function getRelationships(primary: string) {
  const rels: Record<string, { brothers: string[], cousin: string }> = {
    "Executor": { brothers: ["Comunicador", "Analista"], cousin: "Planejador" },
    "Comunicador": { brothers: ["Executor", "Planejador"], cousin: "Analista" },
    "Planejador": { brothers: ["Comunicador", "Analista"], cousin: "Executor" },
    "Analista": { brothers: ["Executor", "Planejador"], cousin: "Comunicador" }
  };
  return rels[primary] || { brothers: [], cousin: "" };
}

function getReportCopy(combinedKey: string): string {
  const resultadosDISC: Record<string, string> = {
    "DI": "Você engata a marcha e puxa o time junto. Seu foco é o resultado rápido com brutalidade controlada, sem perder a capacidade de convencer e trazer as pessoas para o seu lado. Fazer barulho qualquer um faz, mas você entrega a direção e a atitude que impõem presença.",
    "DC": "Brutalidade com critério. Anda rápido, mas não anda cego. Suas rotas são agressivas, no entanto respaldadas por dados e estrutura sólida. Acelera com o pé embaixo sabendo exatamente onde a tração é máxima.",
    "DS": "Entrega com consistência absurda. Impõe uma pressão controlada e ritmo forte que não oscila. Bate a meta sem queimar o motor, mantendo a operação robusta e a equipe no lugar exato do trilho.",

    "ID": "Abre caminho na voz e atropela na execução. Você vende o sonho, recruta quem precisa e trabalha dobrado para carregar o troféu para casa. Seu motor principal é a resenha, mas a entrega é feita com força bruta.",
    "IS": "Liderança que acolhe e organiza, sem deixar ninguém para trás. Você mantém o ambiente energizado e a equipe alinhada, ajustando a carburação de todos para rodarem suaves e no mesmo compasso.",
    "IC": "Comunica com precisão invejável. O carisma nato abre as portas, mas o argumento técnico bem embasado é o que assina o contrato. Você sabe contar a história exata que o dado confirma.",

    "SD": "Tranquilidade blindada para planejar, agressividade exata na hora de dar o bote. Ritmo constante que não decepciona; uma milona que arrasta peso sem fazer alarde. Sabe o que precisa ser feito e faz sempre.",
    "SI": "A cola de alto torque que mantém tudo rodando redondo. Escuta ativamente, ajeita o processo e garante que o ambiente seja perfeito para operar no limite. Sustenta a potência sem reclamar.",
    "SC": "Padrão não se improvisa. Você mapeia cada detalhe antes da solda. Sua constância garante que o processo saia perfeito do início ao fim, mantendo o nível de exigência alto e a entrega cravada sem dor de cabeça.",

    "CD": "Exigência de altíssimo nível. Analisa o contexto e corta o mal pela raiz. O alvo é a perfeição estrutural e o resultado final da peça não se negocia. Qualidade acima da emoção.",
    "CI": "Um detalhe técnico explicado para quem vive. Traz a lógica fria para o jogo, garantindo que a base é perfeitamente sólida antes de contar qualquer história.",
    "CS": "Regra clara, método cravado. Sem sobressaltos e com zero margem para erro amador. Onde você passa, aplica engenharia de precisão e bota ordem em toda a casa."
  };

  return resultadosDISC[combinedKey] || "Sua entrega é uma combinação própria de força e controle. Puxa os dados, acelera a execução e crava a marca que quer deixar em cada projeto, sempre no seu ritmo.";
}
