package app.stellwall.calendar

import app.stellwall.api.CalendarInstance
import app.stellwall.api.EventDto
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

enum class Scope(val query: String, val label: String) {
    One("one", "Nur dieser Termin"),
    Following("following", "Dieser und alle folgenden"),
    All("all", "Alle Termine der Serie"),
}

enum class Ask { Save, Delete }

/** What the event form holds; times are local wall times. */
data class EventDraft(
    val title: String,
    val allDay: Boolean,
    val startDate: LocalDate,
    val startTime: LocalTime,
    val endDate: LocalDate,
    val endTime: LocalTime,
    val location: String,
    val notes: String,
    val forWhom: List<String>,
    val seeAll: Boolean,
    val repeat: Repeat,
    val reminders: List<Int>,
)

/**
 * The web app's event form logic (web/src/pages/EventForm.tsx): a new event, or a change that names
 * which occurrences of a series it is meant for.
 */
object EventForms {
    const val INVALID = "Bitte die Eingaben prüfen."
    const val PICK_PERSON = "Wähle mindestens eine Person."
    const val END_BEFORE_START = "Das Ende liegt vor dem Anfang."

    private fun at(d: LocalDate, t: LocalTime, zone: ZoneId): Instant = LocalDateTime.of(d, t).atZone(zone).toInstant()
    private fun local(iso: String, zone: ZoneId) = Instant.parse(iso).atZone(zone)

    fun initial(ev: EventDto?, inst: CalendarInstance.Event?, defaultDate: LocalDate, meId: String, now: LocalDateTime, zone: ZoneId): EventDraft {
        if (ev == null) {
            val h = minOf(now.hour + 1, 22)
            return EventDraft("", false, defaultDate, LocalTime.of(h, 0), defaultDate, LocalTime.of(minOf(now.hour + 2, 23), 0), "", "", listOf(meId), false, Repeat.None, emptyList())
        }
        val start = local(inst?.start ?: ev.start, zone)
        val end = local(inst?.end ?: ev.end, zone)
        return EventDraft(
            title = inst?.title ?: ev.title,
            allDay = ev.allDay,
            startDate = if (inst != null) Days.dayOf(inst, zone) else LocalDate.parse(ev.startDate),
            startTime = if (ev.allDay) LocalTime.of(9, 0) else start.toLocalTime(),
            endDate = if (ev.allDay) LocalDate.parse(inst?.endDate ?: ev.endDate) else end.toLocalDate(),
            endTime = if (ev.allDay) LocalTime.of(10, 0) else end.toLocalTime(),
            location = inst?.location ?: ev.location,
            notes = ev.notes,
            forWhom = ev.forWhom,
            seeAll = ev.seeAll,
            repeat = Rules.kind(ev.rrule),
            reminders = ev.reminders,
        )
    }

    fun validate(d: EventDraft, zone: ZoneId = ZoneId.systemDefault()): String? = when {
        d.title.isBlank() -> INVALID
        d.forWhom.isEmpty() -> PICK_PERSON
        if (d.allDay) d.endDate.isBefore(d.startDate) else !at(d.endDate, d.endTime, zone).isAfter(at(d.startDate, d.startTime, zone)) -> END_BEFORE_START
        else -> null
    }

    private fun timeFields(d: EventDraft, startDate: LocalDate, endDate: LocalDate, start: Instant, end: Instant): Map<String, JsonPrimitive> =
        if (d.allDay) mapOf("allDay" to JsonPrimitive(true), "startDate" to JsonPrimitive(startDate.toString()), "endDate" to JsonPrimitive(endDate.toString()))
        else mapOf("allDay" to JsonPrimitive(false), "start" to JsonPrimitive(start.toString()), "end" to JsonPrimitive(end.toString()))

    /** A simple rule follows the start day; an end set earlier (a split series) stays. */
    private fun ruleFor(d: EventDraft, ev: EventDto?, startDate: LocalDate): String? = when (d.repeat) {
        Repeat.None -> null
        Repeat.Custom -> ev?.rrule
        else -> Rules.simple(d.repeat, startDate) + Rules.until(ev?.rrule)
    }

    private fun ints(l: List<Int>) = JsonArray(l.map { JsonPrimitive(it) })
    private fun strs(l: List<String>) = JsonArray(l.map { JsonPrimitive(it) })

    fun createBody(d: EventDraft, zone: ZoneId): JsonObject = buildJsonObject {
        put("title", JsonPrimitive(d.title.trim()))
        put("location", JsonPrimitive(d.location.trim()))
        put("notes", JsonPrimitive(d.notes.trim()))
        timeFields(d, d.startDate, d.endDate, at(d.startDate, d.startTime, zone), at(d.endDate, d.endTime, zone)).forEach { (k, v) -> put(k, v) }
        put("rrule", ruleFor(d, null, d.startDate)?.let { JsonPrimitive(it) } ?: JsonNull)
        put("forWhom", strs(d.forWhom))
        put("seeAll", JsonPrimitive(d.seeAll))
        put("reminders", ints(d.reminders))
    }

    private fun timesChanged(a: EventDraft, b: EventDraft) =
        a.allDay != b.allDay || a.startDate != b.startDate || a.endDate != b.endDate || (!b.allDay && (a.startTime != b.startTime || a.endTime != b.endTime))

    /** Notes, reminders, people, visibility and the rule belong to the whole series. */
    fun seriesOnly(start0: EventDraft, d: EventDraft) =
        d.notes.trim() != start0.notes || d.reminders != start0.reminders || d.forWhom != start0.forWhom || d.seeAll != start0.seeAll || d.repeat != start0.repeat || d.allDay != start0.allDay

    fun scopes(ask: Ask, isCreator: Boolean, seriesOnly: Boolean): List<Scope> = when {
        ask == Ask.Delete -> if (isCreator) Scope.entries else listOf(Scope.One)
        seriesOnly -> listOf(Scope.Following, Scope.All)
        else -> Scope.entries
    }

    fun updateBody(ev: EventDto, start0: EventDraft, d: EventDraft, scope: Scope, isCreator: Boolean, zone: ZoneId): JsonObject {
        val isSeries = ev.rrule != null
        val body = linkedMapOf<String, kotlinx.serialization.json.JsonElement>()
        if (d.title.trim() != start0.title) body["title"] = JsonPrimitive(d.title.trim())
        if (d.location.trim() != start0.location) body["location"] = JsonPrimitive(d.location.trim())
        if (scope != Scope.One) {
            if (d.notes.trim() != start0.notes) body["notes"] = JsonPrimitive(d.notes.trim())
            if (d.reminders != start0.reminders) body["reminders"] = ints(d.reminders)
            if (d.forWhom != start0.forWhom) body["forWhom"] = strs(d.forWhom)
            if (isCreator && d.seeAll != start0.seeAll) body["seeAll"] = JsonPrimitive(d.seeAll)
        }
        var seriesStart = if (scope == Scope.Following) d.startDate else LocalDate.parse(ev.startDate)
        if (timesChanged(start0, d)) {
            if (scope != Scope.All || !isSeries) {
                body.putAll(timeFields(d, d.startDate, d.endDate, at(d.startDate, d.startTime, zone), at(d.endDate, d.endTime, zone)))
            } else if (d.allDay) {
                // The whole series moves by the same amount as the occurrence that was edited.
                seriesStart = LocalDate.parse(ev.startDate).plusDays(ChronoUnit.DAYS.between(start0.startDate, d.startDate))
                val end = seriesStart.plusDays(ChronoUnit.DAYS.between(d.startDate, d.endDate))
                body.putAll(timeFields(d, seriesStart, end, Instant.EPOCH, Instant.EPOCH))
            } else {
                val base = if (d.allDay != start0.allDay) at(LocalDate.parse(ev.startDate), d.startTime, zone)
                else Instant.parse(ev.start).plus(Duration.between(at(start0.startDate, start0.startTime, zone), at(d.startDate, d.startTime, zone)))
                val len = Duration.between(at(d.startDate, d.startTime, zone), at(d.endDate, d.endTime, zone))
                seriesStart = base.atZone(zone).toLocalDate()
                body.putAll(timeFields(d, seriesStart, seriesStart, base, base.plus(len)))
            }
        }
        if (scope != Scope.One) {
            val rule = ruleFor(d, ev, seriesStart)
            if (rule != ev.rrule) body["rrule"] = rule?.let { JsonPrimitive(it) } ?: JsonNull
        }
        return JsonObject(body)
    }
}
