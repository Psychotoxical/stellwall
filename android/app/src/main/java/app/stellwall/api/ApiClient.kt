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
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** What the app needs from a server for signing in; the tests use a fake. */
interface Backend {
    suspend fun login(username: String, password: String): Member
    suspend fun me(): Member?

    /** [pushEndpoint]: this phone's push registration, removed on the server along with the session. */
    suspend fun logout(pushEndpoint: String? = null)
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
    suspend fun clearList(id: String)
    suspend fun items(listId: String): List<Item>
    suspend fun addItem(listId: String, name: String, quantity: String, category: String?): Item
    suspend fun updateItem(id: String, change: ItemChange): Item
    suspend fun deleteItem(id: String)
    suspend fun suggestions(q: String): List<Suggestion>
}

/** Documents: list and search, upload, the file itself. */
interface DocumentsApi {
    suspend fun members(): List<Member>
    suspend fun documents(q: String, category: String?): List<DocumentDto>
    suspend fun document(id: String): DocumentDto
    suspend fun documentCategories(): List<String>
    suspend fun uploadDocument(meta: DocumentMeta, file: DocumentFile): DocumentDto
    suspend fun updateDocument(id: String, meta: DocumentMeta): DocumentDto
    suspend fun deleteDocument(id: String)
    /** Writes the file to [to] and returns it. */
    suspend fun documentFile(id: String, to: java.io.File): java.io.File
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

/** The meal plan, recipes from Mealie and the pantry. */
interface MealsApi {
    suspend fun members(): List<Member>
    suspend fun meals(week: String): List<Meal>
    suspend fun saveMeal(date: String, body: MealBody): Meal
    suspend fun deleteMeal(date: String)
    suspend fun recipes(q: String): List<RecipeSummary>
    suspend fun recipe(slug: String): Recipe
    suspend fun recipeImage(id: String): ByteArray
    suspend fun shopPreview(dates: List<String>, servings: Int?): ShopPreview
    suspend fun shopCommit(lines: List<ShopLine>): CommitResult
    suspend fun pantry(): List<Staple>
    suspend fun addStaple(name: String): Staple
    suspend fun deleteStaple(id: String)
}

interface TodosApi {
    suspend fun members(): List<Member>
    suspend fun todos(view: String, mine: Boolean): List<Occurrence>
    suspend fun todo(id: String): TodoRule
    suspend fun createTodo(body: TodoBody): TodoRule
    suspend fun updateTodo(id: String, body: TodoBody): TodoRule
    suspend fun deleteTodo(id: String)
    suspend fun done(id: String, date: String)
    suspend fun undone(id: String, date: String)
    suspend fun todoSuggestions(q: String): List<String>
}

/** Talks to one Stellwall server; the session lives in [store]. */
class ApiClient(private val base: HttpUrl, store: CookieStore) : Backend, ShoppingApi, CalendarApi, MealsApi, TodosApi, AccountApi, DocumentsApi {
    private val jar = SessionCookieJar(store)
    private val http = OkHttpClient.Builder()
        .cookieJar(jar)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        // The server's CSRF check: requests that change something carry this header.
        .addInterceptor { it.proceed(it.request().newBuilder().header("X-Stellwall", "1").build()) }
        .build()

    /**
     * The live connection pings every 30 s: a link that died without closing (Wi-Fi to mobile data)
     * fails then and is opened again, instead of hanging while the app stays in front.
     */
    internal val liveClient: OkHttpClient by lazy { http.newBuilder().pingInterval(30, TimeUnit.SECONDS).build() }

    override suspend fun login(username: String, password: String): Member =
        call("POST", "api/auth/login", encode(Credentials.serializer(), Credentials(username, password))).decode(Member.serializer())

    /** The signed-in member, or null when the session is gone. */
    override suspend fun me(): Member? = try {
        call("GET", "api/me").decode(Member.serializer())
    } catch (e: ApiException) {
        if (e.status == 401) null else throw e
    }

    /** Signs out on the server if it answers; the cookie is forgotten either way. */
    override suspend fun logout(pushEndpoint: String?) {
        try {
            call("POST", "api/auth/logout", encode(LogoutBody.serializer(), LogoutBody(pushEndpoint)))
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

    override suspend fun clearList(id: String) {
        call("DELETE", "api/lists/${seg(id)}/items")
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

    private fun url(path: String, vararg query: Pair<String, String>) =
        base.newBuilder().addPathSegments(path).apply { for ((k, v) in query) addQueryParameter(k, v) }.build()

    override suspend fun meals(week: String) = send("GET", url("api/meals", "week" to week), null).decode(ListSerializer(Meal.serializer()))

    override suspend fun saveMeal(date: String, body: MealBody): Meal {
        // Both keys must be there, one of them null: encode with nulls for this body.
        val text = Json { explicitNulls = true }.encodeToString(MealBody.serializer(), body)
        return call("PUT", "api/meals/${seg(date)}", text).decode(Meal.serializer())
    }

    override suspend fun deleteMeal(date: String) {
        call("DELETE", "api/meals/${seg(date)}")
    }

    override suspend fun recipes(q: String) = send("GET", url("api/recipes", "q" to q), null).decode(ListSerializer(RecipeSummary.serializer()))

    override suspend fun recipe(slug: String) = call("GET", "api/recipes/${seg(slug)}").decode(Recipe.serializer())

    override suspend fun recipeImage(id: String): ByteArray = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(base.resolve("api/recipes/${seg(id)}/image")!!).build()).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "")
            res.body.bytes()
        }
    }

    override suspend fun shopPreview(dates: List<String>, servings: Int?) =
        call("POST", "api/meals/shopping/preview", encode(ShopRequest.serializer(), ShopRequest(dates, servings))).decode(ShopPreview.serializer())

    override suspend fun shopCommit(lines: List<ShopLine>) =
        call("POST", "api/meals/shopping/commit", encode(CommitRequest.serializer(), CommitRequest(lines.map { CommitLine(it.food, it.quantity) }))).decode(CommitResult.serializer())

    override suspend fun pantry() = call("GET", "api/pantry").decode(ListSerializer(Staple.serializer()))

    override suspend fun addStaple(name: String) = call("POST", "api/pantry", encode(NewStaple.serializer(), NewStaple(name))).decode(Staple.serializer())

    override suspend fun deleteStaple(id: String) {
        call("DELETE", "api/pantry/${seg(id)}")
    }

    override suspend fun todos(view: String, mine: Boolean) =
        send("GET", url("api/todos", *listOfNotNull("view" to view, if (mine) "mine" to "1" else null).toTypedArray()), null).decode(ListSerializer(Occurrence.serializer()))

    override suspend fun todo(id: String) = call("GET", "api/todos/${seg(id)}").decode(TodoRule.serializer())

    /** Nulls are sent: an empty date or time is a change too. */
    private fun todoJson(body: TodoBody): String {
        val o = Json { explicitNulls = true }.encodeToJsonElement(TodoBody.serializer(), body) as JsonObject
        return JsonObject(o.filter { (k, v) -> !(k == "visibility" && v is kotlinx.serialization.json.JsonNull) }).toString()
    }

    override suspend fun createTodo(body: TodoBody) = call("POST", "api/todos", todoJson(body)).decode(TodoRule.serializer())

    override suspend fun updateTodo(id: String, body: TodoBody) = call("PATCH", "api/todos/${seg(id)}", todoJson(body)).decode(TodoRule.serializer())

    override suspend fun deleteTodo(id: String) {
        call("DELETE", "api/todos/${seg(id)}")
    }

    override suspend fun done(id: String, date: String) {
        call("POST", "api/todos/${seg(id)}/done", encode(DoneRequest.serializer(), DoneRequest(date)))
    }

    override suspend fun undone(id: String, date: String) {
        call("DELETE", "api/todos/${seg(id)}/done/${seg(date)}")
    }

    override suspend fun todoSuggestions(q: String) =
        send("GET", url("api/todo-suggestions", "q" to q), null).decode(ListSerializer(NameOnly.serializer())).map { it.name }

    override suspend fun updateMember(id: String, change: MemberChange) =
        call("PATCH", "api/members/${seg(id)}", encode(MemberChange.serializer(), change)).decode(Member.serializer())

    override suspend fun changePassword(current: String, next: String) {
        call("POST", "api/me/password", encode(PasswordChange.serializer(), PasswordChange(current, next)))
    }

    override suspend fun notificationPrefs(): Map<String, Boolean> =
        (json.parseToJsonElement(call("GET", "api/notification-prefs")) as JsonObject).mapValues { (_, v) -> v.jsonPrimitive.content == "true" }

    override suspend fun setNotificationPref(kind: String, on: Boolean) {
        call("PUT", "api/notification-prefs", JsonObject(mapOf(kind to kotlinx.serialization.json.JsonPrimitive(on))).toString())
    }

    override suspend fun pushDevices() = call("GET", "api/push/subscriptions").decode(ListSerializer(PushDevice.serializer()))

    override suspend fun deletePushDevice(id: String) {
        call("DELETE", "api/push/subscriptions/${seg(id)}")
    }

    override suspend fun registerFcm(token: String, label: String) {
        call("POST", "api/push/fcm", encode(FcmRegistration.serializer(), FcmRegistration(token, label)))
    }

    override suspend fun pushTest() = call("POST", "api/push/test", "{}").decode(DeviceCount.serializer()).devices

    override suspend fun documents(q: String, category: String?): List<DocumentDto> {
        val u = base.newBuilder().addPathSegments("api/documents")
        if (q.isNotBlank()) u.addQueryParameter("q", q.trim())
        if (category != null) u.addQueryParameter("category", category)
        return send("GET", u.build(), null).decode(ListSerializer(DocumentDto.serializer()))
    }

    override suspend fun document(id: String) = call("GET", "api/documents/${seg(id)}").decode(DocumentDto.serializer())

    override suspend fun documentCategories() = call("GET", "api/document-categories").decode(ListSerializer(String.serializer()))

    override suspend fun uploadDocument(meta: DocumentMeta, file: DocumentFile): DocumentDto = withContext(Dispatchers.IO) {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("meta", metaJson(meta))
            .addFormDataPart("file", file.name, file.bytes.toRequestBody(file.mime.toMediaType()))
            .build()
        val req = Request.Builder().url(base.resolve("api/documents")!!).post(body).build()
        http.newBuilder().writeTimeout(2, TimeUnit.MINUTES).readTimeout(2, TimeUnit.MINUTES).build().newCall(req).execute().use { res ->
            val text = res.body.string()
            if (!res.isSuccessful) {
                val err = runCatching { json.decodeFromString(ErrorBody.serializer(), text) }.getOrDefault(ErrorBody())
                throw ApiException(res.code, err.error, err.until)
            }
            json.decodeFromString(DocumentDto.serializer(), text)
        }
    }

    override suspend fun updateDocument(id: String, meta: DocumentMeta) =
        call("PATCH", "api/documents/${seg(id)}", metaJson(meta)).decode(DocumentDto.serializer())

    /** Category and date go as null when cleared; visibility only when it may be changed. */
    private fun metaJson(m: DocumentMeta): String = kotlinx.serialization.json.buildJsonObject {
        put("name", kotlinx.serialization.json.JsonPrimitive(m.name))
        put("category", kotlinx.serialization.json.JsonPrimitive(m.category))
        put("validUntil", kotlinx.serialization.json.JsonPrimitive(m.validUntil))
        put("remindDays", kotlinx.serialization.json.JsonPrimitive(m.remindDays))
        m.visibility?.let { put("visibility", json.encodeToJsonElement(Visibility.serializer(), it)) }
    }.toString()

    override suspend fun deleteDocument(id: String) {
        call("DELETE", "api/documents/${seg(id)}")
    }

    override suspend fun documentFile(id: String, to: java.io.File): java.io.File = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base.resolve("api/documents/${seg(id)}/file")!!).build()
        http.newBuilder().readTimeout(2, TimeUnit.MINUTES).build().newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, runCatching { json.decodeFromString(ErrorBody.serializer(), res.body.string()).error }.getOrDefault(""))
            to.parentFile?.mkdirs()
            to.outputStream().use { out -> res.body.byteStream().copyTo(out) }
            to
        }
    }

    override suspend fun appInfo() = call("GET", "api/app/info").decode(AppInfo.serializer())

    /** Streams the APK to [to], so a large file never sits in memory. */
    override suspend fun downloadApk(to: java.io.File): Unit = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base.resolve("api/app/android")!!).build()
        http.newBuilder().readTimeout(5, TimeUnit.MINUTES).build().newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "")
            to.parentFile?.mkdirs()
            to.outputStream().use { out -> res.body.byteStream().copyTo(out) }
            Unit
        }
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
        val ws = liveClient.newWebSocket(req, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return
                val event = when (msg["type"]?.jsonPrimitive?.contentOrNull) {
                    "hello" -> LiveEvent.Connected
                    "list" -> msg["id"]?.jsonPrimitive?.contentOrNull?.let { LiveEvent.List(it) }
                    "lists" -> LiveEvent.Lists
                    "calendar" -> LiveEvent.Calendar
                    "todos" -> LiveEvent.Todos
                    "meals" -> LiveEvent.Meals
                    "documents" -> LiveEvent.Documents
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
