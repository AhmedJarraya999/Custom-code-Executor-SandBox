FROM gcc:latest

RUN useradd -m sandboxuser
USER sandboxuser

WORKDIR /sandbox

ENTRYPOINT ["/bin/sh", "-c"]
