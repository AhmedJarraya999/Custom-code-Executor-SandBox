FROM openjdk:17-jdk-slim

RUN useradd -m sandboxuser
USER sandboxuser

WORKDIR /sandbox

# Optional: preinstall Maven/Gradle
RUN apt-get update && apt-get install -y maven gradle && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["/bin/sh", "-c"]
