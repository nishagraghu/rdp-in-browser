FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        dbus-x11 \
        xfce4 \
        xrdp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY start.sh /usr/local/bin/start-rdp.sh
RUN chmod +x /usr/local/bin/start-rdp.sh

EXPOSE 3389

ENTRYPOINT ["/usr/local/bin/start-rdp.sh"]
