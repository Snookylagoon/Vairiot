#!/bin/sh
# certbot deploy hook: runs after every successful certificate renewal so nginx
# serves the new certificate straight away. Installed by infra/deploy.sh to
# /etc/letsencrypt/renewal-hooks/deploy/vairiot-reload-nginx.sh.
# Without it, a renewed certificate is only picked up at the next restart,
# and a quiet 60–90 days ends with an expired certificate.
if docker ps --format '{{.Names}}' | grep -q '^vairiot_nginx$'; then
    docker exec vairiot_nginx nginx -s reload || docker restart vairiot_nginx
fi
