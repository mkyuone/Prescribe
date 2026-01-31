using System.Text.RegularExpressions;
using Prescribe.Core.Diagnostics;

namespace Prescribe.Core.Util;

public readonly record struct DateValue(int Year, int Month, int Day);

public static class DateUtil
{
    private static readonly Regex DateRegex = new Regex("^([0-9]{4})-([0-9]{2})-([0-9]{2})$", RegexOptions.Compiled);

    public static DateValue ParseDateLiteral(string text, int line)
    {
        var match = DateRegex.Match(text);
        if (!match.Success)
        {
            throw Errors.At(ErrorType.TypeError, line, "Invalid date format.");
        }
        var year = int.Parse(match.Groups[1].Value);
        var month = int.Parse(match.Groups[2].Value);
        var day = int.Parse(match.Groups[3].Value);
        if (!IsValidDate(year, month, day))
        {
            throw Errors.At(ErrorType.RangeError, line, "Invalid date value.");
        }
        return new DateValue(year, month, day);
    }

    public static bool IsValidDate(int year, int month, int day)
    {
        if (year < 1 || year > 9999) return false;
        if (month < 1 || month > 12) return false;
        var daysInMonth = new[] { 31, IsLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        return day >= 1 && day <= daysInMonth[month - 1];
    }

    public static bool IsLeap(int year)
    {
        if (year % 400 == 0) return true;
        if (year % 100 == 0) return false;
        return year % 4 == 0;
    }

    public static string DateToString(DateValue date)
    {
        return $"{date.Year:D4}-{date.Month:D2}-{date.Day:D2}";
    }

    public static int CompareDate(DateValue a, DateValue b)
    {
        if (a.Year != b.Year) return a.Year - b.Year;
        if (a.Month != b.Month) return a.Month - b.Month;
        return a.Day - b.Day;
    }

    public static int ToDayNumber(DateValue date)
    {
        var days = 0;
        for (var y = 1; y < date.Year; y += 1)
        {
            days += IsLeap(y) ? 366 : 365;
        }
        var daysInMonth = new[] { 31, IsLeap(date.Year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        for (var m = 1; m < date.Month; m += 1)
        {
            days += daysInMonth[m - 1];
        }
        days += date.Day - 1;
        return days;
    }

    public static DateValue FromDayNumber(int dayNum)
    {
        var year = 1;
        while (true)
        {
            var daysInYear = IsLeap(year) ? 366 : 365;
            if (dayNum >= daysInYear)
            {
                dayNum -= daysInYear;
                year += 1;
                continue;
            }
            break;
        }
        var daysInMonth = new[] { 31, IsLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        var month = 1;
        while (dayNum >= daysInMonth[month - 1])
        {
            dayNum -= daysInMonth[month - 1];
            month += 1;
        }
        var day = dayNum + 1;
        return new DateValue(year, month, day);
    }
}
