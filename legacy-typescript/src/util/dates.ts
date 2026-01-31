import { errorAt } from "../diagnostics/errors.js";

export type DateValue = { year: number; month: number; day: number };

export function parseDateLiteral(text: string, line: number): DateValue {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text);
  if (!match) {
    throw errorAt("TypeError", line, "Invalid date format.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidDate(year, month, day)) {
    throw errorAt("RangeError", line, "Invalid date value.");
  }
  return { year, month, day };
}

export function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

export function isLeap(year: number): boolean {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

export function dateToString(date: DateValue): string {
  const y = date.year.toString().padStart(4, "0");
  const m = date.month.toString().padStart(2, "0");
  const d = date.day.toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function compareDate(a: DateValue, b: DateValue): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function toDayNumber(date: DateValue): number {
  let days = 0;
  for (let y = 1; y < date.year; y += 1) {
    days += isLeap(y) ? 366 : 365;
  }
  const daysInMonth = [31, isLeap(date.year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m < date.month; m += 1) {
    days += daysInMonth[m - 1];
  }
  days += date.day - 1;
  return days;
}

export function fromDayNumber(dayNum: number): DateValue {
  let year = 1;
  while (true) {
    const daysInYear = isLeap(year) ? 366 : 365;
    if (dayNum >= daysInYear) {
      dayNum -= daysInYear;
      year += 1;
      continue;
    }
    break;
  }
  const daysInMonth = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 1;
  while (dayNum >= daysInMonth[month - 1]) {
    dayNum -= daysInMonth[month - 1];
    month += 1;
  }
  const day = dayNum + 1;
  return { year, month, day };
}
