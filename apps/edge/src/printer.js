import { createConnection } from 'node:net';

const ESC = 0x1b;
const GS = 0x1d;
const MAX_TEXT_BYTES = 128 * 1024;

function payloadText(payload) {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (Array.isArray(payload.lines)) return payload.lines.map((line) => String(line)).join('\n');
  }
  return JSON.stringify(payload ?? {}, null, 2);
}

export function renderEscPos(payload) {
  const text = Buffer.from(payloadText(payload), 'utf8');
  if (text.length > MAX_TEXT_BYTES) throw new Error('UNSUPPORTED: print payload exceeds 128 KiB');
  const initialize = Buffer.from([ESC, 0x40]);
  const newline = text.length && text[text.length - 1] === 0x0a ? Buffer.alloc(0) : Buffer.from('\n');
  const cut = payload && typeof payload === 'object' && payload.cut === false
    ? Buffer.alloc(0)
    : Buffer.from([GS, 0x56, 0x00]);
  return Buffer.concat([initialize, text, newline, cut]);
}

function writeTcp(host, port, bytes, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => socket.destroy(new Error('Printer connection timed out')), timeoutMs);
    const cleanup = () => clearTimeout(timer);
    socket.once('error', (error) => { cleanup(); reject(error); });
    socket.once('connect', () => {
      socket.end(bytes, () => { cleanup(); resolve({ bytes: bytes.length }); });
    });
  });
}

export async function executePrintJob(job, { tcpWriter = writeTcp } = {}) {
  const printer = job?.printer ?? {};
  const adapter = String(printer.adapter ?? '').trim().toLowerCase();
  const bytes = renderEscPos(job?.payload ?? {});

  if (adapter === 'test' || adapter === 'memory') {
    return { adapter, bytes: bytes.length };
  }

  if (adapter === 'tcp-escpos' || adapter === 'escpos-tcp') {
    const host = String(printer.host ?? '').trim();
    const port = Number(printer.port ?? 9100);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('UNSUPPORTED: TCP ESC/POS printer requires a valid host and port');
    }
    const result = await tcpWriter(host, port, bytes);
    return { adapter: 'tcp-escpos', ...result };
  }

  throw new Error(`UNSUPPORTED: printer adapter ${adapter || '(missing)'} is not installed on this Edge Hub`);
}
