#!/bin/sh
set -eu

RDP_USERNAME="${RDP_USERNAME:-testuser}"
RDP_PASSWORD="${RDP_PASSWORD:-testpass}"

if ! id "$RDP_USERNAME" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$RDP_USERNAME"
fi

echo "$RDP_USERNAME:$RDP_PASSWORD" | chpasswd
printf '%s\n' 'startxfce4' > "/home/$RDP_USERNAME/.xsession"
chown "$RDP_USERNAME:$RDP_USERNAME" "/home/$RDP_USERNAME/.xsession"

adduser xrdp ssl-cert >/dev/null 2>&1 || true

rm -f /var/run/xrdp/xrdp-sesman.pid /var/run/xrdp/xrdp.pid
/usr/sbin/xrdp-sesman
exec /usr/sbin/xrdp --nodaemon
