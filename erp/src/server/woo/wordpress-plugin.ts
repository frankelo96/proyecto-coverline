import "server-only";

import JSZip from "jszip";

export const PLUGIN_VERSION = "1.3.0";
export const PLUGIN_SLUG = "coverline-erp-stock";

/**
 * Plugin de WordPress que conecta la tienda con el ERP. Se descarga desde
 * Maestros → Tienda web con la dirección del ERP y la clave ya cargadas.
 * Cada 5 minutos (WP-Cron) y al cambiar el estado de un pedido:
 *  1. manda al ERP los pedidos modificados y, cada hora, la lista de productos;
 *  2. recibe el stock a publicar y lo graba en los productos y variaciones.
 */
const PLUGIN_SOURCE = String.raw`<?php
/**
 * Plugin Name: Coverline ERP – Stock
 * Description: Sincroniza el stock de WooCommerce con Coverline ERP (stock de los locales menos el margen de seguridad) y le informa los pedidos web. Si se activa en el ERP, también actualiza el precio regular.
 * Version: __VERSION__
 * Author: Coverline
 * Requires Plugins: woocommerce
 */

if (!defined('ABSPATH')) {
    exit;
}

define('COVERLINE_ERP_URL', '__ERP_URL__');
define('COVERLINE_ERP_TOKEN', '__TOKEN__');
define('COVERLINE_ERP_VERSION', '__VERSION__');

add_filter('cron_schedules', function ($schedules) {
    $schedules['coverline_erp_5min'] = array('interval' => 300, 'display' => 'Cada 5 minutos (Coverline ERP)');
    return $schedules;
});

register_activation_hook(__FILE__, function () {
    if (!wp_next_scheduled('coverline_erp_sync_event')) {
        wp_schedule_event(time() + 60, 'coverline_erp_5min', 'coverline_erp_sync_event');
    }
    update_option('coverline_erp_need_catalog', 1, false);
});

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook('coverline_erp_sync_event');
});

add_action('coverline_erp_sync_event', 'coverline_erp_sync');

// Pedido nuevo o cambio de estado: se avisa al ERP en segundo plano (sin demorar la compra).
add_action('woocommerce_order_status_changed', function () {
    if (!wp_next_scheduled('coverline_erp_sync_once')) {
        wp_schedule_single_event(time() + 10, 'coverline_erp_sync_once');
    }
});
add_action('coverline_erp_sync_once', 'coverline_erp_sync');

function coverline_erp_gmt($date)
{
    return $date ? gmdate('Y-m-d\TH:i:s', $date->getTimestamp()) : '';
}

/** Pedidos modificados desde la última sincronización correcta (la primera vez, 30 días). */
function coverline_erp_orders()
{
    $last = (int) get_option('coverline_erp_last_ok', 0);
    $since = $last > 0 ? $last - 3600 : time() - 30 * DAY_IN_SECONDS;
    // Por páginas: no se pierde ningún pedido aunque haya muchos en el período.
    $orders = array();
    for ($page = 1; $page <= 100; $page++) {
        $batch = wc_get_orders(array(
            'type' => 'shop_order',
            'status' => 'any',
            'limit' => 200,
            'paged' => $page,
            'orderby' => 'modified',
            'order' => 'ASC',
            'date_modified' => '>' . $since,
        ));
        $orders = array_merge($orders, $batch);
        if (count($batch) < 200) {
            break;
        }
    }
    $out = array();
    foreach ($orders as $order) {
        $lines = array();
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $lines[] = array(
                'product_id' => (int) $item->get_product_id(),
                'variation_id' => (int) $item->get_variation_id(),
                'sku' => $product ? (string) $product->get_sku() : '',
                'name' => (string) $item->get_name(),
                'quantity' => (float) $item->get_quantity(),
            );
        }
        $out[] = array(
            'id' => (int) $order->get_id(),
            'number' => (string) $order->get_order_number(),
            'status' => (string) $order->get_status(),
            'date_created_gmt' => coverline_erp_gmt($order->get_date_created()),
            'date_modified_gmt' => coverline_erp_gmt($order->get_date_modified()),
            'total' => (string) $order->get_total(),
            'billing' => array(
                'first_name' => (string) $order->get_billing_first_name(),
                'last_name' => (string) $order->get_billing_last_name(),
                'email' => (string) $order->get_billing_email(),
            ),
            'line_items' => $lines,
        );
    }
    return $out;
}

function coverline_erp_stock_of($product)
{
    return $product->get_manage_stock() === true ? (int) $product->get_stock_quantity() : null;
}

/** Código de barras del campo "GTIN, UPC, EAN o ISBN" de WooCommerce (desde la versión 9.2). */
function coverline_erp_price_of($product)
{
    $price = $product->get_regular_price();
    return $price === '' || $price === null ? null : (float) $price;
}

function coverline_erp_gtin_of($product)
{
    return method_exists($product, 'get_global_unique_id') ? (string) $product->get_global_unique_id() : '';
}

/** Productos y variaciones con su SKU y el stock que tienen hoy en la tienda. */
function coverline_erp_catalog()
{
    $out = array();
    $products = wc_get_products(array('limit' => -1, 'status' => array('publish', 'private', 'draft', 'pending'), 'type' => array('simple', 'variable')));
    foreach ($products as $product) {
        if ($product->is_type('variable')) {
            foreach ($product->get_children() as $child_id) {
                $variation = wc_get_product($child_id);
                if (!$variation) {
                    continue;
                }
                $out[] = array(
                    'product_id' => (int) $product->get_id(),
                    'variation_id' => (int) $variation->get_id(),
                    'sku' => (string) $variation->get_sku(),
                    'name' => (string) $variation->get_name(),
                    'stock' => coverline_erp_stock_of($variation),
                    'gtin' => coverline_erp_gtin_of($variation),
                    'price' => coverline_erp_price_of($variation),
                );
            }
        } else {
            $out[] = array(
                'product_id' => (int) $product->get_id(),
                'variation_id' => 0,
                'sku' => (string) $product->get_sku(),
                'name' => (string) $product->get_name(),
                'stock' => coverline_erp_stock_of($product),
                'gtin' => coverline_erp_gtin_of($product),
                'price' => coverline_erp_price_of($product),
            );
        }
    }
    return $out;
}

/** Graba el stock recibido del ERP. Devuelve lo aplicado (o el error) para informarlo en la próxima llamada. */
function coverline_erp_apply_stock($items)
{
    $applied = array();
    foreach ($items as $item) {
        $id = !empty($item['variation_id']) ? (int) $item['variation_id'] : (int) $item['product_id'];
        $quantity = (int) $item['quantity'];
        $row = array('product_id' => (int) $item['product_id'], 'variation_id' => (int) $item['variation_id'], 'quantity' => $quantity);
        try {
            $product = wc_get_product($id);
            if (!$product) {
                $row['error'] = 'El artículo ' . $id . ' ya no existe en la tienda';
            } elseif (coverline_erp_stock_of($product) !== $quantity) {
                $product->set_manage_stock(true);
                $product->set_stock_quantity($quantity);
                $product->save();
            }
        } catch (Throwable $e) {
            $row['error'] = 'Artículo ' . $id . ': ' . $e->getMessage();
        }
        $applied[] = $row;
    }
    return $applied;
}

/** Graba el precio regular recibido del ERP (solo si está activa la sincronización de precios). */
function coverline_erp_apply_prices($items)
{
    $applied = array();
    foreach ($items as $item) {
        $id = !empty($item['variation_id']) ? (int) $item['variation_id'] : (int) $item['product_id'];
        $price = round((float) $item['price'], 2);
        $row = array('product_id' => (int) $item['product_id'], 'variation_id' => (int) $item['variation_id'], 'price' => $price);
        try {
            $product = wc_get_product($id);
            if (!$product) {
                $row['error'] = 'El artículo ' . $id . ' ya no existe en la tienda';
            } elseif ($price > 0 && coverline_erp_price_of($product) !== $price) {
                $product->set_regular_price(wc_format_decimal($price, 2));
                $product->save();
            }
        } catch (Throwable $e) {
            $row['error'] = 'Precio del artículo ' . $id . ': ' . $e->getMessage();
        }
        $applied[] = $row;
    }
    return $applied;
}

/** Graba en la tienda el código de barras de cada talle/color (para lectores y Google Shopping). */
function coverline_erp_apply_gtin($items)
{
    $done = 0;
    foreach ($items as $item) {
        $id = !empty($item['variation_id']) ? (int) $item['variation_id'] : (int) $item['product_id'];
        try {
            $product = wc_get_product($id);
            if ($product && method_exists($product, 'set_global_unique_id') && coverline_erp_gtin_of($product) !== (string) $item['gtin']) {
                $product->set_global_unique_id((string) $item['gtin']);
                $product->save();
                $done++;
            }
        } catch (Throwable $e) {
            // Código repetido en otro producto de la tienda: se deja como está.
        }
    }
    return $done;
}

/** Una sincronización completa con el ERP. Devuelve un texto con el resultado. */
function coverline_erp_sync($manual = false)
{
    if (!function_exists('wc_get_orders')) {
        return 'WooCommerce no está activo';
    }
    // Bloqueo atómico: add_option falla si ya existe (dos sincronizaciones nunca corren juntas).
    if (!add_option('coverline_erp_lock', time(), '', 'no')) {
        $since = (int) get_option('coverline_erp_lock', 0);
        if (time() - $since < 300) {
            return 'Ya hay una sincronización en curso';
        }
        // Bloqueo viejo (una corrida que se cortó): se libera y se toma.
        delete_option('coverline_erp_lock');
        if (!add_option('coverline_erp_lock', time(), '', 'no')) {
            return 'Ya hay una sincronización en curso';
        }
    }
    $started = time();
    try {
        $payload = array(
            'version' => COVERLINE_ERP_VERSION,
            'site' => home_url(),
            'orders' => coverline_erp_orders(),
            'applied' => get_option('coverline_erp_applied', array()),
            'applied_prices' => get_option('coverline_erp_applied_prices', array()),
        );
        if ($manual || get_option('coverline_erp_need_catalog', 1)) {
            $payload['catalog'] = coverline_erp_catalog();
        }
        $response = wp_remote_post(COVERLINE_ERP_URL . '/api/tienda-web/puente', array(
            // El plan gratuito de Render tarda hasta un minuto en despertar.
            'timeout' => 90,
            'headers' => array('Content-Type' => 'application/json', 'X-Coverline-Token' => COVERLINE_ERP_TOKEN),
            'body' => wp_json_encode($payload),
        ));
        if (is_wp_error($response)) {
            throw new Exception('No se pudo conectar con el ERP: ' . $response->get_error_message());
        }
        $code = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if ($code !== 200 || !is_array($data) || empty($data['ok'])) {
            $error = is_array($data) && !empty($data['error']) ? $data['error'] : 'respuesta HTTP ' . $code;
            throw new Exception('El ERP respondió con error: ' . $error);
        }
        // Lo informado ya quedó registrado en el ERP.
        update_option('coverline_erp_applied', array(), false);
        update_option('coverline_erp_applied_prices', array(), false);
        $applied = !empty($data['stock']) ? coverline_erp_apply_stock($data['stock']) : array();
        update_option('coverline_erp_applied', $applied, false);
        $prices = !empty($data['prices']) ? coverline_erp_apply_prices($data['prices']) : array();
        update_option('coverline_erp_applied_prices', $prices, false);
        $gtins = !empty($data['gtin']) ? coverline_erp_apply_gtin($data['gtin']) : 0;
        update_option('coverline_erp_need_catalog', !empty($data['need_catalog']) ? 1 : 0, false);
        update_option('coverline_erp_last_ok', $started, false);
        $message = $data['message'] . (count($applied) ? ' · ' . count($applied) . ' artículos actualizados en la tienda' : '') . ($gtins ? ' · ' . $gtins . ' códigos de barras cargados' : '') . (count($prices) ? ' · ' . count($prices) . ' precios actualizados' : '');
        update_option('coverline_erp_last_result', array('time' => time(), 'ok' => true, 'message' => $message), false);
        return $message;
    } catch (Throwable $e) {
        update_option('coverline_erp_last_result', array('time' => time(), 'ok' => false, 'message' => $e->getMessage()), false);
        return $e->getMessage();
    } finally {
        delete_option('coverline_erp_lock');
    }
}

// Pantalla en Ajustes → Coverline ERP: estado y botón para sincronizar a mano.
add_action('admin_menu', function () {
    add_options_page('Coverline ERP', 'Coverline ERP', 'manage_woocommerce', 'coverline-erp', 'coverline_erp_admin_page');
});

add_action('admin_post_coverline_erp_sync_now', function () {
    if (!current_user_can('manage_woocommerce')) {
        wp_die('Sin permiso');
    }
    check_admin_referer('coverline_erp_sync_now');
    $result = coverline_erp_sync(true);
    if ($result === 'Ya hay una sincronización en curso') {
        update_option('coverline_erp_last_result', array('time' => time(), 'ok' => false, 'message' => 'Ya había una sincronización en curso: probá de nuevo en un minuto.'), false);
    }
    wp_safe_redirect(admin_url('options-general.php?page=coverline-erp'));
    exit;
});

function coverline_erp_admin_page()
{
    $last = get_option('coverline_erp_last_result');
    $next = wp_next_scheduled('coverline_erp_sync_event');
    echo '<div class="wrap"><h1>Coverline ERP – Stock</h1>';
    echo '<p>Conectado con <code>' . esc_html(COVERLINE_ERP_URL) . '</code>. El stock de la tienda lo calcula el ERP (stock de los locales menos el margen de seguridad); este plugin solo lo copia. Los precios solo se actualizan si se activa la sincronización de precios en el ERP.</p>';
    if ($last) {
        $color = $last['ok'] ? '#00a32a' : '#d63638';
        echo '<p><strong>Última sincronización:</strong> ' . esc_html(wp_date('d/m/Y H:i', $last['time'])) . ' — <span style="color:' . $color . '">' . esc_html($last['message']) . '</span></p>';
    } else {
        echo '<p>Todavía no se sincronizó.</p>';
    }
    if ($next) {
        echo '<p>Próxima sincronización automática: ' . esc_html(wp_date('d/m/Y H:i', $next)) . ' (WordPress la ejecuta cuando alguien visita el sitio).</p>';
    }
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    echo '<input type="hidden" name="action" value="coverline_erp_sync_now">';
    wp_nonce_field('coverline_erp_sync_now');
    submit_button('Sincronizar ahora', 'primary', 'submit', false);
    echo '</form></div>';
}
`;

export function pluginSource(erpUrl: string, token: string) {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return PLUGIN_SOURCE.replaceAll("__ERP_URL__", esc(erpUrl.replace(/\/+$/, ""))).replaceAll("__TOKEN__", esc(token)).replaceAll("__VERSION__", PLUGIN_VERSION);
}

/** Zip listo para WordPress → Plugins → Añadir nuevo → Subir plugin. */
export async function pluginZip(erpUrl: string, token: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(`${PLUGIN_SLUG}/${PLUGIN_SLUG}.php`, pluginSource(erpUrl, token));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
