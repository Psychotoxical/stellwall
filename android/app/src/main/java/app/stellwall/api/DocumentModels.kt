package app.stellwall.api

import kotlinx.serialization.Serializable

@Serializable
data class DocumentDto(
    val id: String,
    val name: String,
    val category: String? = null,
    val validUntil: String? = null,
    val remindDays: Int = 30,
    val visibility: Visibility,
    val createdBy: String,
    val createdAt: String,
    val updatedAt: String,
    val mime: String,
    val size: Long,
    val pages: Int? = null,
    /** "pending" while the text is being read, "done", or "failed". */
    val ocr: String,
    /** A piece of the recognized text around a search hit, the hit in « ». */
    val snippet: String? = null,
)

/** What is sent with a new file, and what can be changed later (visibility only by the creator). */
@Serializable
data class DocumentMeta(
    val name: String,
    val category: String?,
    val validUntil: String?,
    val remindDays: Int,
    val visibility: Visibility? = null,
)

/** A file picked or scanned on the phone, read into memory (at most 30 MB). */
class DocumentFile(val name: String, val mime: String, val bytes: ByteArray)
