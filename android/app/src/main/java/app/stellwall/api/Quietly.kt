package app.stellwall.api

import kotlinx.coroutines.CancellationException

/**
 * Runs a call whose failure does not matter (a hint, a suggestion list) and gives null on errors.
 * Unlike runCatching it lets cancellation through, so a closed page really stops its work.
 */
suspend fun <T> quietly(block: suspend () -> T): T? = try {
    block()
} catch (e: CancellationException) {
    throw e
} catch (_: Exception) {
    null
}
