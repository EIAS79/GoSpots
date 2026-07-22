import { Prisma } from '@prisma/client';
import {
  addMoney,
  applyDiscountPercent,
  convertMoney,
  fxCrossRate,
  lineTotal,
  parseMoneyString,
  roundMoney,
  serializeMoney,
  serializeMoneyOrNull,
  serializeMoneyString,
  toMoneyNumber,
  toPrismaDecimal,
} from './money.util';

describe('money.util', () => {
  it('rounds classic float drift for 0.1 + 0.2', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });

  it('lineTotal rounds unit × qty', () => {
    expect(lineTotal(3, 0.1)).toBe(0.3);
    expect(lineTotal(1, 19.999)).toBe(20);
  });

  it('convertMoney applies rate then rounds', () => {
    expect(convertMoney(10, 1.23456)).toBe(12.35);
    expect(convertMoney(new Prisma.Decimal('10.005'), 2)).toBe(20.01);
  });

  it('convertMoney rejects non-positive or non-finite rates', () => {
    expect(() => convertMoney(10, 0)).toThrow(TypeError);
    expect(() => convertMoney(10, -1)).toThrow(TypeError);
    expect(() => convertMoney(10, Number.NaN)).toThrow(TypeError);
  });

  it('fxCrossRate divides with Decimal and rejects zero/missing pivots', () => {
    expect(fxCrossRate(1.1, 1)).toBeCloseTo(1.1, 10);
    expect(fxCrossRate(220, 1.1)).toBeCloseTo(200, 10);
    expect(() => fxCrossRate(1, 0)).toThrow(TypeError);
    expect(() => fxCrossRate(0, 1)).toThrow(TypeError);
  });

  it('parseMoneyString rejects garbage and locale commas', () => {
    expect(parseMoneyString('12.50')).toBe(12.5);
    expect(parseMoneyString('12.5000')).toBe(12.5);
    expect(() => parseMoneyString('nope')).toThrow(TypeError);
    expect(() => parseMoneyString('1,234.56')).toThrow(TypeError);
    expect(() => parseMoneyString('')).toThrow(TypeError);
  });

  it('roundMoney rejects non-finite', () => {
    expect(() => roundMoney(Number.NaN)).toThrow(TypeError);
  });

  it('toMoneyNumber accepts Decimal, number, string, nullish', () => {
    expect(toMoneyNumber(new Prisma.Decimal('12.3456'))).toBe(12.3456);
    expect(toMoneyNumber(7.5)).toBe(7.5);
    expect(toMoneyNumber('3.25')).toBe(3.25);
    expect(toMoneyNumber(null)).toBe(0);
    expect(toMoneyNumber(undefined)).toBe(0);
  });

  it('toMoneyNumber rejects non-finite number/string', () => {
    expect(() => toMoneyNumber(Number.NaN)).toThrow(TypeError);
    expect(() => toMoneyNumber('nope')).toThrow(TypeError);
  });

  it('toPrismaDecimal wraps writes', () => {
    const fromNum = toPrismaDecimal(19.99);
    expect(Prisma.Decimal.isDecimal(fromNum)).toBe(true);
    expect(fromNum.toNumber()).toBe(19.99);
    const passthrough = new Prisma.Decimal('1.5');
    expect(toPrismaDecimal(passthrough)).toBe(passthrough);
    expect(toPrismaDecimal(null).toNumber()).toBe(0);
  });

  it('serializeMoney emits 4dp decimal strings (canonical wire)', () => {
    expect(serializeMoney(new Prisma.Decimal('10.999'))).toBe('10.9990');
    expect(serializeMoneyOrNull(null)).toBeNull();
    expect(serializeMoneyOrNull(undefined)).toBeNull();
    expect(serializeMoneyOrNull(new Prisma.Decimal('1.234'))).toBe('1.2340');
    expect(serializeMoneyString(new Prisma.Decimal('0.1'))).toBe('0.1000');
  });

  it('serializeMoney handles string, zero, and negative', () => {
    expect(serializeMoney('19.999')).toBe('19.9990');
    expect(serializeMoney(0)).toBe('0.0000');
    expect(serializeMoney(new Prisma.Decimal('-1.235'))).toBe('-1.2350');
    expect(serializeMoneyOrNull(0)).toBe('0.0000');
  });

  it('serializeMoney rejects non-finite via toPrismaDecimal path', () => {
    expect(() => serializeMoney(Number.NaN)).toThrow();
    expect(() => serializeMoney('nope')).toThrow();
  });

  it('applyDiscountPercent clamps and rounds', () => {
    expect(applyDiscountPercent(100, 10)).toBe(90);
    expect(applyDiscountPercent(10, 150)).toBe(0);
    expect(applyDiscountPercent(10, -5)).toBe(10);
  });
});
