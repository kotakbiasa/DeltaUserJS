import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

/**
 * Kalkulator aman: hanya angka & operator dasar yang diizinkan.
 * Tidak pakai eval — parse manual agar tidak bisa eksekusi kode.
 */
function calcExpr(expr: string): number {
  const clean = expr.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().%]+$/.test(clean)) {
    throw new Error('Karakter tidak diizinkan (hanya angka & + - * / ( ) %)');
  }
  // Tokenize & evaluate dengan shunting-yard sederhana -> hindari eval
  const tokens = clean.match(/(\d+\.?\d*|[+\-*/()%])/g);
  if (!tokens) {throw new Error('Ekspresi kosong');}

  // konversi infix -> postfix (shunting yard)
  const prec: Record<string, number> = {'+': 1, '-': 1, '*': 2, '/': 2, '%': 2};
  const output: string[] = [];
  const ops: string[] = [];
  let prevType: 'num' | 'op' | 'open' | 'close' | null = null;

  for (const tk of tokens) {
    if (/^\d/.test(tk)) {
      output.push(tk);
      prevType = 'num';
    } else if (tk === '(') {
      ops.push(tk);
      prevType = 'open';
    } else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {output.push(ops.pop() as string);}
      if (!ops.length) {throw new Error('Kurung tidak seimbang');}
      ops.pop();
      prevType = 'close';
    } else {
      // operator; dukung unary minus setelah '(' atau operator
      if (tk === '-' && (prevType === null || prevType === 'op' || prevType === 'open')) {
        output.push('0');
      }
      while (ops.length && prec[ops[ops.length - 1]] >= prec[tk]) {output.push(ops.pop() as string);}
      ops.push(tk);
      prevType = 'op';
    }
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === '(') {throw new Error('Kurung tidak seimbang');}
    output.push(op);
  }

  // evaluasi postfix
  const st: number[] = [];
  for (const tk of output) {
    if (/^\d/.test(tk)) {
      st.push(parseFloat(tk));
    } else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) {throw new Error('Ekspresi tidak valid');}
      let r: number;
      switch (tk) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) {throw new Error('Pembagian dengan nol');}
          r = a / b; break;
        case '%': r = a % b; break;
        default: throw new Error(`Operator tidak dikenal: ${tk}`);
      }
      st.push(r);
    }
  }
  if (st.length !== 1 || isNaN(st[0])) {throw new Error('Ekspresi tidak valid');}
  return st[0];
}

export default {
  name: 'calc',
  version: '1.0.0',
  description: 'Kalkulator matematika sederhana.',
  help: {
    title: 'Kalkulator (.calc)',
    description: 'Menghitung ekspresi matematika: tambah, kurang, kali, bagi, modulo.',
    usage: '`.calc <ekspresi>`',
    detail: 'Contoh: `.calc 5 + 10 * 2` atau `.calc (8-3)/5`. Hanya angka dan operator + - * / ( ) % yang diizinkan.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.calc(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const expr = (match[1] || '').trim();
    if (!expr) {
      await message.edit({
        text: `<blockquote>❌ <b>Format salah:</b> <code>.calc &lt;ekspresi&gt;</code>\nContoh: <code>.calc 5 + 10 * 2</code></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    try {
      const result = calcExpr(expr);
      const formatted = Number.isInteger(result) ? String(result) : String(parseFloat(result.toFixed(10)));
      await message.edit({
        text: `🧮 <b>Kalkulator</b>\n\n<blockquote><code>${escapeHtml(expr)}</code> = <b>${escapeHtml(formatted)}</b></blockquote>`,
        parseMode: 'html'
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in calc plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Error:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
