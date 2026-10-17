# NYSE session-calendar coverage

The local calendar contains explicit dates for 2026–2031. Years outside this table remain unknown and stock sessions stay closed. Configurable closure and early-close overrides still apply within covered years.

As checked on 2026-10-14, the [NYSE calendar](https://www.nyse.com/trade/hours-calendars) and [NYSE Group announcement](https://ir.theice.com/press/news-details/2025/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/default.aspx) publish annual schedules through 2028. **2029–2031 are standing-rule dates and early-close-pattern projections, pending annual NYSE confirmation**, not published annual schedules. `session().calendarBasis` and the server calendar status expose that distinction. Update the explicit entries when NYSE publishes annual schedules or exceptional closures.

Holiday basis: NYSE Rule 7.2 in the [NYSE rules](https://www.nyse.com/publicdocs/nyse/regulation/nyse/NYSE_Rules.pdf), together with the [Juneteenth holiday rule filing](https://www.nyse.com/publicdocs/nyse/markets/nyse/rule-filings/filings/2021/SR-NYSE-2021-56.pdf). Holidays follow New Year's Day, third Monday of January, third Monday of February, Good Friday, last Monday of May, Juneteenth, Independence Day, first Monday of September, fourth Thursday of November and Christmas, with exchange observance rules. Good Friday is two days before Gregorian Easter.

| Year | Holiday dates (month-day) | Expected 13:00 ET closes |
| --- | --- | --- |
| 2029 | 01-01, 01-15, 02-19, 03-30, 05-28, 06-19, 07-04, 09-03, 11-22, 12-25 | July 3; November 23; December 24 |
| 2030 | 01-01, 01-21, 02-18, 04-19, 05-27, 06-19, 07-04, 09-02, 11-28, 12-25 | July 3; November 29; December 24 |
| 2031 | 01-01, 01-20, 02-17, 04-11, 05-26, 06-19, 07-04, 09-01, 11-27, 12-25 | July 3; November 28; December 24 |

The projected early closes follow the published pattern of July 3, Friday after Thanksgiving and Christmas Eve when those dates are trading weekdays. Annual confirmation is required. Session exits use one minute before the configured close (15:59 normally, 12:59 on a 13:00 close).
