package app.stellwall.api

import kotlinx.serialization.Serializable

/** One entry in the calendar for a range: an event occurrence or a birthday. */
sealed interface CalendarInstance {
    /** Local date of the occurrence in its series (the key for changes to one occurrence). */
    val date: String
    val start: String
    val allDay: Boolean
    /** Last day of an all-day entry, inclusive. */
    val endDate: String
    val title: String

    @Serializable
    data class Event(
        val eventId: String,
        override val date: String,
        override val start: String,
        val end: String,
        override val allDay: Boolean,
        override val endDate: String,
        override val title: String,
        val location: String,
        val forWhom: List<String>,
        val series: Boolean,
        val createdBy: String,
        val changed: Boolean,
    ) : CalendarInstance

    @Serializable
    data class Birthday(
        val birthdayId: String,
        override val date: String,
        override val start: String,
        override val allDay: Boolean = true,
        override val endDate: String,
        override val title: String,
        val age: Int?,
    ) : CalendarInstance
}

@Serializable
data class EventDto(
    val id: String,
    val title: String,
    val location: String,
    val notes: String,
    val allDay: Boolean,
    val start: String,
    val end: String,
    val startDate: String,
    val endDate: String,
    val rrule: String?,
    val forWhom: List<String>,
    val seeAll: Boolean,
    val createdBy: String,
    val reminders: List<Int>,
    val imported: Boolean,
)

@Serializable
data class Birthday(
    val id: String,
    val name: String,
    val month: Int,
    val day: Int,
    val year: Int?,
    val visibility: Visibility,
    val remindDays: Int,
    val remindWho: List<String>,
    val createdBy: String,
)

@Serializable
data class BirthdayChange(
    val name: String,
    val day: Int,
    val month: Int,
    val year: Int?,
    val remindDays: Int,
    val remindWho: List<String>,
    /** Only the creator may send it. */
    val visibility: Visibility? = null,
)
