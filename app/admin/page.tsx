'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, LockKeyhole, LogOut, Search } from 'lucide-react';
import type { DiscTestRecord } from '@/lib/disc-types';
import { formatDateTime, onlyDigits } from '@/lib/normalization';
import { cn } from '@/lib/utils';

type AuthState = 'loading' | 'setup' | 'login' | 'ready' | 'error';
type SortMode = 'newest' | 'oldest';

export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [tests, setTests] = useState<DiscTestRecord[]>([]);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [loadingTests, setLoadingTests] = useState(false);

  const loadTests = useCallback(async () => {
    setLoadingTests(true);
    try {
      const response = await fetch('/api/admin/tests');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao buscar testes.');
      setTests(payload.tests || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao buscar testes.');
      if ((error instanceof Error ? error.message : '').includes('autorizado')) setAuthState('login');
    } finally {
      setLoadingTests(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/status');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao carregar status.');

      if (payload.authenticated) {
        setAuthState('ready');
        await loadTests();
      } else {
        setAuthState(payload.setupRequired ? 'setup' : 'login');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar admin.');
      setAuthState('error');
    }
  }, [loadTests]);

  useEffect(() => {
    // Initial server auth check for this client-only dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

  async function submitPassword() {
    setMessage('');
    const endpoint = authState === 'setup' ? '/api/admin/setup' : '/api/admin/login';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || 'Senha recusada.');
      return;
    }

    setPassword('');
    setAuthState('ready');
    await loadTests();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setTests([]);
    setAuthState('login');
  }

  const filteredTests = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const digits = onlyDigits(query);
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return tests
      .filter((test) => {
        const time = new Date(test.timestamp).getTime();
        const matchesQuery =
          !needle ||
          test.leadData.nomeCompleto.includes(needle) ||
          test.primaryProfile.toUpperCase().includes(needle) ||
          test.secondaryProfile.toUpperCase().includes(needle) ||
          (digits && test.phoneDigits.includes(digits));
        const matchesFrom = from === null || time >= from;
        const matchesTo = to === null || time <= to;
        return matchesQuery && matchesFrom && matchesTo;
      })
      .sort((a, b) => {
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        return sortMode === 'newest' ? diff : -diff;
      });
  }, [fromDate, query, sortMode, tests, toDate]);

  if (authState !== 'ready') {
    return (
      <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md border border-border bg-panel/40 rounded-xl p-8">
          <div className="flex items-center gap-3 text-primary mb-6">
            <LockKeyhole size={24} />
            <span className="text-xs font-mono uppercase tracking-widest">Admin Landi Turbina</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white mb-2">
            {authState === 'setup' ? 'CRIAR SENHA' : authState === 'loading' ? 'CARREGANDO' : 'ACESSO RESTRITO'}
          </h1>
          <p className="text-sm text-foreground/60 mb-7">
            {authState === 'setup' ? 'Primeiro acesso: crie uma senha forte para proteger os resultados.' : 'Digite a senha administrativa para visualizar os resultados.'}
          </p>
          {authState !== 'loading' && authState !== 'error' && (
            <div className="space-y-4">
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submitPassword()} className="w-full bg-[#111111] border border-border rounded-lg outline-none px-4 py-3 text-white focus:border-primary/60 focus:ring-1 focus:ring-primary/60" placeholder="Senha" />
              <button onClick={submitPassword} disabled={password.length < (authState === 'setup' ? 10 : 1)} className="w-full py-3 rounded-lg bg-primary text-white font-display font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                {authState === 'setup' ? 'CRIAR E ENTRAR' : 'ENTRAR'}
              </button>
            </div>
          )}
          {message && <p className="mt-5 text-sm text-red-400">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-black/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-primary uppercase tracking-widest">Dashboard administrativo</p>
            <h1 className="font-display text-3xl font-bold text-white mt-1">RESULTADOS DISC</h1>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground/80 hover:text-white hover:border-white/20">
            <LogOut size={16} /> SAIR
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px_180px_170px] gap-3 mb-6">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full h-12 bg-panel/60 border border-border rounded-lg pl-10 pr-4 outline-none focus:border-primary/60" placeholder="Filtrar por nome, telefone ou perfil" />
          </label>
          <label className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" size={16} />
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="w-full h-12 bg-panel/60 border border-border rounded-lg pl-10 pr-3 outline-none focus:border-primary/60 text-sm" />
          </label>
          <label className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" size={16} />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-full h-12 bg-panel/60 border border-border rounded-lg pl-10 pr-3 outline-none focus:border-primary/60 text-sm" />
          </label>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="h-12 bg-panel/60 border border-border rounded-lg px-3 outline-none focus:border-primary/60 text-sm">
            <option value="newest">Mais novo primeiro</option>
            <option value="oldest">Mais antigo primeiro</option>
          </select>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-foreground/55">{loadingTests ? 'Carregando...' : `${filteredTests.length} resultado(s) exibido(s)`}</p>
          <button onClick={loadTests} className="text-sm text-foreground/65 hover:text-white">Atualizar</button>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full min-w-[920px] text-left">
            <thead className="bg-panel/80 text-xs font-mono uppercase text-foreground/45">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">D</th>
                <th className="px-4 py-3">I</th>
                <th className="px-4 py-3">S</th>
                <th className="px-4 py-3">C</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((test) => (
                <tr key={test.id} className="border-t border-border/80 hover:bg-white/[0.03]">
                  <td className="px-4 py-4 font-medium text-white">{test.leadData.nomeCompleto}</td>
                  <td className="px-4 py-4 font-mono text-sm text-foreground/70">{test.leadData.telefone || test.phoneDigits}</td>
                  <td className="px-4 py-4 font-mono text-sm text-foreground/70">{formatDateTime(test.timestamp)}</td>
                  <td className="px-4 py-4">
                    <span className="rounded bg-primary/10 text-primary px-2 py-1 text-xs font-mono">{test.primaryProfile} / {test.secondaryProfile}</span>
                  </td>
                  {(['D', 'I', 'S', 'C'] as const).map((factor) => (
                    <td key={factor} className={cn('px-4 py-4 font-mono text-sm', test.percentages[factor] >= 30 ? 'text-white' : 'text-foreground/60')}>{test.percentages[factor]}%</td>
                  ))}
                </tr>
              ))}
              {!filteredTests.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-foreground/45">Nenhum resultado encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
