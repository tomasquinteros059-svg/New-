package cl.innovasoulsystem.relevo;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

/**
 * Relevo en el teléfono.
 *
 * Toda la interfaz es la misma que corre en el navegador; acá no se reimplementa
 * ninguna pantalla. Esta clase hace tres cosas y nada más: servir los archivos
 * que viajan dentro del APK, dejar que el botón de atrás navegue hacia atrás, y
 * mandar al navegador cualquier enlace que salga de la app.
 */
public class PantallaPrincipal extends Activity {

    /**
     * De dónde sale la interfaz.
     *
     * Vacío significa el demo que viaja adentro del APK: anda sin internet y sin
     * servidor, pero no tiene sesión y no guarda nada.
     *
     * El día que Relevo esté desplegado, poné acá su dirección
     * (por ejemplo "https://relevo.vercel.app/") y este mismo APK pasa a abrir
     * la aplicación de verdad, con cuentas y base de datos. No hay que tocar
     * nada más.
     */
    private static final String URL_REMOTA = "";

    /** El origen bajo el que se sirven los archivos del propio APK. */
    private static final String HOST_LOCAL = "appassets.androidplatform.net";
    private static final String INICIO_LOCAL = "https://" + HOST_LOCAL + "/assets/index.html";

    private WebView vista;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle estadoPrevio) {
        super.onCreate(estadoPrevio);

        final WebViewAssetLoader cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        vista = new WebView(this);

        WebSettings ajustes = vista.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        /* La interfaz ya es angosta por diseño: que el sistema no la re-escale. */
        ajustes.setUseWideViewPort(false);
        ajustes.setLoadWithOverviewMode(false);

        /*
         * La app trae su propia paleta oscura en CSS. Esto le avisa al WebView
         * que puede reportar `prefers-color-scheme: dark` y dejar que el CSS
         * resuelva el tema, en vez de invertir los colores por su cuenta.
         */
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(ajustes, true);
        }

        vista.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest pedido) {
                return cargador.shouldInterceptRequest(pedido.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                return abrirAfuera(pedido.getUrl());
            }
        });

        setContentView(vista, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        if (estadoPrevio != null) {
            vista.restoreState(estadoPrevio);
        } else {
            vista.loadUrl(direccionInicial());
        }
    }

    private static String direccionInicial() {
        return URL_REMOTA.isEmpty() ? INICIO_LOCAL : URL_REMOTA;
    }

    /**
     * Devuelve true cuando el destino no es parte de la app y ya se derivó al
     * navegador. Sin esto, un enlace externo dejaría al usuario atrapado en una
     * página ajena sin barra de direcciones ni forma clara de volver.
     */
    private boolean abrirAfuera(Uri destino) {
        String host = destino.getHost();
        if (host == null) {
            return false;
        }
        if (host.equals(HOST_LOCAL) || host.equals(Uri.parse(direccionInicial()).getHost())) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, destino));
        } catch (ActivityNotFoundException sinNavegador) {
            return false;
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        vista.saveState(estado);
    }

    @Override
    public void onBackPressed() {
        /*
         * El botón de atrás del teléfono es el mismo gesto que el "volver" de
         * cada pantalla. Que cierre la app solo cuando ya no hay a dónde volver.
         */
        if (vista.canGoBack()) {
            vista.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
