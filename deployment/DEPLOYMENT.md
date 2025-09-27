# Promptly Web App - Production Deployment Guide

This guide covers the complete deployment of the Promptly Web App to AWS EC2 using Docker and nginx.

## Architecture Overview

```
Internet → AWS Load Balancer → EC2 Instance → nginx → Docker Container (SvelteKit App)
                                     ↓
                               SSL Termination
                               Static File Serving
                               Rate Limiting
```

## Prerequisites

### Domain and DNS
- A registered domain name
- DNS management access (Route 53, Cloudflare, etc.)

### AWS Resources
- EC2 instance (t3.medium or larger recommended)
- Security Group with ports 22, 80, 443 open
- Elastic IP address (optional but recommended)

### Local Requirements
- Docker and Docker Compose
- SSH access to EC2 instance

## Quick Start

### 1. Launch EC2 Instance

```bash
# Launch Ubuntu 22.04 LTS instance
# Configure security group to allow:
# - SSH (22) from your IP
# - HTTP (80) from everywhere
# - HTTPS (443) from everywhere
```

### 2. Connect and Setup

```bash
# SSH to your instance
ssh -i your-key.pem ubuntu@your-server-ip

# Clone the repository
git clone https://github.com/your-username/promptly-web-app.git
cd promptly-web-app

# Install Docker and Docker Compose
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu

# Log out and log back in for group changes to take effect
```

### 3. Configure Environment

```bash
# Copy and edit environment file
cp .env.example .env.production

# Edit the production environment file
nano .env.production

# Set your domain and backend URL:
# VITE_PUBLIC_FRONTEND_URL=https://your-domain.com
# VITE_PUBLIC_BACKEND_API_BASE_URL=https://promptlocker.app/v1
```

### 4. Deploy

```bash
# Run the deployment script
DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh
```

## Manual Deployment Steps

If you prefer to deploy manually or need to troubleshoot:

### 1. SSL Certificates

```bash
# Generate SSL certificates
DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/setup-ssl.sh
```

### 2. Update Configuration Files

Edit `docker-compose.yml` and `nginx.conf` to replace `your-domain.com` with your actual domain.

### 3. Build and Start

```bash
# Build the Docker image
docker-compose build

# Start the services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

## Configuration Files

### Environment Variables

**Development (`.env`):**
```bash
VITE_PUBLIC_BACKEND_API_BASE_URL=https://promptlocker.app/v1
VITE_API_PROXY_TARGET=https://promptlocker.app
VITE_PUBLIC_FRONTEND_URL=http://localhost:5175
```

**Production (`.env.production`):**
```bash
VITE_PUBLIC_BACKEND_API_BASE_URL=https://promptlocker.app/v1
VITE_PUBLIC_FRONTEND_URL=https://your-domain.com
NODE_ENV=production
PORT=3000
```

### Docker Configuration

- `Dockerfile` - Multi-stage build for production
- `docker-compose.yml` - Production orchestration with nginx
- `docker-compose.dev.yml` - Simple development testing

### nginx Configuration

- SSL termination with Let's Encrypt certificates
- Gzip compression
- Security headers
- Rate limiting
- Static file caching

## DNS Configuration

Point your domain to the EC2 instance:

```
A Record: your-domain.com → 1.2.3.4 (your EC2 IP)
CNAME: www.your-domain.com → your-domain.com
```

## Backend Configuration

**CRITICAL:** Update your backend configuration (see `BACKEND_CONFIG.md`):

1. **AWS Cognito**: Add production callback URLs
2. **CORS Settings**: Include production domain
3. **Environment Variables**: Set production frontend URL

## Health Checks and Monitoring

### Check Application Status

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f promptly-web
docker-compose logs -f nginx

# Test endpoints
curl -I http://your-domain.com  # Should redirect to HTTPS
curl -I https://your-domain.com # Should return 200
curl https://your-domain.com/health # Should return "healthy"
```

### System Monitoring

```bash
# Check system resources
htop
df -h
free -h

# Monitor nginx access logs
tail -f /var/log/nginx/access.log

# Monitor application logs
docker-compose logs -f --tail=100
```

## Backup and Recovery

### Database Backup

```bash
# If using a database, backup regularly
# This example assumes PostgreSQL
pg_dump promptly_production > backup_$(date +%Y%m%d).sql
```

### SSL Certificate Renewal

Let's Encrypt certificates auto-renew, but you can force renewal:

```bash
sudo certbot renew --dry-run
sudo certbot renew
```

### Application Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d

# Clean up old images
docker system prune -f
```

## Troubleshooting

### Common Issues

**1. SSL Certificate Issues**
```bash
# Check certificate status
sudo certbot certificates

# Renew if needed
sudo certbot renew

# Check nginx configuration
sudo nginx -t
```

**2. Container Won't Start**
```bash
# Check logs
docker-compose logs promptly-web

# Check if port is in use
sudo netstat -tulpn | grep :3000

# Restart services
docker-compose restart
```

**3. CORS Errors**
- Verify backend CORS settings include your domain
- Check browser developer tools for exact error
- Ensure both HTTP and HTTPS variants are allowed

**4. Authentication Issues**
- Verify Cognito callback URLs include your domain
- Check JWT token validation in backend
- Monitor backend logs during authentication

### Log Locations

```bash
# Application logs
docker-compose logs promptly-web

# nginx logs
docker-compose logs nginx

# System logs
sudo journalctl -u docker
```

## Security Considerations

### Firewall Configuration

```bash
# Check current rules
sudo ufw status

# Allow only necessary ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Regular Updates

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Update Docker images
docker-compose pull
docker-compose up -d
```

### SSL/TLS Security

- Certificates automatically renew via Let's Encrypt
- Strong ciphers configured in nginx
- HSTS headers enabled
- HTTP automatically redirects to HTTPS

## Performance Optimization

### nginx Optimizations

- Gzip compression enabled
- Static file caching (1 year for assets)
- HTTP/2 enabled
- Connection keep-alive

### Docker Optimizations

- Multi-stage build reduces image size
- Non-root user for security
- Health checks for reliability
- Resource limits (can be added)

### Monitoring

- Health check endpoint: `/health`
- nginx status: `/nginx_status` (if enabled)
- Container stats: `docker stats`

## Cost Optimization

### EC2 Instance Sizing

- **t3.micro**: Development/testing only
- **t3.small**: Low traffic production
- **t3.medium**: Recommended for production
- **t3.large**: High traffic scenarios

### Auto-scaling (Advanced)

Consider setting up auto-scaling with:
- Application Load Balancer
- Auto Scaling Groups
- CloudWatch monitoring
- Multiple availability zones

## Support and Maintenance

### Automated Backups

Set up automated backups using cron:

```bash
# Add to crontab
0 2 * * * /path/to/backup-script.sh
```

### Monitoring Alerts

Consider setting up:
- CloudWatch alarms
- Uptime monitoring (Pingdom, UptimeRobot)
- Log analysis (CloudWatch Logs, ELK stack)

### Maintenance Windows

Plan regular maintenance for:
- Security updates
- SSL certificate renewal
- Dependency updates
- Performance optimization

---

## Quick Commands Reference

```bash
# Deployment
DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh

# Check status
docker-compose ps
docker-compose logs -f

# Update application
git pull && docker-compose up --build -d

# SSL renewal
sudo certbot renew

# Backup
docker-compose exec postgres pg_dump -U user database > backup.sql

# Restart services
docker-compose restart

# Clean up
docker system prune -f
```