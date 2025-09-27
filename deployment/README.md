# Promptly Web App - Deployment Files

This folder contains all the files needed for deploying the Promptly Web App to production using Docker and EC2.

## File Overview

### Docker Configuration
- **`Dockerfile`** - Multi-stage Docker build configuration for production
- **`.dockerignore`** - Files to exclude from Docker build context
- **`docker-compose.yml`** - Production Docker Compose configuration with nginx
- **`docker-compose.dev.yml`** - Simplified Docker Compose for local testing

### Web Server Configuration
- **`nginx.conf`** - nginx configuration with SSL, compression, and security headers

### Environment Configuration
- **`.env.production`** - Production environment variables template
- **`.env.example`** - Environment variables example file

### Deployment Scripts
- **`scripts/deploy.sh`** - Complete deployment automation script
- **`scripts/setup-ssl.sh`** - SSL certificate setup script (Let's Encrypt)

### Documentation
- **`DEPLOYMENT.md`** - Complete deployment guide and troubleshooting
- **`BACKEND_CONFIG.md`** - Backend configuration requirements for production

## Quick Deployment

### Prerequisites
- EC2 instance running Ubuntu 22.04
- Domain name pointing to your EC2 instance
- SSH access to the server

### Steps

1. **Copy files to server:**
   ```bash
   scp -r deployment/ ubuntu@your-server-ip:~/promptly-deployment
   ```

2. **SSH to server and run deployment:**
   ```bash
   ssh ubuntu@your-server-ip
   cd promptly-deployment
   DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh
   ```

### Local Testing

To test the Docker build locally:

```bash
# Build the image
docker build -t promptly-web .

# Run with development compose
docker-compose -f docker-compose.dev.yml up

# Test at http://localhost:3000
```

## Configuration Notes

### Domain Configuration
Replace `your-domain.com` in the following files with your actual domain:
- `.env.production` → `VITE_PUBLIC_FRONTEND_URL`
- `docker-compose.yml` → environment variables and labels
- `nginx.conf` → server_name directives

### SSL Certificates
The `setup-ssl.sh` script will:
- Generate Let's Encrypt certificates on EC2
- Create self-signed certificates for local testing
- Set up automatic renewal

### Backend Integration
Make sure to update your backend configuration (see `BACKEND_CONFIG.md`):
- AWS Cognito callback URLs
- CORS settings
- Environment variables

## Security Considerations

- All containers run as non-root users
- SSL/TLS with strong ciphers
- Security headers configured in nginx
- Firewall rules limiting access to essential ports only
- Regular security updates via deployment script

## Monitoring and Maintenance

### Health Checks
- Container health checks configured
- nginx health endpoint at `/health`
- Application monitoring via Docker logs

### Updates
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose up --build -d

# Clean up old images
docker system prune -f
```

### Backups
- SSL certificates automatically renewed
- Application logs rotated daily
- Database backups (if applicable) should be configured separately

## Support

For detailed instructions, troubleshooting, and advanced configuration, see:
- `DEPLOYMENT.md` - Complete deployment guide
- `BACKEND_CONFIG.md` - Backend configuration requirements

## File Structure

```
deployment/
├── README.md                 # This file
├── Dockerfile               # Production Docker build
├── .dockerignore            # Docker build exclusions
├── docker-compose.yml       # Production orchestration
├── docker-compose.dev.yml   # Development testing
├── nginx.conf              # Web server configuration
├── .env.production         # Production environment template
├── .env.example            # Environment variables example
├── scripts/
│   ├── deploy.sh           # Automated deployment
│   └── setup-ssl.sh        # SSL certificate setup
├── DEPLOYMENT.md           # Complete deployment guide
└── BACKEND_CONFIG.md       # Backend configuration guide
```