package cn.edu.pku.treehole.mirror

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

internal class MirrorTransport(private val assets: AssetManager) {
    fun respond(uri: Uri, method: String): WebResourceResponse {
        if (!isAppOrigin(uri) || method != "GET") return error(403, "请求不可用")

        val path = uri.path.orEmpty()
        if (path == "/mirror") return fetchMirror(uri)

        val file = when {
            path == "/index.html" -> "index.html"
            path == "/styles.css" -> "styles.css"
            SCRIPT.matches(path) -> path.removePrefix("/")
            else -> return error(404, "文件不存在")
        }
        val type = when {
            file.endsWith(".html") -> "text/html"
            file.endsWith(".css") -> "text/css"
            else -> "text/javascript"
        }
        return try {
            WebResourceResponse(type, "UTF-8", assets.open("web/$file"))
        } catch (_: IOException) {
            error(404, "文件不存在")
        }
    }

    private fun fetchMirror(uri: Uri): WebResourceResponse {
        val source = uri.getQueryParameter("source").orEmpty()
        val endpoint = uri.getQueryParameter("endpoint").orEmpty()
        if (!ENDPOINT.matches(endpoint)) return error(400, "接口地址无效")

        val base = runCatching { URI(source) }.getOrNull()
        if (base == null || base.scheme !in listOf("http", "https") || base.host == null ||
            base.rawUserInfo != null || base.rawQuery != null || base.rawFragment != null ||
            base.port == 0 || base.port > 65535 || base.host == HOST
        ) {
            return error(400, "镜像地址无效")
        }

        val query = uri.getQueryParameter("query").orEmpty()
        if (!QUERY.matches(query) || query.length > 8192) return error(400, "查询参数无效")
        val remote = "${base.toASCIIString().trimEnd('/')}$endpoint" + if (query.isEmpty()) "" else "?$query"
        val image = endpoint.contains("/media/")

        return try {
            var target = URI(remote)
            repeat(4) {
                val connection = target.toURL().openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 8_000
                    connection.readTimeout = 12_000
                    connection.instanceFollowRedirects = false
                    connection.useCaches = false
                    connection.setRequestProperty("Accept", if (image) "image/*" else "application/json")
                    val status = connection.responseCode
                    if (status in REDIRECTS) {
                        val location = connection.getHeaderField("Location") ?: return error(502, "镜像重定向失败")
                        val next = target.resolve(location)
                        if (next.scheme != base.scheme || next.host != base.host || next.port != base.port || next.userInfo != null) {
                            return error(502, "镜像跳转到其他地址")
                        }
                        target = next
                    } else {
                        if (status !in 200..299) return error(status.coerceIn(400, 599), "镜像返回 HTTP $status")
                        val type = connection.contentType?.substringBefore(';')?.trim()?.lowercase().orEmpty()
                        if (image && type !in IMAGE_TYPES) return error(415, "图片格式不可用")
                        val limit = if (image) 24 * 1024 * 1024 else 4 * 1024 * 1024
                        val data = connection.inputStream.use { input ->
                            val output = ByteArrayOutputStream()
                            val buffer = ByteArray(8192)
                            while (true) {
                                val read = input.read(buffer)
                                if (read < 0) break
                                if (output.size() + read > limit) return error(413, "镜像响应过大")
                                output.write(buffer, 0, read)
                            }
                            output.toByteArray()
                        }
                        val cache = if (image) "private, max-age=300" else "no-store"
                        return WebResourceResponse(
                            if (image) type else "application/json", if (image) null else "UTF-8",
                            200, "OK", mapOf("Cache-Control" to cache, "X-Content-Type-Options" to "nosniff"),
                            data.inputStream(),
                        )
                    }
                } finally {
                    connection.disconnect()
                }
            }
            error(502, "镜像重定向次数过多")
        } catch (_: java.net.SocketTimeoutException) {
            error(504, "连接镜像超时")
        } catch (_: Exception) {
            error(502, "无法连接镜像，请检查网络或镜像地址")
        }
    }

    private fun error(status: Int, message: String) = WebResourceResponse(
        "text/plain", "UTF-8", status, "Request failed", mapOf("Cache-Control" to "no-store"),
        message.byteInputStream(),
    )

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        const val ORIGIN = "https://$HOST"
        private val SCRIPT = Regex("/[a-z-]+\\.m?js")
        private val QUERY = Regex("[a-zA-Z0-9+%=&._~*\\-]*")
        private val ENDPOINT = Regex(
            "/(?:help|health|posts|post/[0-9]+|comment|comments/[0-9]+|media/image|" +
                "chapi/api/v3/(?:hole/(?:list_comments|one|get)|comment/list|tags/tree|" +
                "message/(?:index|un_read)|media/(?:getThumbnail|getImageBinary|getMediaBinary)))",
        )
        private val REDIRECTS = setOf(301, 302, 303, 307, 308)
        private val IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/bmp")

        fun isAppOrigin(uri: Uri): Boolean = uri.scheme == "https" && uri.host == HOST && uri.port == -1
    }
}
