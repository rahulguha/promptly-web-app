# Backend Configuration Updates for Production Deployment

This document outlines the required backend configuration changes to support the production frontend deployment.

## 1. AWS Cognito Configuration

### Update Callback URLs
The following callback URLs need to be added to your AWS Cognito User Pool:

**Current (Development):**
- `http://localhost:5175/auth/success`

**Add for Production:**
- `https://your-domain.com/auth/success`
- `https://www.your-domain.com/auth/success`

### Update Sign-out URLs
**Current (Development):**
- `http://localhost:5175/logout`

**Add for Production:**
- `https://your-domain.com/logout`
- `https://www.your-domain.com/logout`

### Steps to Update Cognito:
1. Go to AWS Cognito Console
2. Select your User Pool
3. Go to App Integration → App client settings
4. Update the callback URLs and sign-out URLs
5. Save changes

## 2. Backend CORS Configuration

Update your backend CORS settings to include the production domain:

```go
// Current CORS configuration should be updated to include:
AllowOrigins: []string{
    "http://localhost:5175",           // Keep for development
    "https://your-domain.com",         // Add production domain
    "https://www.your-domain.com",     // Add www subdomain
}
```

## 3. Environment Variables

Update your backend environment variables:

```bash
# Add to your production backend environment
COGNITO_REDIRECT_URI="https://your-domain.com/auth/success"
FRONTEND_URL="https://your-domain.com"

# For multiple domains, you may need to handle this in code
# or use a comma-separated list depending on your implementation
```

## 4. JWT Token Configuration

Ensure your JWT configuration supports the new domain:

```go
// If you have domain-specific JWT validation, update to include:
ValidAudiences: []string{
    "http://localhost:5175",
    "https://your-domain.com",
    "https://www.your-domain.com",
}
```

## 5. Backend Health Check

Ensure your backend has a health check endpoint for the load balancer:

```go
// Add if not present
router.GET("/health", func(c *gin.Context) {
    c.JSON(200, gin.H{"status": "healthy"})
})
```

## 6. Security Headers

Verify that your backend sets appropriate security headers:

```go
// Recommended security headers
c.Header("X-Content-Type-Options", "nosniff")
c.Header("X-Frame-Options", "DENY")
c.Header("X-XSS-Protection", "1; mode=block")
```

## 7. Rate Limiting

Consider implementing rate limiting for API endpoints:

```go
// Example rate limiting configuration
// Adjust limits based on your requirements
rateLimiter := rate.NewLimiter(rate.Limit(100), 200) // 100 req/sec, burst 200
```

## 8. Logging and Monitoring

Ensure proper logging for production:

```go
// Log important events
log.Printf("User login: %s from %s", userID, clientIP)
log.Printf("API request: %s %s - %d", method, path, statusCode)
```

## 9. Database Connection

If using a database, ensure production configuration:

```bash
# Production database settings
DB_HOST=your-production-db-host
DB_PORT=5432
DB_NAME=promptly_production
DB_SSL_MODE=require
```

## 10. Verification Checklist

After making these changes, verify:

- [ ] Can authenticate with Google OAuth from production domain
- [ ] JWT tokens work correctly for all API endpoints
- [ ] CORS errors are resolved
- [ ] All API endpoints respond correctly
- [ ] Health check endpoint returns 200 OK
- [ ] Logs show successful requests from production domain
- [ ] Rate limiting works as expected
- [ ] SSL/HTTPS redirects work properly

## Domain Placeholder

Throughout this document, replace `your-domain.com` with your actual production domain name.

## Testing

After updating the backend configuration:

1. Deploy the frontend to your production domain
2. Test the complete authentication flow
3. Verify all API functionality works
4. Check browser developer tools for any CORS errors
5. Monitor backend logs for any issues