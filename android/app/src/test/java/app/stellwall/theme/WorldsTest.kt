package app.stellwall.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WorldsTest {
    private fun contrast(a: Color, b: Color): Double {
        val la = a.luminance() + 0.05
        val lb = b.luminance() + 0.05
        return (maxOf(la, lb) / minOf(la, lb)).toDouble()
    }

    @Test
    fun `the seven worlds of the web app exist`() {
        assertEquals(listOf("salbei", "flieder", "pfirsich", "himmel", "rose", "sonne", "pink", "psysonic"), WORLDS.keys.toList())
    }

    @Test
    fun `buttons and text stay readable in every world, light and dark`() {
        for ((name, w) in WORLDS) {
            for (p in listOf(w.light, w.dark)) {
                assertTrue("$name primary", contrast(p.primary, p.primaryInk) >= 4.5)
                assertTrue("$name ink", contrast(p.ink, p.ground) >= 7.0)
                assertTrue("$name soft ink", contrast(p.inkSoft, p.ground) >= 4.5)
                assertTrue("$name board", contrast(p.boardInk, p.board) >= 4.5)
            }
        }
    }

    @Test
    fun `error notes stay readable in every world, light and dark`() {
        for ((name, w) in WORLDS) {
            for (p in listOf(w.light, w.dark)) {
                val (ground, text) = app.stellwall.ui.noticeColors(p)
                assertTrue("$name notice", contrast(text, ground) >= 4.5)
            }
        }
    }

    @Test
    fun `oklch matches the browser`() {
        // oklch(44% 0.12 155), the Salbei button in the web app
        val c = oklch(0.44f, 0.12f, 155f)
        assertEquals(0, (c.red * 255).toInt(), 2)
        assertEquals(101, (c.green * 255).toInt(), 2)
        assertEquals(51, (c.blue * 255).toInt(), 2)
    }
}

private fun assertEquals(expected: Int, actual: Int, tolerance: Int) {
    assertTrue("expected $expected±$tolerance, was $actual", kotlin.math.abs(expected - actual) <= tolerance)
}
