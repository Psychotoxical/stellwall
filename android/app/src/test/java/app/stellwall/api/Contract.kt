package app.stellwall.api

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse

/** An example response the server's tests wrote to the repo folder `contract/`. */
object Contract {
    private val dir = File("../../contract")

    fun response(name: String): MockResponse {
        val file = File(dir, "$name.json")
        check(file.exists()) { "missing ${file.path}: run the server tests" }
        val example = Json.parseToJsonElement(file.readText()) as JsonObject
        return MockResponse.Builder()
            .code(example.getValue("status").jsonPrimitive.int)
            .addHeader("Content-Type", "application/json; charset=utf-8")
            .body(example.getValue("body").toString())
            .build()
    }
}
