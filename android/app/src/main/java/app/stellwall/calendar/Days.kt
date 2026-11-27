package app.stellwall.calendar

import app.stellwall.api.CalendarInstance
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class View(val label: String) { Month("Monat"), Week("Woche"), Upcoming("Demnächst") }

enum class Repeat(val label: String) { None("Nie"), Weekly("Wöchentlich"), Biweekly("Alle 2 Wochen"), Monthly("Monatlich"), Yearly("Jährlich"), Custom("") }

/** The simple repeat rules of the web app (shared/src/calendar/expand.ts), so both write the same RRULE. */
object Rules {
    private val codes = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")
    private val names = listOf("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")

    fun simple(kind: Repeat, start: LocalDate): String {
        val wd = codes[start.dayOfWeek.value - 1]
        return when (kind) {
            Repeat.Weekly -> "FREQ=WEEKLY;BYDAY=$wd"
            Repeat.Biweekly -> "FREQ=WEEKLY;INTERVAL=2;BYDAY=$wd"
            Repeat.Monthly -> "FREQ=MONTHLY;BYMONTHDAY=${start.dayOfMonth}"
            else -> "FREQ=YEARLY"
        }
    }

    fun kind(rrule: String?): Repeat {
        if (rrule == null) return Repeat.None
        val r = rrule.replace(Regex(";UNTIL=[^;]+"), "")
        return when {
            Regex("^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$").matches(r) -> Repeat.Weekly
            Regex("^FREQ=WEEKLY;INTERVAL=2;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$").matches(r) -> Repeat.Biweekly
            Regex("^FREQ=MONTHLY;BYMONTHDAY=\\d{1,2}$").matches(r) -> Repeat.Monthly
            r == "FREQ=YEARLY" -> Repeat.Yearly
            else -> Repeat.Custom
        }
    }

    fun describe(rrule: String): String {
        val day = names.getOrElse(codes.indexOf(Regex("BYDAY=([A-Z]{2})").find(rrule)?.groupValues?.get(1))) { "" }
        return when (kind(rrule)) {
            Repeat.Weekly -> "jeden $day"
            Repeat.Biweekly -> "alle 2 Wochen am $day"
            Repeat.Monthly -> "monatlich am ${Regex("BYMONTHDAY=(\\d+)").find(rrule)!!.groupValues[1]}."
            Repeat.Yearly -> "jährlich"
            else -> "eigene Wiederholung"
        }
    }

    /** The end of a series that was split earlier, so a changed rule keeps it. */
    fun until(rrule: String?): String = rrule?.let { Regex(";UNTIL=[^;]+").find(it)?.value }.orEmpty()
}

/** Calendar days in the device's zone, as the web app shows them. */
object Days {
    private val de = Locale.GERMAN
    const val UPCOMING_DAYS = 30L

    fun weekStart(d: LocalDate): LocalDate = d.minusDays((d.dayOfWeek.value - DayOfWeek.MONDAY.value).toLong())

    /** The dates a view fetches: [from, to). */
    fun range(view: View, sel: LocalDate, today: LocalDate): Pair<LocalDate, LocalDate> = when (view) {
        View.Month -> weekStart(sel.withDayOfMonth(1)).let { it to it.plusDays(42) }
        View.Week -> weekStart(sel).let { it to it.plusDays(7) }
        View.Upcoming -> today to today.plusDays(UPCOMING_DAYS)
    }

    fun instant(d: LocalDate, zone: ZoneId): Instant = d.atStartOfDay(zone).toInstant()

    /** The local day an entry takes place on (a moved occurrence keeps its series date as key). */
    fun dayOf(i: CalendarInstance, zone: ZoneId): LocalDate = Instant.parse(i.start).atZone(zone).toLocalDate()

    fun datesOf(i: CalendarInstance, zone: ZoneId): List<LocalDate> {
        val first = dayOf(i, zone)
        if (!i.allDay) return listOf(first)
        val last = LocalDate.parse(i.endDate)
        return generateSequence(first) { it.plusDays(1) }.takeWhile { !it.isAfter(last) }.take(62).toList()
    }

    fun byDay(list: List<CalendarInstance>, zone: ZoneId): Map<LocalDate, List<CalendarInstance>> {
        val m = mutableMapOf<LocalDate, MutableList<CalendarInstance>>()
        for (i in list) for (d in datesOf(i, zone)) m.getOrPut(d) { mutableListOf() } += i
        return m.mapValues { (_, v) -> v.sortedWith(compareByDescending<CalendarInstance> { it.allDay }.thenBy { it.start }) }
    }

    fun hhmm(iso: String, zone: ZoneId = ZoneId.systemDefault()): String = DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(iso).atZone(zone))
    fun dayLabel(d: LocalDate): String = DateTimeFormatter.ofPattern("EEEE, d. MMMM", de).format(d)
    fun monthTitle(d: LocalDate): String = DateTimeFormatter.ofPattern("MMMM yyyy", de).format(d)
    fun weekTitle(start: LocalDate): String = DateTimeFormatter.ofPattern("d. MMM", de).let { "${it.format(start)} – ${it.format(start.plusDays(6))}" }
    fun weekdayShort(d: LocalDate): String = DateTimeFormatter.ofPattern("EE", de).format(d).removeSuffix(".")
    fun monthShort(d: LocalDate): String = DateTimeFormatter.ofPattern("MMM", de).format(d).removeSuffix(".")
    fun dateShort(d: LocalDate): String = DateTimeFormatter.ofPattern("EE, d.M.yyyy", de).format(d)
}
