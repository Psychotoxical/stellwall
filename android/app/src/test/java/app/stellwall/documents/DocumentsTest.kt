package app.stellwall.documents

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import app.stellwall.Tab
import app.stellwall.api.ApiException
import app.stellwall.api.DocumentDto
import app.stellwall.api.DocumentFile
import app.stellwall.api.DocumentMeta
import app.stellwall.api.DocumentsApi
import app.stellwall.api.Member
import app.stellwall.api.Visibility
import app.stellwall.push.Links
import app.stellwall.theme.StellwallTheme
import com.github.takahirom.roborazzi.captureRoboImage
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

private val me = Member("me", "alex", "Alex", "admin", "person-mint", "salbei")
private val sam = Member("sam", "sam", "Sam", "member", "person-lilac", "flieder")

private fun doc(id: String, name: String, category: String? = null, validUntil: String? = null, by: String = "me", pages: Int? = 1, ocr: String = "done", snippet: String? = null) =
    DocumentDto(id, name, category, validUntil, 30, Visibility(true, emptyList()), by, "2026-11-27T10:00:00.000Z", "2026-11-27T10:00:00.000Z", "application/pdf", 1000, pages, ocr, snippet)

class FakeDocuments(var items: List<DocumentDto> = emptyList()) : DocumentsApi {
    val calls = mutableListOf<String>()
    var off = false
    override suspend fun members() = listOf(me, sam)
    override suspend fun documents(q: String, category: String?): List<DocumentDto> {
        calls += "list:$q:$category"
        if (off) throw ApiException(409, "documents_not_configured")
        return items.filter { (q.isBlank() || it.name.contains(q, true)) && (category == null || it.category == category) }
    }
    override suspend fun document(id: String) = items.first { it.id == id }
    override suspend fun documentCategories() = listOf("Versicherung", "Auto", "Ausweise")
    override suspend fun uploadDocument(meta: DocumentMeta, file: DocumentFile): DocumentDto {
        calls += "upload:${meta.name}:${meta.category}:${meta.validUntil}:${meta.remindDays}:${file.name}"
        return doc("new", meta.name).also { items = items + it }
    }
    override suspend fun updateDocument(id: String, meta: DocumentMeta): DocumentDto {
        calls += "update:$id:${meta.name}:${meta.visibility != null}"
        return items.first { it.id == id }
    }
    override suspend fun deleteDocument(id: String) { calls += "delete:$id" }
    override suspend fun documentFile(id: String, to: File) = to
}

class DocumentsModelTest {
    @Test fun `list, search and category go to the server`() = runTest {
        val f = FakeDocuments(listOf(doc("a", "Hausrat", "Versicherung"), doc("b", "Reisepass", "Ausweise")))
        val m = DocumentsModel(f, me)
        m.load()
        assertEquals(listOf("Hausrat", "Reisepass"), m.state.value.items.map { it.name })
        m.search("pass")
        assertEquals(listOf("Reisepass"), m.state.value.items.map { it.name })
        m.search("")
        m.pickCategory("Versicherung")
        assertEquals(listOf("Hausrat"), m.state.value.items.map { it.name })
        assertEquals("list::Versicherung", f.calls.last())
    }

    @Test fun `without a key the area says the administration must set it up`() = runTest {
        val m = DocumentsModel(FakeDocuments().apply { off = true }, me)
        m.load()
        assertTrue(m.state.value.notConfigured)
        assertNull(m.state.value.error)
    }

    @Test fun `upload trims, refuses a missing name and a file over 30 MB`() = runTest {
        val f = FakeDocuments()
        val m = DocumentsModel(f, me)
        val pdf = DocumentFile("Scan.pdf", "application/pdf", "%PDF-1.4".toByteArray())
        assertEquals(DocText.INVALID, m.upload(DocumentMeta(" ", null, null, 30), pdf))
        assertEquals(DocText.TOO_LARGE, m.upload(DocumentMeta("Groß", null, null, 30), DocumentFile("x.pdf", "application/pdf", ByteArray((MAX_BYTES + 1).toInt()))))
        assertNull(m.upload(DocumentMeta(" Hausrat ", " ", "2027-03-01", 90, Visibility(true, emptyList())), pdf))
        assertEquals("upload:Hausrat:null:2027-03-01:90:Scan.pdf", f.calls.first { it.startsWith("upload") })
    }

    @Test fun `only the creator sends a visibility with a change`() = runTest {
        val f = FakeDocuments(listOf(doc("a", "Hausrat", by = "sam")))
        val m = DocumentsModel(f, me)
        assertNull(m.update(f.items[0], DocumentMeta("Hausrat neu", null, null, 30, Visibility(false, emptyList()))))
        assertEquals("update:a:Hausrat neu:false", f.calls.first { it.startsWith("update") })
    }

    @Test fun `texts for dates, names from files and links from notifications`() {
        val today = LocalDate.of(2026, 11, 27)
        assertEquals("gültig bis 01.03.2027", DocText.until("2027-03-01", today))
        assertEquals("abgelaufen am 01.11.2026", DocText.until("2026-11-01", today))
        assertTrue(DocText.soon("2026-12-20", today))
        assertEquals("Hausrat 2026", nameFromFile("Hausrat_2026.pdf"))
        val t = Links.target("/dokumente/d1")
        assertEquals(Tab.Start, t.tab)
        assertTrue(t.documents)
        assertEquals("d1", t.documentId)
        assertNull(Links.target("/dokumente").documentId)
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w360dp-h780dp-xxhdpi")
class DocumentsScreenTest {
    @get:Rule val compose = createComposeRule()
    private val today = LocalDate.of(2026, 11, 27)

    @Test fun `a picked file that is gone or not allowed is no crash`() {
        val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        assertNull(readFile(context, android.net.Uri.parse("content://nowhere.example/missing.pdf"), "Dokument"))
    }

    @Test fun `the list with dates, a soon running out one and a search hit`() {
        val f = FakeDocuments(
            listOf(
                doc("a", "Personalausweis", "Ausweise", "2026-12-15", pages = 2),
                doc("b", "Hausrat", "Versicherung", "2027-03-01", snippet = "Beitrag «monatlich» fällig"),
                doc("c", "Mietvertrag", null, null, pages = 7, ocr = "pending"),
            ),
        )
        val m = DocumentsModel(f, me)
        compose.setContent { StellwallTheme(world = "salbei", dark = false) { DocumentsArea(m, today = today, onBack = {}) } }
        compose.waitUntil(5_000) { m.state.value.loaded }
        compose.onNodeWithText("gültig bis 15.12.2026").assertExists()
        compose.onNodeWithText("Beitrag «monatlich» fällig").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/documents.png")
    }

    @Test fun `empty, and the details form for a new file`() {
        val m = DocumentsModel(FakeDocuments(), me)
        compose.setContent {
            StellwallTheme(world = "salbei", dark = true) {
                DocumentsScreen(m, today, onOpen = {}, onBack = {})
                DocumentSheet(m, doc = null, file = DocumentFile("Kfz_Versicherung.pdf", "application/pdf", ByteArray(10)), onClose = {})
            }
        }
        compose.waitUntil(5_000) { m.state.value.categories.isNotEmpty() || true }
        compose.onNodeWithText("Kfz Versicherung").assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/documents-new.png")
    }

    @Test fun `one document with open, share and delete for its creator`() {
        val m = DocumentsModel(FakeDocuments(), me)
        compose.setContent { StellwallTheme(world = "salbei", dark = false) { DocumentScreen(m, doc("a", "Personalausweis", "Ausweise", "2026-12-15", pages = 2, ocr = "failed"), today, onBack = {}) } }
        compose.onNodeWithText("Öffnen").assertExists()
        compose.onNodeWithText("Löschen").assertExists()
        compose.onNodeWithText(DocText.OCR_FAILED).assertExists()
        compose.onRoot().captureRoboImage("src/test/screenshots/document.png")
    }
}
