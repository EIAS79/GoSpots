import { BadRequestException } from '@nestjs/common';

export function floorToMinute(value: Date): Date {
  const next = new Date(value);
  next.setSeconds(0, 0);
  return next;
}

export function assertValidBookingInstant(
  value: Date,
  label: 'Start' | 'End',
) {
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException(`Invalid ${label.toLowerCase()} date/time.`);
  }
}

export function assertBookingInstantNotPast(
  value: Date,
  label: 'Start' | 'End',
  at: Date = new Date(),
) {
  assertValidBookingInstant(value, label);
  const currentMinute = floorToMinute(at);
  if (value < currentMinute) {
    throw new BadRequestException(`${label} time cannot be in the past.`);
  }
}
