#!/bin/bash

# Production Deployment Script for Promptly Web App
# This script handles the complete deployment process

set -e

# Configuration
DOMAIN="${DOMAIN:-your-domain.com}"
EMAIL="${EMAIL:-admin@your-domain.com}"
APP_NAME="promptly-web"
COMPOSE_FILE="docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi

    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed"
    fi

    if [[ -z "$DOMAIN" ]] || [[ "$DOMAIN" == "your-domain.com" ]]; then
        error "Please set DOMAIN environment variable to your actual domain"
    fi

    log "Prerequisites check passed"
}

# Update system packages
update_system() {
    log "Updating system packages..."
    sudo apt-get update
    sudo apt-get upgrade -y
    log "System update completed"
}

# Setup firewall
setup_firewall() {
    log "Setting up firewall..."

    # Enable firewall if not already enabled
    sudo ufw --force enable

    # Allow essential ports
    sudo ufw allow 22/tcp      # SSH
    sudo ufw allow 80/tcp      # HTTP
    sudo ufw allow 443/tcp     # HTTPS

    # Deny everything else by default
    sudo ufw default deny incoming
    sudo ufw default allow outgoing

    log "Firewall setup completed"
}

# Setup SSL certificates
setup_ssl() {
    log "Setting up SSL certificates..."
    DOMAIN="$DOMAIN" EMAIL="$EMAIL" ./scripts/setup-ssl.sh
    log "SSL setup completed"
}

# Build and deploy application
deploy_app() {
    log "Building and deploying application..."

    # Stop existing containers
    docker-compose -f "$COMPOSE_FILE" down || true

    # Remove old images
    docker system prune -f

    # Update docker-compose.yml with actual domain
    sed -i.bak "s/your-domain.com/$DOMAIN/g" "$COMPOSE_FILE"

    # Build and start containers
    docker-compose -f "$COMPOSE_FILE" up --build -d

    log "Application deployed successfully"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."

    # Wait for services to start
    sleep 30

    # Check if containers are running
    if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        error "Some containers are not running"
    fi

    # Test HTTP response (should redirect to HTTPS)
    if ! curl -s -o /dev/null -w "%{http_code}" http://"$DOMAIN" | grep -q "301\|302"; then
        warn "HTTP redirect may not be working"
    fi

    # Test HTTPS response
    if ! curl -s -k https://"$DOMAIN" | grep -q "Promptly"; then
        warn "HTTPS endpoint may not be responding correctly"
    fi

    log "Deployment verification completed"
}

# Setup monitoring and logging
setup_monitoring() {
    log "Setting up basic monitoring..."

    # Create log directory
    sudo mkdir -p /var/log/promptly

    # Setup log rotation
    sudo tee /etc/logrotate.d/promptly > /dev/null <<EOF
/var/log/promptly/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF

    log "Monitoring setup completed"
}

# Main deployment function
main() {
    log "Starting deployment of Promptly Web App..."
    log "Domain: $DOMAIN"
    log "Email: $EMAIL"

    check_prerequisites
    update_system
    setup_firewall
    setup_ssl
    deploy_app
    verify_deployment
    setup_monitoring

    log "Deployment completed successfully!"
    log "Your application should be available at: https://$DOMAIN"

    echo
    echo "Next steps:"
    echo "1. Update your DNS records to point to this server"
    echo "2. Update backend CORS settings (see BACKEND_CONFIG.md)"
    echo "3. Test the complete authentication flow"
    echo "4. Monitor logs: docker-compose logs -f"
}

# Run main function
main "$@"