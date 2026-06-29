'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Download, Search, TrendingUp, UserRound } from 'lucide-react';
import Image from 'next/image';
import jsPDF from 'jspdf';
import { Factor, calculateDiscResult, discQuestions, shuffleArray } from '@/lib/disc-engine';
import type { DiscTestRecord, LeadData } from '@/lib/disc-types';
import { formatDateTime, normalizeName, onlyDigits, phoneMask } from '@/lib/normalization';
import { cn } from '@/lib/utils';

type AppState = 'splash' | 'onboarding' | 'history' | 'test' | 'completed';

type ComparableTest = Pick<DiscTestRecord, 'id' | 'timestamp' | 'leadData' | 'phoneDigits' | 'percentages' | 'primaryProfile' | 'secondaryProfile'>;

const emptyUser: LeadData = { nomeCompleto: '', telefone: '' };
const factorLabels: Record<Factor, string> = {
  D: 'Executor',
  I: 'Comunicador',
  S: 'Planejador',
  C: 'Analista',
};
const factorDescriptions: Record<Factor, string> = {
  D: 'Decisão, ação direta, velocidade e foco em resultado.',
  I: 'Comunicação, influência, entusiasmo e conexão com pessoas.',
  S: 'Estabilidade, constância, cooperação e ritmo previsível.',
  C: 'Critério, precisão, método e atenção aos detalhes.',
};
const factorColors: Record<Factor, string> = {
  D: '#BC0F24',
  I: '#737373',
  S: '#383838',
  C: '#A3A3A3',
};
const quadrantColors: Record<Factor, string> = {
  D: '#BC0F24',
  I: '#C89B18',
  S: '#0E8F4A',
  C: '#2A37B8',
};

function nameInputValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .toUpperCase();
}

function sortOldest(tests: ComparableTest[]) {
  return [...tests].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function buildFactorDelta(previousTest: ComparableTest, result: ReturnType<typeof calculateDiscResult>) {
  return {
    D: result.percentages.D - previousTest.percentages.D,
    I: result.percentages.I - previousTest.percentages.I,
    S: result.percentages.S - previousTest.percentages.S,
    C: result.percentages.C - previousTest.percentages.C,
  };
}

function deltaText(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '=';
}

function deltaSentence(value: number) {
  if (value > 0) return `subiu ${value} pontos percentuais`;
  if (value < 0) return `caiu ${Math.abs(value)} pontos percentuais`;
  return 'permaneceu estável';
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function donutSegmentPath(cx: number, cy: number, outerRadius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function safePdfName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_');
}

function addWrappedText(pdf: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 6) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function ensurePdfSpace(pdf: jsPDF, y: number, needed = 20) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - 14) return y;
  pdf.addPage();
  paintPdfBackground(pdf);
  return 18;
}

function paintPdfBackground(pdf: jsPDF) {
  pdf.setFillColor(11, 11, 11);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), 'F');
}

function buildComparisonStats(comparisonTests: ComparableTest[]) {
  const orderedTests = sortOldest(comparisonTests);
  if (orderedTests.length < 2) return null;
  const first = orderedTests[0];
  const previous = orderedTests[orderedTests.length - 2];
  const current = orderedTests[orderedTests.length - 1];
  const totalDelta = buildFactorDelta(first, { percentages: current.percentages } as ReturnType<typeof calculateDiscResult>);
  const lastDelta = buildFactorDelta(previous, { percentages: current.percentages } as ReturnType<typeof calculateDiscResult>);
  const biggestShift = (Object.keys(totalDelta) as Factor[]).sort((a, b) => Math.abs(totalDelta[b]) - Math.abs(totalDelta[a]))[0];
  const profileChanges = orderedTests.reduce((acc, test, index) => {
    if (index === 0) return acc;
    return orderedTests[index - 1].primaryProfile !== test.primaryProfile ? acc + 1 : acc;
  }, 0);

  return { orderedTests, first, previous, current, totalDelta, lastDelta, biggestShift, profileChanges };
}

function buildResultFromRecord(test: ComparableTest): ReturnType<typeof calculateDiscResult> {
  const orderedFactors = (['D', 'I', 'S', 'C'] as Factor[]).sort((a, b) => test.percentages[b] - test.percentages[a]);
  const primaryFactor = orderedFactors[0];
  const secondaryFactor = orderedFactors[1];

  return {
    rawScores: { D: 0, I: 0, S: 0, C: 0 },
    percentages: test.percentages,
    primaryProfile: test.primaryProfile,
    secondaryProfile: test.secondaryProfile,
    combinedString: `${test.primaryProfile}-${test.secondaryProfile}`,
    relationships: { brothers: [], cousin: '' },
    reportCopy: `Resultado recuperado do histórico. Neste teste, o eixo predominante foi ${test.primaryProfile}, com ${test.percentages[primaryFactor]}%, acompanhado por ${test.secondaryProfile}, com ${test.percentages[secondaryFactor]}%. Use o comparativo abaixo para entender a evolução desse perfil ao longo do tempo.`,
  };
}

function generateAnalysisPDF({
  mode,
  filename,
  normalizedDisplayName,
  result,
  comparisonTests,
  reportDate,
}: {
  mode: 'full' | 'comparison';
  filename: string;
  normalizedDisplayName: string;
  result: ReturnType<typeof calculateDiscResult>;
  comparisonTests: ComparableTest[];
  reportDate?: string;
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const stats = buildComparisonStats(comparisonTests);
  let y = 18;

  paintPdfBackground(pdf);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(mode === 'full' ? 'RELATÓRIO DISC' : 'COMPARATIVO HISTÓRICO DISC', margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(170, 170, 170);
  pdf.text(`${normalizedDisplayName} | ${formatDateTime(reportDate || new Date().toISOString())}`, margin, y);
  y += 12;

  if (mode === 'full') {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(188, 15, 36);
    pdf.text('Resultado atual', margin, y);
    y += 8;
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.text(result.combinedString.replace('-', ' / '), margin, y);
    y += 10;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(235, 235, 235);
    y = addWrappedText(pdf, `"${result.reportCopy}"`, margin, y, contentWidth, 6) + 6;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(255, 255, 255);
    (['D', 'I', 'S', 'C'] as Factor[]).forEach((factor, index) => {
      const x = margin + index * (contentWidth / 4);
      pdf.text(`${factor} - ${factorLabels[factor]}`, x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${result.percentages[factor]}%`, x, y + 6);
      pdf.setFont('helvetica', 'bold');
    });
    y += 20;
  }

  if (stats) {
    y = ensurePdfSpace(pdf, y, 45);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(188, 15, 36);
    pdf.text('Comparativo histórico', margin, y);
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(220, 220, 220);
    y = addWrappedText(
      pdf,
      `${stats.orderedTests.length} testes analisados entre ${formatDateTime(stats.first.timestamp)} e ${formatDateTime(stats.current.timestamp)}. Perfil inicial: ${stats.first.primaryProfile} / ${stats.first.secondaryProfile}. Perfil atual: ${stats.current.primaryProfile} / ${stats.current.secondaryProfile}. Trocas de perfil primário: ${stats.profileChanges}.`,
      margin,
      y,
      contentWidth,
      5,
    ) + 6;

    y = addWrappedText(
      pdf,
      `Leitura da evolução: desde o primeiro teste, o eixo com maior movimentação foi ${factorLabels[stats.biggestShift]}; ele ${deltaSentence(stats.totalDelta[stats.biggestShift])}. No comparativo mais recente, o perfil saiu de ${stats.previous.primaryProfile} para ${stats.current.primaryProfile}.`,
      margin,
      y,
      contentWidth,
      5,
    ) + 8;

    (['D', 'I', 'S', 'C'] as Factor[]).forEach((factor) => {
      y = ensurePdfSpace(pdf, y, 14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      pdf.text(`${factorLabels[factor]} (${factor})`, margin, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(190, 190, 190);
      pdf.text(
        `Primeiro: ${stats.first.percentages[factor]}% | Atual: ${stats.current.percentages[factor]}% | Desde o primeiro: ${deltaSentence(stats.totalDelta[factor])} | Último teste: ${deltaSentence(stats.lastDelta[factor])}.`,
        margin,
        y + 6,
      );
      y += 13;
    });

    y += 3;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(188, 15, 36);
    pdf.text('Linha do tempo', margin, y);
    y += 8;
    pdf.setFontSize(9);
    stats.orderedTests.forEach((test, index) => {
      y = ensurePdfSpace(pdf, y, 12);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${index + 1}. ${formatDateTime(test.timestamp)}`, margin, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(205, 205, 205);
      pdf.text(`${test.primaryProfile} / ${test.secondaryProfile}`, margin + 48, y);
      pdf.text(`D ${test.percentages.D}%  I ${test.percentages.I}%  S ${test.percentages.S}%  C ${test.percentages.C}%`, margin + 118, y);
      y += 8;
    });
  } else if (mode === 'comparison') {
    pdf.setTextColor(220, 220, 220);
    pdf.setFontSize(11);
    pdf.text('Ainda não há testes suficientes para gerar comparativo histórico.', margin, y);
  }

  pdf.save(filename);
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('splash');
  const [userData, setUserData] = useState<LeadData>(emptyUser);
  const [answers, setAnswers] = useState<Record<string, Record<Factor, number | null>>>({});
  const [previousTests, setPreviousTests] = useState<ComparableTest[]>([]);
  const [comparisonTests, setComparisonTests] = useState<ComparableTest[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [testResult, setTestResult] = useState<ReturnType<typeof calculateDiscResult> | null>(null);
  const [resultTimestamp, setResultTimestamp] = useState('');
  const [resultOrigin, setResultOrigin] = useState<'new' | 'history'>('new');
  const [isSaving, setIsSaving] = useState(false);

  const randomizedQuestions = useMemo(() => {
    return discQuestions.map((q) => {
      const keys = Object.keys(q.factors) as Factor[];
      return { id: q.id, shuffledKeys: shuffleArray(keys), factors: q.factors };
    });
  }, []);

  const normalizedDisplayName = normalizeName(userData.nomeCompleto);
  const baselineTest = previousTests.length ? sortOldest(previousTests)[0] : null;
  const currentDelta = baselineTest && testResult ? buildFactorDelta(baselineTest, testResult) : null;

  useEffect(() => {
    if (appState === 'splash') {
      const timer = setTimeout(() => setAppState('onboarding'), 1800);
      return () => clearTimeout(timer);
    }
  }, [appState]);

  const handleScoreSelect = (questionId: string, factor: Factor, score: number) => {
    setAnswers((prev) => {
      const currentQ = prev[questionId] || { D: null, I: null, S: null, C: null };
      const updatedQ = { ...currentQ };
      Object.keys(updatedQ).forEach((key) => {
        const kFactor = key as Factor;
        if (updatedQ[kFactor] === score) updatedQ[kFactor] = null;
      });
      updatedQ[factor] = currentQ[factor] === score ? null : score;
      return { ...prev, [questionId]: updatedQ };
    });
  };

  const checkIsQuestionComplete = (questionId: string) => {
    const qAnswers = answers[questionId];
    if (!qAnswers) return false;
    return qAnswers.D !== null && qAnswers.I !== null && qAnswers.S !== null && qAnswers.C !== null;
  };

  const isTestComplete = randomizedQuestions.every((q) => checkIsQuestionComplete(q.id));
  const totalAnswers = randomizedQuestions.length * 4;
  const answeredCount = Object.values(answers).reduce((acc, curr) => acc + Object.values(curr).filter((v) => v !== null).length, 0);
  const missingAnswers = totalAnswers - answeredCount;
  const progressPercent = Math.round(
    (answeredCount / totalAnswers) * 100,
  );

  const handleLookup = async () => {
    if (!normalizedDisplayName || onlyDigits(userData.telefone).length < 10) return;
    setLookupLoading(true);
    setLookupError('');

    try {
      const params = new URLSearchParams({ name: normalizedDisplayName, phone: userData.telefone });
      const response = await fetch(`/api/tests/lookup?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao buscar histórico.');

      const tests = sortOldest((payload.tests || []) as ComparableTest[]);
      setPreviousTests(tests);
      setComparisonTests([]);
      setAppState(tests.length ? 'history' : 'test');
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : 'Erro ao buscar histórico.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleFinishTest = async () => {
    if (!isTestComplete || isSaving) return;
    setIsSaving(true);

    try {
      const finalAnswers = answers as Record<string, Record<Factor, number>>;
      const result = calculateDiscResult(finalAnswers);

      const response = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { nomeCompleto: normalizedDisplayName, telefone: userData.telefone },
          answers: finalAnswers,
          result,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao gravar os dados.');

      const savedTest = payload.test as ComparableTest | undefined;
      const fallbackCurrentTest: ComparableTest = {
        id: `current_${Date.now()}`,
        timestamp: new Date().toISOString(),
        leadData: { nomeCompleto: normalizedDisplayName, telefone: userData.telefone },
        phoneDigits: onlyDigits(userData.telefone),
        percentages: result.percentages,
        primaryProfile: result.primaryProfile,
        secondaryProfile: result.secondaryProfile,
      };

      setComparisonTests(sortOldest([...previousTests, savedTest || fallbackCurrentTest]));
      setResultTimestamp((savedTest || fallbackCurrentTest).timestamp);
      setTestResult(result);
      setResultOrigin('new');
      setAppState('completed');
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Houve um erro no processamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewPastResult = (testId?: string) => {
    const orderedTests = sortOldest(previousTests);
    const selectedTest = testId ? orderedTests.find((test) => test.id === testId) : orderedTests[orderedTests.length - 1];
    if (!selectedTest) return;
    const selectedTime = new Date(selectedTest.timestamp).getTime();
    const historicalSlice = orderedTests.filter((test) => new Date(test.timestamp).getTime() <= selectedTime);
    setComparisonTests(historicalSlice.length > 1 ? historicalSlice : [selectedTest]);
    setResultTimestamp(selectedTest.timestamp);
    setTestResult(buildResultFromRecord(selectedTest));
    setResultOrigin('history');
    setAppState('completed');
  };

  const validOnboarding = normalizedDisplayName.length >= 5 && onlyDigits(userData.telefone).length >= 10;
  const hasComparison = comparisonTests.length > 1;

  return (
    <main className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground font-sans selection:bg-primary selection:text-white">
      <AnimatePresence mode="wait">
        {appState === 'splash' && (
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.5 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B0B]">
            <Image src="https://i.imgur.com/PMCjrpw.png" alt="Landi Turbina" width={240} height={72} className="w-52 md:w-64 object-contain" priority />
          </motion.div>
        )}

        {appState === 'onboarding' && (
          <motion.section key="onboarding" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-panel/40 backdrop-blur-xl border border-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
              <h1 className="font-display font-bold text-3xl mb-2 text-white">COMECE O TESTE</h1>
              <p className="text-sm text-foreground/60 mb-8 max-w-[300px]">Digite seus dados para iniciar ou recuperar seu histórico.</p>
              <div className="space-y-5">
                <label className="block">
                  <span className="text-xs font-mono text-foreground/50 uppercase">Nome completo</span>
                  <input type="text" required value={userData.nomeCompleto} onChange={(e) => setUserData({ ...userData, nomeCompleto: nameInputValue(e.target.value) })} onBlur={() => setUserData({ ...userData, nomeCompleto: normalizedDisplayName })} className="mt-2 w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all font-medium uppercase" placeholder="NOME COMPLETO" />
                </label>
                <label className="block">
                  <span className="text-xs font-mono text-foreground/50 uppercase">Telefone</span>
                  <input type="tel" required value={userData.telefone} onChange={(e) => setUserData({ ...userData, telefone: phoneMask(e.target.value) })} className="mt-2 w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all font-medium" placeholder="(00) 00000-0000" maxLength={15} />
                </label>
              </div>
              {lookupError && <p className="mt-4 text-sm text-red-400">{lookupError}</p>}
              <button disabled={!validOnboarding || lookupLoading} onClick={handleLookup} className="mt-10 w-full py-4 px-6 bg-primary text-white font-display font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
                <Search size={18} />
                {lookupLoading ? 'BUSCANDO...' : 'CONTINUAR'}
              </button>
            </div>
          </motion.section>
        )}

        {appState === 'history' && (
          <motion.section key="history" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex-1 flex items-center justify-center p-4 md:p-6">
            <div className="w-full max-w-4xl bg-panel/40 border border-border rounded-xl p-5 md:p-7 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(260px,320px)] gap-5 mb-6">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-primary uppercase tracking-widest">Histórico encontrado</p>
                  <h2 className="font-display text-2xl md:text-3xl font-bold text-white mt-1 leading-tight break-words">{normalizedDisplayName}</h2>
                  <p className="text-sm text-foreground/55 mt-2 max-w-2xl">
                    Encontramos {previousTests.length} teste(s) anterior(es). Escolha uma análise anterior ou inicie um novo teste para atualizar o comparativo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  <button onClick={() => handleViewPastResult()} className="group rounded-lg border border-white/15 bg-white/[0.03] px-4 py-3 text-left transition-all hover:border-white/35 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-white/25">
                    <span className="block text-[10px] font-mono uppercase tracking-widest text-foreground/40">Consulta rápida</span>
                    <span className="mt-1 block font-display text-sm font-bold text-white">Ver última análise</span>
                    <span className="mt-1 block text-xs leading-snug text-foreground/55">Resultado completo mais recente.</span>
                  </button>
                  <button onClick={() => setAppState('test')} className="group rounded-lg border border-primary/40 bg-primary px-4 py-3 text-left text-white shadow-lg shadow-primary/10 transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/60">
                    <span className="block text-[10px] font-mono uppercase tracking-widest text-white/65">Novo ciclo</span>
                    <span className="mt-1 block font-display text-sm font-bold">Fazer novo teste</span>
                    <span className="mt-1 block text-xs leading-snug text-white/75">Atualiza histórico e comparativo.</span>
                  </button>
                </div>
              </div>
              <div className="space-y-3 max-h-[56vh] overflow-auto pr-1">
                {previousTests.map((test, index) => {
                  const phoneChanged = test.phoneDigits && test.phoneDigits !== onlyDigits(userData.telefone);
                  return (
                    <button key={test.id} type="button" onClick={() => handleViewPastResult(test.id)} className="w-full text-left rounded-lg border border-border bg-black/20 p-4 transition-all hover:border-primary/45 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/50">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-center">
                        <div className="min-w-0">
                          <p className="font-display text-base md:text-lg text-white break-words">#{index + 1} - {test.primaryProfile} + {test.secondaryProfile}</p>
                          <p className="text-xs font-mono text-foreground/50 mt-1">{formatDateTime(test.timestamp)} | {test.leadData.telefone || test.phoneDigits}</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2 md:w-56">
                          {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
                            <span key={factor} className="rounded-md bg-white/[0.04] px-2 py-2 text-center text-xs font-mono text-foreground/70">{factor} {test.percentages[factor]}%</span>
                          ))}
                        </div>
                      </div>
                      {phoneChanged && <p className="text-xs text-primary mt-3">Telefone novo detectado. Ao salvar, o cadastro por nome passa a apontar para o telefone informado agora.</p>}
                      <p className="text-[11px] font-mono uppercase tracking-widest text-foreground/35 mt-3">Clique para abrir a análise completa</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.section>
        )}

        {appState === 'test' && (
          <motion.section key="test" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col items-center w-full">
            <div className="sticky top-0 w-full z-40 bg-black/80 backdrop-blur-md border-b border-white/5 pt-4">
              <div className="w-full max-w-4xl mx-auto px-4 flex justify-between items-end mb-3">
                <div>
                  <h1 className="font-display font-bold text-xl leading-none">TESTE DE PERFIL</h1>
                  <p className="text-xs font-mono text-foreground/45 mt-1">{normalizedDisplayName}</p>
                </div>
                <span className="text-xs font-mono text-foreground/50">{missingAnswers > 0 ? `Faltam ${missingAnswers} respostas` : 'Tudo respondido'}</span>
              </div>
              <div className="w-full h-1 bg-white/5 relative overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} className="absolute inset-y-0 left-0 bg-primary" />
              </div>
            </div>
            <div className="w-full max-w-4xl mx-auto px-4 py-8 pb-32 space-y-10">
              <div>
                {previousTests.length === 0 && (
                  <div className="mb-6 rounded-xl border border-primary/25 bg-primary/10 p-5">
                    <p className="text-xs font-mono uppercase tracking-widest text-primary">Primeiro teste encontrado</p>
                    <h2 className="mt-2 font-display text-2xl font-bold text-white">Responda 10 situações</h2>
                    <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                      Em cada situação, dê uma nota para cada linha. Use 1, 2, 3 e 4 apenas uma vez.
                    </p>
                  </div>
                )}
                <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg">
                  <p className="text-xs font-mono uppercase tracking-widest text-primary">Como responder</p>
                  <div className="mt-3 space-y-2 text-sm text-foreground/80">
                    <p>Use cada número uma vez em cada situação.</p>
                    <p>4 = mais parece com você</p>
                    <p>1 = menos parece com você</p>
                  </div>
                </div>
              </div>
              {randomizedQuestions.map((q, index) => {
                const qAnswers = answers[q.id] || {};
                const isComplete = checkIsQuestionComplete(q.id);
                return (
                  <div key={q.id} className={cn('flex flex-col gap-6 p-6 rounded-xl border transition-colors duration-300', isComplete ? 'border-green-900/50 bg-[#0B0B0B]' : 'border-border bg-panel/30')}>
                    <div className="flex justify-between items-center">
                      <h3 className="font-display font-bold text-xl text-white/90 uppercase tracking-wide">SITUAÇÃO {index + 1}</h3>
                      {isComplete && <span className="text-xs font-mono font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded">OK</span>}
                    </div>
                    <div className="space-y-4">
                      {q.shuffledKeys.map((factor) => {
                        const selectedScore = qAnswers[factor];
                        const usedScores = Object.values(qAnswers).filter((v) => v !== null) as number[];
                        return (
                          <div key={factor} className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8 group">
                            <span className="text-[15px] leading-snug md:text-base flex-1 text-foreground/80 group-hover:text-white transition-colors">{q.factors[factor]}</span>
                            <div className="flex bg-black/40 rounded-lg p-1 w-full md:w-auto h-12 border border-white/5">
                              {[1, 2, 3, 4].map((num) => {
                                const isSelected = selectedScore === num;
                                const isUsedElseWhere = !isSelected && usedScores.includes(num);
                                return (
                                  <button key={num} onClick={() => handleScoreSelect(q.id, factor, num)} className={cn('flex-1 md:w-14 h-full flex items-center justify-center font-display font-medium rounded-md transition-all', isSelected ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[0.98]' : isUsedElseWhere ? 'opacity-20 cursor-not-allowed text-foreground/30' : 'text-foreground/60 hover:text-white hover:bg-white/5')}>
                                    {num}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-8 border-t border-border">
                <button disabled={!isTestComplete || isSaving} onClick={handleFinishTest} className={cn('px-8 py-4 font-display font-medium rounded-lg transition-all', isTestComplete && !isSaving ? 'bg-primary text-white hover:bg-primary/90 hover:-translate-y-1' : 'bg-panel text-foreground/40 cursor-not-allowed')}>
                  {isSaving ? 'PROCESSANDO...' : isTestComplete ? 'VER MEU RESULTADO' : 'RESPONDA TUDO PARA VER O RESULTADO'}
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {appState === 'completed' && testResult && (
          <motion.section key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center p-3 sm:p-5 md:p-8 w-full max-w-7xl mx-auto">
            <div className="w-full bg-[#0B0B0B] p-4 sm:p-5 md:p-7 rounded-xl shadow-2xl">
              <div className="w-full flex flex-col md:flex-row md:justify-between md:items-center gap-5 mb-7 pb-6 border-b border-white/10">
                <div>
                  <Image src="https://i.imgur.com/PMCjrpw.png" alt="Landi Turbina" width={140} height={40} className="w-32 md:w-40 object-contain mb-4" />
                  <h1 className="font-display font-bold text-2xl md:text-3xl uppercase tracking-tight text-white mb-1">SEU RESULTADO DISC</h1>
                  <p className="text-foreground/50 font-mono text-sm uppercase">{normalizedDisplayName} | {formatDateTime(resultTimestamp || new Date().toISOString())}</p>
                </div>
                <div className="no-print flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                  {resultOrigin === 'history' && (
                    <button onClick={() => setAppState('history')} className="justify-center bg-white/[0.03] hover:bg-white/[0.07] text-white border border-white/15 rounded-lg px-4 py-2 font-display text-sm font-medium transition-all flex items-center gap-2">
                      VOLTAR AOS TESTES
                    </button>
                  )}
                  <button onClick={() => generateAnalysisPDF({ mode: 'full', filename: `Relatorio_DISC_${safePdfName(normalizedDisplayName)}.pdf`, normalizedDisplayName, result: testResult, comparisonTests, reportDate: resultTimestamp })} className="justify-center bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg px-4 py-2 font-display text-sm font-medium transition-all flex items-center gap-2">
                    <Download size={16} /> BAIXAR RELATÓRIO
                  </button>
                </div>
              </div>
              <div className="w-full grid grid-cols-1 lg:grid-cols-[minmax(320px,430px)_minmax(0,1fr)] gap-5 xl:gap-7 items-start">
                <div className="flex flex-col gap-5">
                  <div className="rounded-xl border border-white/10 bg-panel/25 p-4 md:p-5">
                    <DonutChart percentages={testResult.percentages} primaryProfile={testResult.primaryProfile} />
                    <div className="w-full mt-5 grid grid-cols-2 gap-3">
                      {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
                        <div key={factor} className="bg-black/25 border border-border p-4 rounded-lg flex flex-col items-center relative">
                          <span className="text-lg font-mono font-medium text-white">{testResult.percentages[factor]}%</span>
                          <span className="text-[10px] uppercase text-foreground/50 tracking-widest mt-1">{factorLabels[factor]}</span>
                          {currentDelta && <span className={cn('absolute top-2 right-2 text-[10px] font-mono', currentDelta[factor] > 0 ? 'text-green-500' : currentDelta[factor] < 0 ? 'text-red-500' : 'text-white/30')}>{deltaText(currentDelta[factor])}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <BehavioralAxisPanel percentages={testResult.percentages} />
                </div>

                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1fr)] gap-5">
                    <div className="rounded-xl border border-white/10 bg-panel/25 p-5 md:p-6">
                      <h3 className="text-sm font-mono text-primary uppercase tracking-widest mb-2">DIAGNÓSTICO</h3>
                      <h2 className="font-display font-bold text-4xl md:text-5xl uppercase tracking-tighter text-white leading-[0.9]">
                        {testResult.combinedString.split('-')[0]} <br />
                        <span className="text-white/40">{testResult.combinedString.split('-')[1]}</span>
                      </h2>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 p-5 md:p-6 rounded-xl relative">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-xl" />
                      <p className="text-base md:text-lg text-foreground font-medium leading-relaxed">&quot;{testResult.reportCopy}&quot;</p>
                    </div>
                  </div>
                  <DiscQuadrantMap percentages={testResult.percentages} />
                </div>
              </div>
              <div className="mt-5">
                {hasComparison ? (
                  <ComparisonBlock normalizedDisplayName={normalizedDisplayName} comparisonTests={comparisonTests} />
                ) : (
                  <div className="bg-panel/50 border border-border p-6 rounded-xl">
                    <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest mb-2">Primeiro registro</h4>
                    <p className="text-sm text-foreground/75">Este é o primeiro teste DISC localizado para este cadastro. O próximo resultado já terá comparativo completo por data.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function DonutChart({ percentages, primaryProfile }: { percentages: Record<Factor, number>; primaryProfile: string }) {
  const [activeFactor, setActiveFactor] = useState<Factor | null>(null);
  const factors = ['D', 'I', 'S', 'C'] as Factor[];
  const dominantFactor = [...factors].sort((a, b) => percentages[b] - percentages[a])[0];
  const displayFactor = activeFactor || dominantFactor;
  const outerRadius = 82;
  const innerRadius = 55;
  let startAngle = 0;

  return (
    <div className="w-full flex flex-col items-center lg:items-start gap-4">
      <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-full h-full" role="img" aria-label="Distribuição do perfil DISC">
          <circle cx="100" cy="100" r={outerRadius} fill="#1f1f1f" opacity="0.7" />
          <circle cx="100" cy="100" r={innerRadius} fill="#0B0B0B" />
          {factors.map((factor) => {
            const value = percentages[factor];
            const endAngle = startAngle + value * 3.6;
            const path = donutSegmentPath(100, 100, outerRadius, innerRadius, startAngle, endAngle);
            startAngle = endAngle;
            const segment = (
              <path
                key={factor}
                d={path}
                fill={factorColors[factor]}
                opacity={activeFactor && activeFactor !== factor ? 0.58 : 1}
                stroke={activeFactor === factor ? 'rgba(255,255,255,0.45)' : 'rgba(11,11,11,0.6)'}
                strokeWidth={activeFactor === factor ? 1.5 : 0.8}
                className="cursor-pointer outline-none transition-opacity duration-200"
                tabIndex={0}
                onMouseEnter={() => setActiveFactor(factor)}
                onMouseLeave={() => setActiveFactor(null)}
                onFocus={() => setActiveFactor(factor)}
                onBlur={() => setActiveFactor(null)}
                onClick={() => setActiveFactor(factor)}
              />
            );
            return segment;
          })}
          <circle cx="100" cy="100" r={innerRadius - 1} fill="#0B0B0B" stroke="rgba(255,255,255,0.08)" strokeWidth="1" pointerEvents="none" />
        </svg>
        <div className="pointer-events-none absolute inset-[24%] rounded-full bg-background/95 border border-white/10 flex flex-col items-center justify-center text-center px-4">
          <span className="text-4xl font-display font-bold text-white leading-none">{percentages[displayFactor]}%</span>
          <span className="text-xs uppercase font-mono text-primary mt-2 tracking-widest">{factorLabels[displayFactor]}</span>
          <span className="text-[10px] uppercase text-foreground/35 mt-1">{primaryProfile}</span>
        </div>
        {activeFactor && (
          <div className="pointer-events-none absolute right-0 top-3 w-44 rounded-lg border border-white/10 bg-[#101010]/95 p-3 text-left shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-foreground/45">{activeFactor}</span>
              <span className="text-xs font-mono text-primary">{percentages[activeFactor]}%</span>
            </div>
            <p className="mt-1 text-sm font-display text-white">{factorLabels[activeFactor]}</p>
            <p className="mt-1 text-[11px] leading-snug text-foreground/55">{factorDescriptions[activeFactor]}</p>
          </div>
        )}
      </div>
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel/60 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-base text-white">{activeFactor ? `${activeFactor} - ${factorLabels[activeFactor]}` : 'Distribuição DISC'}</p>
          <span className="font-mono text-sm text-primary">{activeFactor ? `${percentages[activeFactor]}%` : '4 eixos'}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/65">
          {activeFactor ? factorDescriptions[activeFactor] : 'Passe o mouse sobre uma fatia para ver o significado daquele eixo. No toque, selecione a fatia desejada.'}
        </p>
        <p className="mt-3 text-[11px] font-mono uppercase tracking-widest text-foreground/35">O centro destaca o eixo mais forte do resultado.</p>
      </div>
    </div>
  );
}

function DiscQuadrantMap({ percentages }: { percentages: Record<Factor, number> }) {
  const quadrants: Array<{ factor: Factor; position: string; axis: string }> = [
    { factor: 'D', position: 'col-start-1 row-start-1', axis: 'Controle + assertividade' },
    { factor: 'I', position: 'col-start-2 row-start-1', axis: 'Abertura + assertividade' },
    { factor: 'C', position: 'col-start-1 row-start-2', axis: 'Controle + ponderação' },
    { factor: 'S', position: 'col-start-2 row-start-2', axis: 'Abertura + ponderação' },
  ];
  const ranking = (['D', 'I', 'S', 'C'] as Factor[]).sort((a, b) => percentages[b] - percentages[a]);
  const dominant = ranking[0];

  return (
    <div className="w-full rounded-xl border border-white/10 bg-panel/35 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary">Mapa visual DISC</p>
          <p className="text-sm text-foreground/55 mt-1">Quadrantes por intensidade, com eixos de leitura comportamental.</p>
        </div>
        <span className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-mono text-primary">{factorLabels[dominant]}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-3">
        <div className="col-start-2 row-start-1 text-center text-[10px] font-mono uppercase tracking-widest text-foreground/45">Assertividade</div>
        <div className="col-start-1 row-start-2 flex items-center text-[10px] font-mono uppercase tracking-widest text-foreground/45 [writing-mode:vertical-rl] rotate-180">Controle</div>
        <div className="col-start-3 row-start-2 flex items-center text-[10px] font-mono uppercase tracking-widest text-foreground/45 [writing-mode:vertical-rl]">Abertura</div>
        <div className="col-start-2 row-start-3 text-center text-[10px] font-mono uppercase tracking-widest text-foreground/45">Ponderação</div>

        <div className="col-start-2 row-start-2 relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/35 shadow-2xl shadow-black/30">
          <div className="absolute inset-x-0 top-1/2 z-10 h-0.5 bg-white/45" />
          <div className="absolute inset-y-0 left-1/2 z-10 w-0.5 bg-white/45" />
          <div className="grid h-full w-full grid-cols-2 grid-rows-2">
            {quadrants.map(({ factor, position, axis }) => (
              <div key={factor} className={cn('relative overflow-hidden p-3 md:p-4', position, dominant === factor ? 'ring-2 ring-inset ring-white/70' : '')}>
                <div className="absolute inset-0" style={{ background: quadrantColors[factor], opacity: dominant === factor ? 0.88 : 0.62 }} />
                <div className="absolute inset-x-0 bottom-0 bg-black/35" style={{ height: `${100 - Math.max(12, percentages[factor])}%` }} />
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/30" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <p className="text-3xl md:text-4xl font-display font-bold text-white">{factor}</p>
                    <p className="text-[10px] md:text-xs font-mono uppercase tracking-widest text-white/75">{factorLabels[factor]}</p>
                  </div>
                  <div>
                    <p className="font-mono text-lg text-white">{percentages[factor]}%</p>
                    <p className="text-[10px] leading-snug text-white/70">{axis}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ranking.map((factor, index) => (
          <div key={factor} className={cn('rounded-lg border p-3', index === 0 ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-black/20')}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm text-white">{factorLabels[factor]}</p>
              <span className="font-mono text-xs text-primary">{percentages[factor]}%</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/55">{factorDescriptions[factor]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BehavioralAxisPanel({ percentages }: { percentages: Record<Factor, number> }) {
  const assertiveness = percentages.D + percentages.I;
  const ponderation = percentages.S + percentages.C;
  const control = percentages.D + percentages.C;
  const openness = percentages.I + percentages.S;
  const decisionTilt = assertiveness >= ponderation ? 'mais direto, veloz e orientado à ação' : 'mais cauteloso, consistente e orientado à análise';
  const relationTilt = openness >= control ? 'mais aberto à troca, influência e adaptação pelo contato' : 'mais focado em critério, estrutura e condução do processo';
  const bars = [
    { label: 'Assertividade', value: assertiveness, detail: 'Ação, velocidade e posicionamento.', color: '#BC0F24' },
    { label: 'Ponderação', value: ponderation, detail: 'Análise, constância e cuidado.', color: '#A3A3A3' },
    { label: 'Controle', value: control, detail: 'Direção, método e precisão.', color: '#737373' },
    { label: 'Abertura', value: openness, detail: 'Comunicação, cooperação e flexibilidade.', color: '#C89B18' },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4 md:p-5">
      <div className="mb-4">
        <p className="text-xs font-mono uppercase tracking-widest text-primary">Leitura complementar</p>
        <h3 className="mt-1 font-display text-lg text-white">Como o perfil tende a decidir e se relacionar</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {bars.map((bar) => (
          <div key={bar.label} className="rounded-lg border border-white/10 bg-panel/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-sm text-white">{bar.label}</p>
              <span className="font-mono text-xs text-foreground/65">{bar.value}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, bar.value)}%`, background: bar.color }} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-foreground/55">{bar.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm leading-relaxed text-foreground/75">
          Na leitura geral, este resultado aparece <span className="font-semibold text-white">{decisionTilt}</span>. Na interação com pessoas e processos, tende a ser <span className="font-semibold text-white">{relationTilt}</span>. Use essa leitura como apoio ao DISC principal, não como substituição do diagnóstico.
        </p>
      </div>
    </div>
  );
}

function ComparisonBlock({ normalizedDisplayName, comparisonTests }: { normalizedDisplayName: string; comparisonTests: ComparableTest[] }) {
  const stats = buildComparisonStats(comparisonTests);
  if (!stats) return null;
  const { orderedTests, first, previous, current, totalDelta, lastDelta, biggestShift, profileChanges } = stats;

  return (
    <div className="bg-panel/50 border border-border p-5 md:p-7 rounded-xl relative overflow-hidden">
      <div className="flex items-start gap-3 mb-5">
        <CalendarDays className="text-primary mt-0.5" size={18} />
        <div>
          <h4 className="text-xs font-mono text-foreground/50 uppercase tracking-widest">Comparativo histórico completo</h4>
          <p className="text-sm text-white mt-1">{normalizedDisplayName}</p>
          <p className="text-xs text-foreground/50">
            {orderedTests.length} testes analisados entre {formatDateTime(first.timestamp)} e {formatDateTime(current.timestamp)}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total de testes" value={`${orderedTests.length}`} detail="inclui o resultado atual" />
        <SummaryCard label="Perfil inicial" value={first.primaryProfile} detail={`${first.secondaryProfile} como apoio`} />
        <SummaryCard label="Perfil atual" value={current.primaryProfile} detail={`${current.secondaryProfile} como apoio`} />
        <SummaryCard label="Trocas de perfil" value={`${profileChanges}`} detail="mudanças de perfil primário" />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/25 p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-primary" />
          <h5 className="font-display text-sm text-white uppercase">Leitura da evolução</h5>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Desde o primeiro teste, o eixo que mais mudou foi <span className="font-bold text-white">{factorLabels[biggestShift]}</span>: ele <span className={cn('font-bold', totalDelta[biggestShift] > 0 ? 'text-green-500' : totalDelta[biggestShift] < 0 ? 'text-red-500' : 'text-white')}>{deltaSentence(totalDelta[biggestShift])}</span>. Em termos simples, isso mostra onde o comportamento mais se deslocou ao longo do tempo. No teste mais recente, o perfil principal foi de <span className="font-bold text-white">{previous.primaryProfile}</span> para <span className="font-bold text-primary">{current.primaryProfile}</span>{previous.primaryProfile === current.primaryProfile ? ', mantendo a mesma tendência dominante.' : ', indicando mudança na tendência dominante.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
          <div key={factor} className="rounded-lg bg-black/30 border border-white/10 p-3">
            <p className="text-xs font-mono text-foreground/45">{factorLabels[factor]}</p>
            <p className="text-sm text-foreground/60 mt-1">Primeiro: <span className="text-white font-mono">{first.percentages[factor]}%</span></p>
            <p className="text-sm text-foreground/60">Atual: <span className="text-white font-mono">{current.percentages[factor]}%</span></p>
            <p className={cn('text-xs font-mono mt-2', totalDelta[factor] > 0 ? 'text-green-500' : totalDelta[factor] < 0 ? 'text-red-500' : 'text-foreground/45')}>
              Desde o primeiro: {deltaSentence(totalDelta[factor])}. Último teste: {deltaSentence(lastDelta[factor])}.
            </p>
          </div>
        ))}
      </div>

      <div className="md:hidden space-y-3 mb-5">
        {orderedTests.map((test, index) => (
          <div key={test.id} className="rounded-lg border border-white/10 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-foreground/45">{formatDateTime(test.timestamp)}</p>
                <p className="mt-1 text-sm font-display text-white">{index + 1}. {test.primaryProfile} / {test.secondaryProfile}</p>
              </div>
              <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-mono text-foreground/65">#{index + 1}</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
                <div key={factor} className="rounded-md bg-white/[0.03] p-2 text-center">
                  <p className="text-[10px] font-mono text-foreground/35">{factor}</p>
                  <p className="font-mono text-sm text-white">{test.percentages[factor]}%</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-white/[0.03] text-xs font-mono uppercase text-foreground/45">
            <tr>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Perfil</th>
              <th className="px-3 py-3">D</th>
              <th className="px-3 py-3">I</th>
              <th className="px-3 py-3">S</th>
              <th className="px-3 py-3">C</th>
            </tr>
          </thead>
          <tbody>
            {orderedTests.map((test, index) => (
              <tr key={test.id} className="border-t border-white/10">
                <td className="px-3 py-3 font-mono text-foreground/70">{formatDateTime(test.timestamp)}</td>
                <td className="px-3 py-3 text-white">{index + 1}. {test.primaryProfile} / {test.secondaryProfile}</td>
                {(['D', 'I', 'S', 'C'] as Factor[]).map((factor) => (
                  <td key={factor} className="px-3 py-3 font-mono text-foreground/80">{test.percentages[factor]}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs text-foreground/45">
        <UserRound size={14} />
        Comparativo gerado automaticamente priorizando o telefone; o nome completo entra como apoio quando não houver histórico para o número informado.
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-foreground/45">{label}</p>
      <p className="text-lg font-display font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-foreground/45 mt-1">{detail}</p>
    </div>
  );
}
