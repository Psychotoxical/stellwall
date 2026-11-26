package app.stellwall.api

import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** What the app needs from a server for signing in; the tests use a fake. */
interface Backend {
    suspend fun login(username: String, password: String): Member
    suspend fun me(): Member?
    suspend fun logout()
}

/** Start and shopping. */
interface ShoppingApi {
    suspend fun members(): List<Member>
    suspend fun board(): List<BoardRow>
    suspend fun boardSeen()
    suspend fun lists(): List<ShoppingList>
    suspend fun createList(name: String, visibility: Visibility): ShoppingList
    suspend fun updateList(id: String, name: String? = null, visibility: Visibility? = null): ShoppingList
    suspend fun deleteList(id: String)
    suspend fun items(listId: String): List<Item>
    suspend fun addItem(listId: String, name: String, quantity: String, category: String?): Item
    suspend fun updateItem(id: String, change: ItemChange): Item
    suspend fun deleteItem(id: String)
    suspend fun suggestions(q: String): List<Suggestion>
}

/** Calendar and birthdays. Bodies of events are built by the form logic, so they travel as JSON. */
interface CalendarApi {
    suspend fun members(): List<Member>
    suspend fun calendar(from: Instant, to: Instant, mine: Boolean): List<CalendarInstance>
    suspend fun event(id: String): EventDto
    suspend fun createEvent(body: JsonObject): EventDto
    suspend fun updateEvent(id: String, scope: String, date: String?, body: JsonObject): EventDto
    suspend fun deleteEvent(id: String, scope: String, date: String?)
    suspend fun birthdays(): List<Birthday>
    suspend fun createBirthday(body: BirthdayChange): Birthday
    suspend fun updateBirthday(id: String, body: BirthdayChange): Birthday
    suspend fun deleteBirthday(id: String)
}

/** Talks to one Stellwall server; the session lives in [store]. */
class ApiClient(private val base: HttpUrl, store: CookieStore) : Backend, ShoppingApi, CalendarApi {
    private val jar = SessionCookieJar(store)
    private val http = OkHttpClient.Builder()
        .cookieJar(jar)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        // The server's CSRF check: requests that change something carry this header.
        .addInterceptor { it.proceed(it.request().newBuilder().header("X-Stellwall", "1").build()) }
        .build()

    override suspend fun login(username: String, password: String): Member =
        call("POST", "api/auth/login", encode(Credentials.serializer(), Credentials(username, password))).decode(Member.serializer())

    /** The signed-in member, or null when the session is gone. */
    override suspend fun me(): Member? = try {
        call("GET", "api/me").decode(Member.serializer())
    } catch (e: ApiException) {
        if (e.status == 401) null else throw e
    }

    /** Signs out on the server if it answers; the cookie is forgotten either way. */
    override suspend fun logout() {
        try {
            call("POST", "api/auth/logout", "{}")
        } catch (_: IOException) {
        } catch (_: ApiException) {
        } finally {
            jar.clear()
        }
    }

    override suspend fun members() = call("GET", "api/members").decode(ListSerializer(Member.serializer()))

    /** Rows of a kind this app version does not know yet are left out. */
    override suspend fun board(): List<BoardRow> = (json.parseToJsonElement(call("GET", "api/board")) as JsonArray).mapNotNull { row ->
        when ((row as? JsonObject)?.get("kind")?.jsonPrimitive?.contentOrNull) {
            "shopping" -> json.decodeFromJsonElement(BoardRow.Shopping.serializer(), row)
            "todo" -> json.decodeFromJsonElement(BoardRow.Todo.serializer(), row)
            "event" -> json.decodeFromJsonElement(BoardRow.Event.serializer(), row)
            else -> null
        }
    }

    override suspend fun boardSeen() {
        call("POST", "api/board/seen", "{}")
    }

    override suspend fun lists() = call("GET", "api/lists").decode(ListSerializer(ShoppingList.serializer()))

    override suspend fun createList(name: String, visibility: Visibility) =
        call("POST", "api/lists", encode(NewList.serializer(), NewList(name, visibility))).decode(ShoppingList.serializer())

    override suspend fun updateList(id: String, name: String?, visibility: Visibility?) =
        call("PATCH", "api/lists/${seg(id)}", encode(ListChange.serializer(), ListChange(name, visibility))).decode(ShoppingList.serializer())

    override suspend fun deleteList(id: String) {
        call("DELETE", "api/lists/${seg(id)}")
    }

    override suspend fun items(listId: String) = call("GET", "api/lists/${seg(listId)}/items").decode(ListSerializer(Item.serializer()))

    override suspend fun addItem(listId: String, name: String, quantity: String, category: String?) =
        call("POST", "api/lists/${seg(listId)}/items", encode(NewItem.serializer(), NewItem(name, quantity.ifBlank { null }, category))).decode(Item.serializer())

    override suspend fun updateItem(id: String, change: ItemChange) =
        call("PATCH", "api/items/${seg(id)}", encode(ItemChange.serializer(), change)).decode(Item.serializer())

    override suspend fun deleteItem(id: String) {
        call("DELETE", "api/items/${seg(id)}")
    }

    override suspend fun suggestions(q: String): List<Suggestion> {
        val url = base.newBuilder().addPathSegments("api/suggestions").addQueryParameter("q", q).build()
        return send("GET", url, null).decode(ListSerializer(Suggestion.serializer()))
    }

    /** Rows of a kind this app version does not know yet are left out. */
    override suspend fun calendar(from: Instant, to: Instant, mine: Boolean): List<CalendarInstance> {
        val url = base.newBuilder().addPathSegments("api/calendar")
            .addQueryParameter("from", from.toString()).addQueryParameter("to", to.toString())
            .apply { if (mine) addQueryParameter("mine", "1") }.build()
        return (json.parseToJsonElement(send("GET", url, null)) as JsonArray).mapNotNull { row ->
            when ((row as? JsonObject)?.get("kind")?.jsonPrimitive?.contentOrNull) {
                "event" -> json.decodeFromJsonElement(CalendarInstance.Event.serializer(), row)
                "birthday" -> json.decodeFromJsonElement(CalendarInstance.Birthday.serializer(), row)
                else -> null
            }
        }
    }

    override suspend fun event(id: String) = call("GET", "api/events/${seg(id)}").decode(EventDto.serializer())

    override suspend fun createEvent(body: JsonObject) = call("POST", "api/events", body.toString()).decode(EventDto.serializer())

    private fun eventUrl(id: String, scope: String, date: String?) = base.newBuilder().addPathSegments("api/events").addPathSegment(id)
        .addQueryParameter("scope", scope).apply { if (date != null) addQueryParameter("date", date) }.build()

    override suspend fun updateEvent(id: String, scope: String, date: String?, body: JsonObject) =
        send("PATCH", eventUrl(id, scope, date), body.toString()).decode(EventDto.serializer())

    override suspend fun deleteEvent(id: String, scope: String, date: String?) {
        send("DELETE", eventUrl(id, scope, date), null)
    }

    override suspend fun birthdays() = call("GET", "api/birthdays").decode(ListSerializer(Birthday.serializer()))

    override suspend fun createBirthday(body: BirthdayChange) =
        call("POST", "api/birthdays", encode(BirthdayChange.serializer(), body)).decode(Birthday.serializer())

    override suspend fun updateBirthday(id: String, body: BirthdayChange) =
        call("PATCH", "api/birthdays/${seg(id)}", encode(BirthdayChange.serializer(), body)).decode(Birthday.serializer())

    override suspend fun deleteBirthday(id: String) {
        call("DELETE", "api/birthdays/${seg(id)}")
    }

    /**
     * Change hints for as long as it is collected. A dropped connection is opened again,
     * waiting a little longer each time (up to 30 s); each new connection starts with [LiveEvent.Connected].
     */
    fun live(retryMs: Long = 1000): Flow<LiveEvent> = flow {
        var wait = retryMs
        while (true) {
            var opened = false
            liveOnce().collect {
                if (it == LiveEvent.Connected) {
                    opened = true
                    wait = retryMs
                }
                emit(it)
            }
            delay(wait)
            if (!opened) wait = minOf(wait * 2, 30_000)
        }
    }

    private fun liveOnce(): Flow<LiveEvent> = callbackFlow {
        val req = Request.Builder().url(base.resolve("api/live")!!).build()
        val ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return
                val event = when (msg["type"]?.jsonPrimitive?.contentOrNull) {
                    "hello" -> LiveEvent.Connected
                    "list" -> msg["id"]?.jsonPrimitive?.contentOrNull?.let { LiveEvent.List(it) }
                    "lists" -> LiveEvent.Lists
                    "calendar" -> LiveEvent.Calendar
                    "todos" -> LiveEvent.Todos
                    "meals" -> LiveEvent.Meals
                    else -> null
                }
                if (event != null) trySend(event)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                channel.close()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                channel.close()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                channel.close()
            }
        })
        awaitClose { ws.cancel() }
    }

    private fun seg(id: String) = HttpUrl.Builder().scheme("http").host("x").addPathSegment(id).build().encodedPathSegments[0]

    private fun <T> encode(s: KSerializer<T>, value: T) = json.encodeToString(s, value)

    private fun <T> String.decode(s: KSerializer<T>): T = json.decodeFromString(s, this)

    private suspend fun call(method: String, path: String, body: String? = null) = send(method, base.resolve(path)!!, body)

    private suspend fun send(method: String, url: HttpUrl, body: String?): String = withContext(Dispatchers.IO) {
        // OkHttp wants a body for these methods, even an empty one.
        val payload = body ?: if (method == "POST" || method == "PATCH") "{}" else null
        val req = Request.Builder().url(url).method(method, payload?.toRequestBody(JSON)).build()
        http.newCall(req).execute().use { res ->
            val text = res.body.string()
            if (!res.isSuccessful) {
                val err = runCatching { json.decodeFromString(ErrorBody.serializer(), text) }.getOrDefault(ErrorBody())
                throw ApiException(res.code, err.error, err.until)
            }
            text
        }
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        internal val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }
    }
}
