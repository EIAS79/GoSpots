import { BadRequestException } from '@nestjs/common';
import { CurrencyRatesService } from './currency-rates.service';

describe('CurrencyRatesService.convertAmount', () => {
  const service = new CurrencyRatesService();

  it('rounds via money.util convertMoney', () => {
    expect(service.convertAmount(10, 1.23456)).toBe(12.35);
    expect(service.convertAmount(19.999, 1)).toBe(20);
  });

  it('treats non-finite amount as 0', () => {
    expect(service.convertAmount(Number.NaN, 1.5)).toBe(0);
  });

  it('rejects zero / negative / non-finite rates', () => {
    expect(() => service.convertAmount(10, 0)).toThrow(BadRequestException);
    expect(() => service.convertAmount(10, -2)).toThrow(BadRequestException);
    expect(() => service.convertAmount(10, Number.NaN)).toThrow(
      BadRequestException,
    );
  });
});
