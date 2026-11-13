#!/bin/sh
# Frigate Viewer Proxy
# Keeps a session with Frigate for one read-only account and serves the
# Frigate UI through Home Assistant ingress with that session attached.
set -u

OPTIONS=/data/options.json
TEMPLATE=/etc/frigate-viewer/nginx.conf.template
NGINX_CONF=/tmp/nginx.conf
AUTH_CONF=/tmp/frigate_auth.conf

log() {
    echo "[frigate-viewer] $*" >&2
}

SERVER=$(jq -r '.server // ""' "$OPTIONS" | sed 's:/*$::')
USERNAME=$(jq -r '.username // ""' "$OPTIONS")
COOKIE_NAME=$(jq -r '.cookie_name // "frigate_token"' "$OPTIONS")
HAS_PASSWORD=$(jq -r 'if (.password // "") == "" then "no" else "yes" end' "$OPTIONS")

if ! printf '%s' "$SERVER" | grep -Eq '^https?://[A-Za-z0-9._-]+(:[0-9]+)?$'; then
    log "Option 'server' must look like http(s)://host[:port], without a path."
    exit 1
fi
if ! printf '%s' "$COOKIE_NAME" | grep -Eq '^[A-Za-z0-9_-]+$'; then
    log "Option 'cookie_name' may only contain letters, digits, '_' and '-'."
    exit 1
fi
if [ -z "$USERNAME" ] || [ "$HAS_PASSWORD" = "no" ]; then
    log "Set 'username' and 'password' of a Frigate account with the viewer role."
    exit 1
fi

RESOLVER=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
case "$RESOLVER" in
    "" | *:*) RESOLVER=127.0.0.11 ;;
esac

sed -e "s|__SERVER__|$SERVER|g" -e "s|__RESOLVER__|$RESOLVER|g" "$TEMPLATE" > "$NGINX_CONF"

READY=0

write_signed_out() {
    {
        echo 'default_type text/plain;'
        echo 'return 503 "Frigate Viewer Proxy is not signed in to Frigate. Check the app log.";'
    } > "$AUTH_CONF.tmp"
    mv "$AUTH_CONF.tmp" "$AUTH_CONF"
    READY=0
}

write_signed_in() {
    printf 'proxy_set_header Cookie "%s=%s";\n' "$COOKIE_NAME" "$1" > "$AUTH_CONF.tmp"
    mv "$AUTH_CONF.tmp" "$AUTH_CONF"
    READY=1
}

reload_nginx() {
    nginx -c "$NGINX_CONF" -s reload 2>/dev/null
}

# Prints one claim of a JWT payload.
token_claim() {
    payload=$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')
    case $((${#payload} % 4)) in
        2) payload="${payload}==" ;;
        3) payload="${payload}=" ;;
    esac
    printf '%s' "$payload" | base64 -d 2>/dev/null | jq -r --arg key "$2" '.[$key] // empty' 2>/dev/null
}

# Prints a fresh session token on stdout.
login() {
    response=$(jq -c '{user: .username, password: .password}' "$OPTIONS" |
        curl -sk --max-time 30 -o /dev/null -D - -w 'HTTPSTATUS:%{http_code}\n' \
            -H 'Content-Type: application/json' -H 'X-CSRF-TOKEN: 1' \
            -X POST --data-binary @- "$SERVER/api/login" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log "Cannot reach $SERVER."
        return 1
    fi
    status=$(printf '%s\n' "$response" | sed -n 's/^HTTPSTATUS://p' | tail -n 1)
    token=$(printf '%s\n' "$response" | tr -d '\r' |
        grep -i "^set-cookie: *${COOKIE_NAME}=" | tail -n 1 |
        sed -e 's/^[^=]*=//' -e 's/;.*$//')
    if [ -z "$token" ]; then
        log "Sign-in as '$USERNAME' was refused (HTTP ${status:-?})."
        return 1
    fi
    if ! printf '%s' "$token" | grep -Eq '^[A-Za-z0-9._-]+$'; then
        log "Frigate returned a session token in an unexpected format."
        return 1
    fi
    printf '%s' "$token"
}

write_signed_out
nginx -c "$NGINX_CONF" -g 'daemon off;' &
NGINX_PID=$!
trap 'kill -TERM "$NGINX_PID" 2>/dev/null; exit 0' TERM INT

log "Proxying $SERVER as '$USERNAME'."

next=0
backoff=15
valid_until=0

while kill -0 "$NGINX_PID" 2>/dev/null; do
    now=$(date +%s)
    if [ "$now" -ge "$next" ]; then
        if token=$(login); then
            role=$(token_claim "$token" role)
            if [ "$role" = "admin" ]; then
                log "Account '$USERNAME' is a Frigate admin. Use an account with the viewer role."
                write_signed_out
                reload_nginx
                valid_until=0
                next=$((now + 600))
            else
                write_signed_in "$token"
                reload_nginx
                exp=$(token_claim "$token" exp | cut -d. -f1)
                if [ -n "$exp" ] && [ "$exp" -gt "$now" ] 2>/dev/null; then
                    valid_until=$exp
                    wait=$(((exp - now) / 2))
                else
                    valid_until=$((now + 86400))
                    wait=21600
                fi
                [ "$wait" -lt 300 ] && wait=300
                [ "$wait" -gt 43200 ] && wait=43200
                next=$((now + wait))
                backoff=15
                log "Signed in as '$USERNAME' (role: ${role:-unknown}). Next refresh in ${wait}s."
            fi
        else
            if [ "$READY" -eq 1 ] && [ "$valid_until" -le "$now" ]; then
                log "The previous session expired."
                write_signed_out
                reload_nginx
            fi
            next=$((now + backoff))
            backoff=$((backoff * 2))
            [ "$backoff" -gt 600 ] && backoff=600
        fi
    fi
    sleep 5
done

log "nginx stopped."
exit 1
