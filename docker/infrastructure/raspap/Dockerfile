# RaspAP Docker with DangerPrep Integration
# Based on https://github.com/RaspAP/raspap-docker/

FROM debian:bookworm

# Build arguments for Insiders access
ARG GITHUB_USERNAME
ARG GITHUB_TOKEN

ENV container docker
ENV LC_ALL C
ENV DEBIAN_FRONTEND noninteractive

RUN apt-get update \
    && apt-get install -y systemd systemd-sysv sudo wget procps curl systemd iproute2 \
       iptables iptables-persistent php php-cli php-cgi lighttpd hostapd dnsmasq \
       wireless-tools wpasupplicant dhcpcd5 git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN cd /lib/systemd/system/sysinit.target.wants/ \
    && rm $(ls | grep -v systemd-tmpfiles-setup)

RUN rm -f /lib/systemd/system/multi-user.target.wants/* \
    /etc/systemd/system/*.wants/* \
    /lib/systemd/system/local-fs.target.wants/* \
    /lib/systemd/system/sockets.target.wants/*udev* \
    /lib/systemd/system/sockets.target.wants/*initctl* \
    /lib/systemd/system/basic.target.wants/* \
    /lib/systemd/system/anaconda.target.wants/* \
    /lib/systemd/system/plymouth* \
    /lib/systemd/system/systemd-update-utmp*

VOLUME [ "/sys/fs/cgroup" ]

EXPOSE 80

# Create necessary directories before installation
RUN mkdir -p /etc/hostapd /etc/raspap /etc/lighttpd /etc/dnsmasq.d /etc/wpa_supplicant

# Install RaspAP with Insiders, WireGuard, Ad blocking, and RestAPI
# Skip OpenVPN as requested, include QoS for traffic shaping
# Add timeout and retry logic for network operations
RUN timeout 600 bash -c ' \
    for i in {1..3}; do \
        echo "RaspAP installation attempt $i/3..."; \
        if curl -sL --connect-timeout 30 --max-time 300 https://install.raspap.com | bash -s -- \
            --yes \
            --insiders \
            --name ${GITHUB_USERNAME} \
            --token ${GITHUB_TOKEN} \
            --wireguard 1 \
            --adblock 1 \
            --rest 1 \
            --check 0; then \
            echo "RaspAP installation successful"; \
            exit 0; \
        else \
            echo "RaspAP installation attempt $i failed, retrying..."; \
            sleep 10; \
        fi; \
    done; \
    echo "All RaspAP installation attempts failed"; \
    exit 1; \
    '

# Ensure directories exist even if installation partially failed
RUN mkdir -p /etc/hostapd /etc/raspap /etc/lighttpd /etc/dnsmasq.d /etc/wpa_supplicant

# Create default configuration files if they don't exist
RUN touch /etc/hostapd/hostapd.conf /etc/raspap/raspap.auth /etc/lighttpd/lighttpd.conf
COPY wpa_supplicant.conf /etc/wpa_supplicant/
COPY env-setup.sh /home/env-setup.sh
RUN chmod +x /home/env-setup.sh
COPY password-generator.php /home/password-generator.php

CMD [ "/bin/bash", "-c", "/home/env-setup.sh && /lib/systemd/systemd" ]