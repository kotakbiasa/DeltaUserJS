import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Clipboard,
  Copy,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Type,
} from 'lucide-react';
import { copyText, triggerHaptic } from '../telegram';
import { Badge, Banner, Card, SectionLabel, Switch, Toast } from '../ui';

interface UtilitiesTabProps {
  active?: boolean;
}

type UtilityId = 'calculator' | 'text' | 'password';

const UTILITIES: { id: UtilityId; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'calculator', label: 'Kalkulator', icon: Calculator, color: 'var(--info)' },
  { id: 'text', label: 'Teks', icon: Type, color: 'var(--violet)' },
  { id: 'password', label: 'Password', icon: KeyRound, color: 'var(--gold)' },
];

const CALC_KEYS = [
  'C', '(', ')', '%',
  '7', '8', '9', '/',
  '4', '5', '6', '*',
  '1', '2', '3', '-',
  '0', '.', '⌫', '+',
];

function calculateExpression(expression: string): number {
  const clean = expression.replace(/\s+/g, '');
  if (!clean || !/^[0-9+\-*/().%]+$/.test(clean)) {
    throw new Error('Hanya angka dan operator +, −, ×, ÷, %, serta kurung yang diizinkan.');
  }

  const tokens = clean.match(/(\d+\.?\d*|[+\-*/()%])/g) || [];
  if (tokens.length === 0 || tokens.join('') !== clean) {
    throw new Error('Ekspresi tidak valid.');
  }

  let position = 0;
  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  const parsePrimary = (): number => {
    const token = peek();
    if (token === undefined) {throw new Error('Ekspresi tidak lengkap.');}
    if (token === '(') {
      consume();
      const value = parseExpression();
      if (peek() !== ')') {throw new Error('Kurung tidak seimbang.');}
      consume();
      return value;
    }
    if (/^\d/.test(token)) {
      consume();
      return Number(token);
    }
    throw new Error('Ekspresi tidak valid.');
  };

  const parseUnary = (): number => {
    const token = peek();
    if (token === '+' || token === '-') {
      consume();
      const value = parseUnary();
      return token === '-' ? -value : value;
    }
    return parsePrimary();
  };

  const parseTerm = (): number => {
    let value = parseUnary();
    while (['*', '/', '%'].includes(peek() || '')) {
      const operator = consume();
      const right = parseUnary();
      if ((operator === '/' || operator === '%') && right === 0) {
        throw new Error('Pembagian dengan nol tidak valid.');
      }
      if (operator === '*') {value *= right;}
      else if (operator === '/') {value /= right;}
      else {value %= right;}
    }
    return value;
  };

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  if (position !== tokens.length) {throw new Error('Ekspresi tidak valid.');}
  if (!Number.isFinite(result)) {throw new Error('Hasil kalkulasi tidak valid.');}
  return result;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {return String(value);}
  return String(Number(value.toPrecision(12)));
}

function randomIndex(max: number): number {
  if (max <= 0 || max > 0x100000000) {return 0;}
  const range = 0x100000000;
  const limit = Math.floor(range / max) * max;
  const values = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % max;
}

function randomChar(chars: string): string {
  return chars[randomIndex(chars.length)];
}

function shuffle(chars: string[]): string[] {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [chars[index], chars[target]] = [chars[target], chars[index]];
  }
  return chars;
}

function makePassword(
  length: number,
  lowercase: boolean,
  uppercase: boolean,
  numbers: boolean,
  symbols: boolean
): string {
  const groups = [
    lowercase ? 'abcdefghijklmnopqrstuvwxyz' : '',
    uppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '',
    numbers ? '0123456789' : '',
    symbols ? '!@#$%^&*()-_=+[]{};:,.?' : '',
  ].filter(Boolean);
  if (groups.length === 0) {return '';}

  const all = groups.join('');
  const safeLength = Math.max(groups.length, Math.min(64, length));
  const chars = groups.map(randomChar);
  while (chars.length < safeLength) {chars.push(randomChar(all));}
  return shuffle(chars).slice(0, safeLength).join('');
}

export const UtilitiesTab: React.FC<UtilitiesTabProps> = ({ active = true }) => {
  const [utility, setUtility] = useState<UtilityId>('calculator');
  const [expression, setExpression] = useState('0');
  const [result, setResult] = useState('0');
  const [calcError, setCalcError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [passwordLength, setPasswordLength] = useState(16);
  const [useLowercase, setUseLowercase] = useState(true);
  const [useUppercase, setUseUppercase] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const regeneratePassword = () => {
    setPassword(
      makePassword(passwordLength, useLowercase, useUppercase, useNumbers, useSymbols)
    );
  };

  useEffect(() => {
    if (active && utility === 'password') {regeneratePassword();}
    // The password is intentionally regenerated only when the user opens the
    // password tool or changes one of its generation settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, utility, passwordLength, useLowercase, useUppercase, useNumbers, useSymbols]);

  useEffect(() => {
    if (!toast) {return;}
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const textStats = useMemo(() => {
    const normalized = text.trim();
    return {
      characters: text.length,
      words: normalized ? normalized.split(/\s+/).length : 0,
      lines: text ? text.split(/\n/).length : 0,
    };
  }, [text]);

  const calculate = () => {
    try {
      const value = calculateExpression(expression || '0');
      const formatted = formatNumber(value);
      setResult(formatted);
      setExpression(formatted);
      setCalcError(null);
      triggerHaptic('success');
    } catch (error) {
      setCalcError(error instanceof Error ? error.message : 'Ekspresi tidak valid.');
      triggerHaptic('error');
    }
  };

  const pressCalculatorKey = (key: string) => {
    triggerHaptic('light');
    setCalcError(null);
    if (key === 'C') {
      setExpression('0');
      setResult('0');
      return;
    }
    if (key === '⌫') {
      setExpression((current) => (current.length <= 1 ? '0' : current.slice(0, -1)));
      return;
    }
    if (key === '+' || key === '-' || key === '*' || key === '/') {
      setExpression((current) => `${current === '0' ? '' : current}${key}`);
      return;
    }
    setExpression((current) => {
      if (current === '0' && key !== '.') {return key;}
      if (current === '0' && key === '.') {return '0.';}
      return `${current}${key}`;
    });
  };

  const transformText = (mode: 'upper' | 'lower' | 'title') => {
    triggerHaptic('light');
    const next = mode === 'upper'
      ? text.toUpperCase()
      : mode === 'lower'
        ? text.toLowerCase()
        : text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    setText(next);
  };

  const copyValue = async (value: string, label: string) => {
    if (!value) {
      setToast({ text: 'Tidak ada nilai untuk disalin.', ok: false });
      return;
    }
    const copied = await copyText(value);
    triggerHaptic(copied ? 'success' : 'error');
    setToast({
      text: copied ? `${label} disalin.` : 'Gagal menyalin ke clipboard.',
      ok: copied,
    });
  };

  return (
    <div className="page stack gap-14">
      {toast && (
        <Toast tone={toast.ok ? 'ok' : 'err'}>
          {toast.ok ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span className="grow">{toast.text}</span>
        </Toast>
      )}

      <section className="utility-hero">
        <span className="utility-hero-icon"><Sparkles size={26} /></span>
        <div className="grow">
          <div className="fs-11 fw-8 hint" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Tools lokal
          </div>
          <h1 className="store-title">Utilitas Praktis</h1>
          <p className="store-subtitle">Kalkulator, pengolahan teks, dan password generator tanpa mengirim input ke server.</p>
        </div>
      </section>

      <div className="utility-tabs" role="tablist" aria-label="Pilih utilitas">
        {UTILITIES.map((item) => {
          const Icon = item.icon;
          const selected = utility === item.id;
          return (
            <button
              key={item.id}
              id={`utility-tab-${item.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`utility-panel-${item.id}`}
              className={selected ? 'on' : ''}
              onClick={() => {
                triggerHaptic('selectionChanged');
                setUtility(item.id);
              }}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {utility === 'calculator' && (
        <section id="utility-panel-calculator" role="tabpanel" aria-labelledby="utility-tab-calculator">
          <SectionLabel><Calculator size={13} /> Kalkulator aman</SectionLabel>
          <Card pad className="calculator-card">
            <div className="calc-display">
              <div className="calc-expression">{expression || '0'}</div>
              <div className={`calc-result ${calcError ? 'error' : ''}`} aria-live="polite">
                {calcError ? 'Tidak valid' : `= ${result}`}
              </div>
            </div>
            {calcError && <div className="fs-11" style={{ color: 'var(--danger)' }}>{calcError}</div>}
            <div className="calc-grid">
              {CALC_KEYS.map((key) => {
                const operator = ['/', '*', '-', '+', '%'].includes(key);
                const command = key === 'C' || key === '⌫' || operator;
                return (
                  <button
                    key={key}
                    className={`${operator ? 'operator' : ''} ${command ? 'command' : ''}`}
                    onClick={() => pressCalculatorKey(key)}
                  >
                    {key}
                  </button>
                );
              })}
              <button className="equals" onClick={calculate}>=</button>
            </div>
            <p className="fs-11 hint m-0 mt-12" style={{ lineHeight: 1.45 }}>
              Ekspresi diparse di perangkat. Aplikasi tidak memakai <span className="mono">eval()</span>.
            </p>
          </Card>
        </section>
      )}

      {utility === 'text' && (
        <section id="utility-panel-text" role="tabpanel" aria-labelledby="utility-tab-text">
          <SectionLabel right={<Badge tone="violet">Lokal</Badge>}>
            <Type size={13} /> Pengolahan teks
          </SectionLabel>
          <Card pad>
            <textarea
              className="input"
              aria-label="Teks untuk diproses"
              rows={7}
              maxLength={20000}
              placeholder="Tempel atau tulis teks di sini…"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="text-stats">
              <div><strong>{textStats.characters}</strong><span>Karakter</span></div>
              <div><strong>{textStats.words}</strong><span>Kata</span></div>
              <div><strong>{textStats.lines}</strong><span>Baris</span></div>
            </div>
            <div className="text-actions">
              <button className="btn ghost sm" onClick={() => transformText('upper')}>A–Z</button>
              <button className="btn ghost sm" onClick={() => transformText('lower')}>a–z</button>
              <button className="btn ghost sm" onClick={() => transformText('title')}>Title</button>
              <button className="btn primary sm" onClick={() => copyValue(text, 'Teks')}>
                <Copy size={14} /> Salin
              </button>
            </div>
            {text && (
              <button className="btn ghost wide mt-10" onClick={() => setText('')}>Hapus teks</button>
            )}
          </Card>
        </section>
      )}

      {utility === 'password' && (
        <section id="utility-panel-password" role="tabpanel" aria-labelledby="utility-tab-password">
          <SectionLabel right={<Badge tone="gold">Cryptographically secure</Badge>}>
            <LockKeyhole size={13} /> Password generator
          </SectionLabel>
          <Card pad>
            <div className="password-output">
              <span>{password || 'Pilih minimal satu jenis karakter'}</span>
              <button className="icon-btn" onClick={() => copyValue(password, 'Password')} aria-label="Salin password">
                <Clipboard size={17} />
              </button>
            </div>
            <div className="password-strength">
              <span style={{ width: password ? `${Math.min(100, passwordLength * 5)}%` : '0%' }} />
            </div>
            <div className="between mt-14">
              <span className="fs-13 fw-7">Panjang password</span>
              <Badge tone="info">{passwordLength} karakter</Badge>
            </div>
            <input
              className="range mt-10"
              type="range"
              aria-label="Panjang password"
              min={8}
              max={40}
              value={passwordLength}
              onChange={(event) => setPasswordLength(Number(event.target.value))}
            />
            <div className="password-options">
              {[
                { label: 'Huruf kecil', value: useLowercase, set: setUseLowercase },
                { label: 'Huruf besar', value: useUppercase, set: setUseUppercase },
                { label: 'Angka', value: useNumbers, set: setUseNumbers },
                { label: 'Simbol', value: useSymbols, set: setUseSymbols },
              ].map((option) => (
                <div key={option.label} className="password-option">
                  <span className="fs-13">{option.label}</span>
                  <Switch
                    checked={option.value}
                    onChange={option.set}
                    label={option.label}
                  />
                </div>
              ))}
            </div>
            <button className="btn primary wide mt-14" onClick={regeneratePassword}>
              <RefreshCw size={16} /> Buat password baru
            </button>
          </Card>
        </section>
      )}

      <Banner tone="info" icon={<ShieldCheck size={17} />}>
        <span className="fs-12">
          Password dibuat dengan <span className="mono">crypto.getRandomValues()</span> di perangkat ini.
          Jangan gunakan password yang sama untuk akun penting.
        </span>
      </Banner>
    </div>
  );
};
