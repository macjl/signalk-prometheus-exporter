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




