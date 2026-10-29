#!/bin/sh
# Renders the nginx site and the runtime configuration of the web app before
# nginx starts, from these environment variables:
#
#   IMMICH_URL     Immich server to proxy /api to, e.g. http://immich-server:2283
#                  or https://photos.example.com. When unset, the server URL is
#                  entered in the web UI instead and the Immich server then needs
#                  CORS configured for this host.
#   BASE_PATH      Sub path the app is served under, e.g. /book/. Must match the
#                  BASE_PATH the image was built with, so it is baked in as a
#                  default and rarely worth overriding.
#   DNS_RESOLVERS  Name servers used to resolve IMMICH_URL, space separated.
#                  Defaults to the resolvers of the container.
set -eu

html_dir=/usr/share/nginx/html
template=/etc/nginx/immich-book/nginx.conf.template
site=/etc/nginx/conf.d/default.conf

# The template spells out its own trailing slashes, so strip them here. "/"
# becomes the empty prefix, which is what the root deployment needs.
base=$(printf '%s' "${BASE_PATH:-/}" | sed -e 's:/*$::' -e 's:^/*:/:' -e 's:^/$::')

if [ -z "${IMMICH_URL:-}" ]; then
    echo "immich-book: IMMICH_URL is not set, /api is not proxied"
    api_conf=""
    echo "window.__IMMICH_BOOK_CONFIG__ = {};" > "$html_dir/config.js"
else
    # Trailing slashes would double up against the /api path appended below.
    immich_url=$(printf '%s' "$IMMICH_URL" | sed 's:/*$::')
    # Host[:port] for the Host header, so that an Immich behind a name based
    # reverse proxy is still addressed correctly.
    immich_host=$(printf '%s' "$immich_url" | sed -e 's,^[a-zA-Z][a-zA-Z0-9+.-]*://,,' -e 's,[/?].*,,' -e 's,^.*@,,')
    # The TLS server name is the same minus the port, keeping IPv6 literals intact.
    immich_sni=$(printf '%s' "$immich_host" | sed -e 's,^\(\[[^]]*\]\).*,\1,' -e 's,:[0-9]*$,,')

    if [ -z "${DNS_RESOLVERS:-}" ]; then
        # Bracket IPv6 addresses, nginx requires that in the resolver directive.
        DNS_RESOLVERS=$(awk '/^nameserver/ { print ($2 ~ /:/) ? "[" $2 "]" : $2 }' /etc/resolv.conf | tr '\n' ' ')
    fi
    # Docker's embedded DNS, the fallback when the container has no resolv.conf.
    [ -n "$DNS_RESOLVERS" ] || DNS_RESOLVERS=127.0.0.11

    echo "immich-book: proxying ${base}/api to $immich_url"

    # Reaching Immich through this origin is what avoids any CORS setup. Going
    # through a variable keeps the upstream out of nginx startup resolution, so
    # the container comes up even when Immich is not running yet and follows it
    # when that container is recreated with a new address.
    api_conf=$(cat <<NGINX
    location ~ ^${base}(/api/.*)\$ {
        resolver ${DNS_RESOLVERS} valid=30s ipv6=off;
        set \$immich_upstream "${immich_url}";
        proxy_pass \$immich_upstream\$1\$is_args\$args;

        proxy_http_version 1.1;
        proxy_set_header Host "${immich_host}";
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name "${immich_sni}";

        # Originals and thumbnails are streamed straight through to the browser.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
NGINX
)

    # Escaped so that a URL containing quotes or backslashes cannot break out of
    # the JavaScript string literal.
    js_url=$(printf '%s' "$immich_url" | sed -e 's,\\,\\\\,g' -e 's,",\\",g')
    echo "window.__IMMICH_BOOK_CONFIG__ = { immichProxyTarget: \"$js_url\" };" > "$html_dir/config.js"
fi

awk -v base="$base" -v api="$api_conf" '
    $0 == "%%API%%" { print api; next }
    { gsub(/%%BASE%%/, base); print }
' "$template" > "$site"
