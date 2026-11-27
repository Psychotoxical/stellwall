package app.stellwall.api

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class DocumentsApiTest {
    private val server = MockWebServer()

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun client() = ApiClient(server.url("/"), MemoryCookieStore())

    @Test fun `the list, a search with its snippet and the categories read as the server sends them`() = runTest {
        server.enqueue(Contract.response("documents"))
        val list = client().documents("", null)
        assertEquals(listOf("Hausrat", "Zeugnis"), list.map { it.name })
        assertEquals(DocumentDto("00000000-0000-4000-8000-000000000001", "Hausrat", "Versicherung", "2027-03-01", 30, Visibility(true, emptyList()), "00000000-0000-4000-8000-000000000002", "2026-11-27T10:00:00.000Z", "2026-11-27T10:00:00.000Z", "application/pdf", 201, 2, "done"), list[0])
        server.enqueue(Contract.response("documents-search"))
        val hit = client().documents(" Beitrag ", "Versicherung").single()
        assertEquals("Versicherungsschein für den Hausrat, «Beitrag» monatlich", hit.snippet)
        server.takeRequest()
        val req = server.takeRequest()
        assertEquals("Beitrag", req.url.queryParameter("q"))
        assertEquals("Versicherung", req.url.queryParameter("category"))
        server.enqueue(Contract.response("document-categories"))
        assertEquals("Versicherung", client().documentCategories().first())
    }

    @Test fun `upload sends meta and file as form parts`() = runTest {
        server.enqueue(Contract.response("document-created"))
        val meta = DocumentMeta("Hausrat", null, "2027-03-01", 30, Visibility(true, emptyList()))
        val doc = client().uploadDocument(meta, DocumentFile("Scan.pdf", "application/pdf", "%PDF-1.4".toByteArray()))
        assertEquals("pending", doc.ocr)
        val req = server.takeRequest()
        assertEquals("/api/documents", req.url.encodedPath)
        val body = req.body!!.utf8()
        assertTrue(req.headers["Content-Type"]!!.startsWith("multipart/form-data"))
        assertTrue(body.contains("""name="meta""""))
        assertTrue(body.contains("""{"name":"Hausrat","category":null,"validUntil":"2027-03-01","remindDays":30,"visibility":{"everyone":true,"memberIds":[]}}"""))
        assertTrue(body.contains("""name="file"; filename="Scan.pdf""""))
        assertTrue(body.contains("%PDF-1.4"))
    }

    @Test fun `a change sends cleared fields as null and no visibility when it may not be changed`() = runTest {
        server.enqueue(Contract.response("document-updated"))
        client().updateDocument("d1", DocumentMeta("Hausratversicherung", null, null, 90, null))
        assertEquals("""{"name":"Hausratversicherung","category":null,"validUntil":null,"remindDays":90}""", server.takeRequest().body!!.utf8())
    }

    @Test fun `without a key the server says so`() = runTest {
        server.enqueue(Contract.response("documents-not-configured"))
        try {
            client().documents("", null)
            fail()
        } catch (e: ApiException) {
            assertEquals("documents_not_configured", e.code)
        }
    }
}
