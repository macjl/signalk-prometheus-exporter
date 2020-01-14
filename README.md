# Signal K to Prometheus Plugin

Signal K Node server plugin to make a Prometheus pull end point to allow a Prometheus server to pull data.

To use, install a Prometheus server and configure it to pull from 

http://localhost:3000/signalk/v1/api/prometheus

which will contain the current values eg

    # HELP environment_wind_angleApparent environment.wind.angleApparent
    # TYPE environment_wind_angleApparent gauge
    environment_wind_angleApparent -0.5857853071795862
    # HELP environment_wind_speedApparent environment.wind.speedApparent
    # TYPE environment_wind_speedApparent gauge
    environment_wind_speedApparent 5.34
    # HELP navigation_courseOverGroundTrue navigation.courseOverGroundTrue
    # TYPE navigation_courseOverGroundTrue gauge
    navigation_courseOverGroundTrue 2.8798
    # HELP navigation_speedOverGround navigation.s


# Setup on a Pi


    sudo su - root
    cd /opt
    wget https://github.com/prometheus/node_exporter/releases/download/v0.18.1/node_exporter-0.18.1.linux-armv7.tar.gz
    tar xvzf node_exporter-0.18.1.linux-armv7.tar.gz
    rm node_exporter-0.18.1.linux-armv7.tar.gz
    ln -s node_exporter-0.18.1.linux-armv7 node_exporter
    wget https://github.com/prometheus/prometheus/releases/download/v2.15.1/prometheus-2.15.1.linux-armv7.tar.gz
    tar xvzf prometheus-2.15.1.linux-armv7.tar.gz
    rm prometheus-2.15.1.linux-armv7.tar.gz
    ln -s prometheus-2.2.1.linux-armv7 prometheus
    mkdir prometheus/data
    useradd prometheus
    chown -R prometheus:prometheus prometheus node_exporter

    cat << EOF >> /etc/security/limits.conf
    prometheus     soft    nofile   65536
    prometheus     hard    nofile   65536
    EOF


    cat << EOF > /opt/prometheus/prometheus.service
    # /etc/systemd/system/prometheus.service
    [Unit]
    Description=Prometheus Server
    Documentation=https://prometheus.io/docs/introduction/overview/
    After=network-online.target

    [Service]
    User=prometheus
    LimitNOFILE=65536
    Restart=on-failure
    ExecStart=/opt/prometheus/prometheus \
              --config.file=/opt/prometheus/prometheus.yml \
              --storage.tsdb.path=/opt/prometheus/data \
              --web.console.templates=/opt/prometheus/consoles \
              --web.console.libraries=/opt/prometheus/console_libraries

    [Install]
    WantedBy=multi-user.target
    EOF


    cat << EOF > /opt/node_exporter/node_exporter.service
    # /etc/systemd/system/node_exporter.service
    [Unit]
    Description=Node Exporter

    [Service]
    User=prometheus
    ExecStart=/opt/node_exporter/node_exporter

    [Install]
    WantedBy=default.target
    EOF


    cat << EOF > /opt/prometheus/prometheus.yml
    # my global config
    global:
      scrape_interval:     15s # Set the scrape interval to every 15 seconds. Default is every 1 minute.
      evaluation_interval: 15s # Evaluate rules every 15 seconds. The default is every 1 minute.
      # scrape_timeout is set to the global default (10s).

    # Alertmanager configuration
    alerting:
      alertmanagers:
      - static_configs:
        - targets:
          # - alertmanager:9093

    # Load rules once and periodically evaluate them according to the global 'evaluation_interval'.
    rule_files:
      # - "first_rules.yml"
      # - "second_rules.yml"

    # A scrape configuration containing exactly one endpoint to scrape:
    # Here it's Prometheus itself.
    scrape_configs:
      # The job name is added as a label job=job_name to any timeseries scraped from this config.
      - job_name: 'prometheus'

        # metrics_path defaults to '/metrics'
        # scheme defaults to 'http'.

        static_configs:
          - targets: ['localhost:9090']
      - job_name: 'node'

        # metrics_path defaults to '/metrics'
        # scheme defaults to 'http'.

        static_configs:
          - targets: ['localhost:9100']

      - job_name: 'boat'

        # metrics_path defaults to '/metrics'
        # scheme defaults to 'http'.
        metrics_path: /signalk/v1/api/prometheus

        static_configs:
          - targets: ['localhost']

    EOF

    ln -s /opt/prometheus/prometheus.service /etc/systemd/system/prometheus.service
    ln -s /opt/node_exporter/node_exporter.service /etc/systemd/system/node_exporter.service


    systemctl daemon-reload
    systemctl enable prometheus
    systemctl start prometheus
    systemctl status prometheus
    systemctl enable node_exporter
    systemctl start node_exporter
    systemctl status node_exporter






I know this is closed but was reading around (looking at ESP32) and spotted others having problems with 3.3v transceivers on Raymarine. I had the same problem (several years ago). I put a scope on the CanH and CanL and found that most of my Raymarine tracievers were 5v transceivers. with CanH always going above 3.3v. The CanH sent from the CJMCU-230/SN65HVD230 (as used in the dual can transceiver used for Teensy mentioned elsewhere) never goes about supply, ie 3.3v. As mentioned in the SN65HVD230 [datasheet](http://www.ti.com/lit/ds/symlink/sn65hvd230.pdf) section 11.3.1.3 the  SN65HVD230 is compatible with 5V trancevers. However there is a reduced margin of error. If the 5V transceiver is expecting 5V CanH then it may miss a CanH from a 3.3v transceiver.  It more likely to be the fault of the 5V transceiver. Perhaps Raymarine use 5V trancevers to avoid the problem. If the 3.3v is 3.2v it might happen more often. Recieve was no problem since the 3.3v transceivers look for common mode voltages. When I switched to a MCP2562 wired as shown in [figure 1-2 page 6](http://ww1.microchip.com/downloads/en/devicedoc/20005167c.pdf) with 5V driving the transceiver and 3.3V driving the logic all the problems went away. Almost no CAN errors seen for 2 years with this library on a 3.3v Due.  Hope that helps someone (and reminds me).... assuming the above is correct.

