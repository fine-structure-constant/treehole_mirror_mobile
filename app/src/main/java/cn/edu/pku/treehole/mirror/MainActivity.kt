package cn.edu.pku.treehole.mirror

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        webView = WebView(this)
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))

        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            root.setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val keyboard = insets.getInsets(WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
                insets
            }
        }
        setContentView(root)
        root.requestApplyInsets()
        applyAppearance(isSystemDark())

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
            textZoom = (resources.configuration.fontScale * 100).roundToInt()
        }

        val transport = MirrorTransport(assets)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
                transport.respond(request.url, request.method)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (MirrorTransport.isAppOrigin(uri)) {
                    return uri.path != "/index.html"
                }
                if (request.isForMainFrame && request.hasGesture() && uri.scheme in listOf("https", "http")) {
                    openLink(uri)
                }
                return true
            }
        }
        webView.addJavascriptInterface(DeviceActions(), "MirrorDevice")
        webView.loadUrl("${MirrorTransport.ORIGIN}/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })
    }

    private fun goBack() {
        webView.evaluateJavascript("Boolean(window.mirrorBack?.())") { handled ->
            if (handled != "true") finish()
        }
    }

    private fun openLink(uri: Uri) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    private fun isSystemDark() =
        (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        webView.settings.textZoom = (newConfig.fontScale * 100).roundToInt()
        webView.evaluateJavascript("window.mirrorSystemTheme?.()", null)
    }

    @Suppress("DEPRECATION")
    private fun applyAppearance(dark: Boolean) {
        val color = Color.parseColor(if (dark) "#151B18" else "#F7F6F2")
        root.setBackgroundColor(color)
        webView.setBackgroundColor(color)
        if (Build.VERSION.SDK_INT >= 30) {
            val flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (dark) 0 else flags, flags)
        } else {
            window.statusBarColor = color
            window.navigationBarColor = color
            window.decorView.systemUiVisibility = if (dark) 0 else {
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
        }
    }

    private inner class DeviceActions {
        @JavascriptInterface
        fun isSystemDark(): Boolean = this@MainActivity.isSystemDark()

        @JavascriptInterface
        fun appearance(dark: Boolean) = runOnUiThread { applyAppearance(dark) }

        @JavascriptInterface
        fun share(text: String) = runOnUiThread {
            val intent = Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, text.take(32_000))
            startActivity(Intent.createChooser(intent, "分享树洞"))
        }

        @JavascriptInterface
        fun copy(text: String) = runOnUiThread {
            val clipboard = getSystemService(android.content.ClipboardManager::class.java)
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("树洞", text.take(32_000)))
        }
    }

    override fun onDestroy() {
        root.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
