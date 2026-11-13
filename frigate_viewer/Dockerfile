FROM nginx:stable-alpine

RUN apk add --no-cache curl jq

COPY nginx.conf.template /etc/frigate-viewer/nginx.conf.template
COPY guard.js /etc/frigate-viewer/guard.js
COPY run.sh /run.sh

ENTRYPOINT ["/bin/sh", "/run.sh"]
