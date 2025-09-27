#!/bin/bash

# SSL Certificate Setup Script
# This script sets up Let's Encrypt SSL certificates for the domain

set -e

# Configuration
DOMAIN="${DOMAIN:-your-domain.com}"
EMAIL="${EMAIL:-admin@your-domain.com}"
SSL_DIR="./ssl"

echo "Setting up SSL certificates for domain: $DOMAIN"

# Create SSL directory
mkdir -p "$SSL_DIR"

# Check if running on EC2
if curl -s --connect-timeout 2 http://169.254.169.254/latest/meta-data/ > /dev/null; then
    echo "Running on AWS EC2..."

    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        echo "Installing certbot..."
        sudo apt-get update
        sudo apt-get install -y certbot
    fi

    # Stop nginx if running
    sudo systemctl stop nginx 2>/dev/null || true

    # Generate certificate
    echo "Generating Let's Encrypt certificate..."
    sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN" \
        -d "www.$DOMAIN"

    # Copy certificates to local directory
    sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/"
    sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/"
    sudo chown $(whoami):$(whoami) "$SSL_DIR"/*.pem

    echo "SSL certificates generated and copied to $SSL_DIR"

else
    echo "Not running on EC2. Generating self-signed certificates for development..."

    # Generate self-signed certificate for development
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

    echo "Self-signed certificates generated in $SSL_DIR"
fi

# Set proper permissions
chmod 600 "$SSL_DIR/privkey.pem"
chmod 644 "$SSL_DIR/fullchain.pem"

echo "SSL setup complete!"
echo "Certificates are located in: $SSL_DIR"