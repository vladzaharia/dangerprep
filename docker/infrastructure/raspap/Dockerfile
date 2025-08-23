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

# Install RaspAP with Insiders, WireGuard, Ad blocking, and RestAPI
# Skip OpenVPN as requested, include QoS for traffic shaping
RUN curl -sL https://install.raspap.com | bash -s -- \
    --yes \
    --insiders \
    --name ${GITHUB_USERNAME} \
    --token ${GITHUB_TOKEN} \
    --wireguard 1 \
    --adblock 1 \
    --rest 1 \
    --check 0
COPY firewall-rules.sh /home/firewall-rules.sh
COPY wpa_supplicant.conf /etc/wpa_supplicant/
RUN chmod +x /home/firewall-rules.sh
COPY env-setup.sh /home/env-setup.sh
RUN chmod +x /home/env-setup.sh
COPY password-generator.php /home/password-generator.php

CMD [ "/bin/bash", "-c", "/home/env-setup.sh && /home/firewall-rules.sh && /lib/systemd/systemd" ]