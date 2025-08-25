# Use minimal Python base image
FROM python:3.11-slim

# Create non-root user
RUN useradd -m sandboxuser
USER sandboxuser

# Working directory
WORKDIR /sandbox

# Optional: preinstall libraries
RUN pip install --no-cache-dir numpy pandas

# Restrict entrypoint (code will be executed via docker run)
ENTRYPOINT ["/bin/sh", "-c"]
