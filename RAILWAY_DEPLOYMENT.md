# Railway Deployment Guide

This guide covers deploying the IELTS Proctoring System to Railway using Option 3 (All Railway architecture).

## Architecture Overview

- **Frontend**: React + Express static serving on Railway
- **Backend**: Rust API + Worker combined on Railway
- **Database**: Railway PostgreSQL (built-in)
- **Object Storage**: Railway Volume (or external S3)

## Prerequisites

1. Railway account (https://railway.app)
2. Git repository with your code
3. Railway CLI installed (optional, but recommended)

## Step 1: Prepare Your Repository

### 1.1 Ensure Files Are Committed

Make sure all deployment files are in your repository:

```bash
# Frontend files (in root)
- Dockerfile.frontend
- railway.frontend.json
- .env.railway.frontend

# Backend files (in backend/ directory)
- Dockerfile
- railway.json
- .env.railway
```

### 1.2 Push to Git

```bash
git add .
git commit -m "Add Railway deployment configuration"
git push origin main
```

## Step 2: Create Railway Project

### 2.1 Create New Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Select branch (main)

### 2.2 Create PostgreSQL Database

1. In your Railway project, click "+ New Service"
2. Select "Database"
3. Choose "PostgreSQL"
4. Railway will automatically provide `DATABASE_URL` environment variable

## Step 3: Deploy Backend Service

### 3.1 Create Backend Service

1. Click "+ New Service"
2. Select "Dockerfile"
3. Set context to `backend/` directory
4. Railway will detect `backend/Dockerfile`

### 3.2 Configure Backend Environment Variables

Add the following environment variables to the backend service:

**Required Variables:**
```
DATABASE_URL=${DATABASE_URL}
DATABASE_DIRECT_URL=${DATABASE_URL}
DATABASE_MIGRATOR_URL=${DATABASE_URL}
DATABASE_WORKER_URL=${DATABASE_URL}
```

**Optional Variables (copy from .env.railway):**
```
API_HOST=0.0.0.0
API_PORT=4000
WORKER_CONCURRENCY=4
DB_POOL_MIN_CONNECTIONS=4
DB_POOL_MAX_CONNECTIONS=20
OBJECT_STORAGE_BACKEND=local
OBJECT_STORAGE_ENDPOINT=/app/data
OBJECT_STORAGE_BUCKET=ielts-media
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_ACCESS_KEY=railway
OBJECT_STORAGE_SECRET_KEY=${RAILWAY_VOLUME_PASSWORD}
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_LOCAL_ROOT=/app/data/object-store
MEDIA_BASE_URL=${RAILWAY_PUBLIC_DOMAIN}/media
LIVE_MODE_ENABLED=true
WORKER_OUTBOX_NOTIFY_CHANNEL=backend_outbox_wakeup
LIVE_MODE_NOTIFY_CHANNEL=backend_live_wakeup
PROMETHEUS_ENABLED=true
FEATURE_USE_BACKEND_BUILDER=true
FEATURE_USE_BACKEND_SCHEDULING=true
FEATURE_USE_BACKEND_DELIVERY=true
FEATURE_USE_BACKEND_PROCTORING=true
FEATURE_USE_BACKEND_GRADING=true
MASTER_KEY_ENABLED=true
MASTER_KEY_USERNAME=your-admin@email.com
MASTER_KEY_PASSWORD=your-secure-password
```

### 3.3 Add Railway Volume for Object Storage

1. Go to backend service settings
2. Click "Volumes" tab
3. Click "+ New Volume"
4. Mount path: `/app/data`
5. This will provide `RAILWAY_VOLUME_PASSWORD` automatically

### 3.4 Deploy Backend

1. Click "Deploy" on the backend service
2. Railway will build the Docker image
3. Wait for deployment to complete (5-10 minutes for Rust build)
4. Note the backend service URL (e.g., `https://ielts-backend-production.up.railway.app`)

### 3.5 Run Database Migrations

The backend should automatically run migrations on startup. Check logs to verify:

```bash
# In Railway dashboard, go to backend service > Logs
# Look for migration success messages
```

## Step 4: Deploy Frontend Service

### 4.1 Create Frontend Service

1. Click "+ New Service"
2. Select "Dockerfile"
3. Set context to root directory
4. Specify Dockerfile: `Dockerfile.frontend`

### 4.2 Configure Frontend Environment Variables

Add the following environment variables:

```
VITE_BACKEND_API_URL=https://your-backend-service-url.railway.app
GEMINI_API_KEY=your-gemini-api-key (optional)
```

Replace `your-backend-service-url` with the actual backend URL from Step 3.4.

### 4.3 Deploy Frontend

1. Click "Deploy" on the frontend service
2. Railway will build the Docker image
3. Wait for deployment to complete (2-3 minutes)
4. Note the frontend service URL

## Step 5: Configure Networking

### 5.1 Enable Railway Networking (Optional)

If you want services to communicate internally:

1. Go to project settings
2. Enable "Railway Network"
3. Services can now communicate using service names

Update frontend environment variable:
```
VITE_BACKEND_API_URL=http://backend-service:4000
```

### 5.2 Set Up Custom Domain (Optional)

1. Go to frontend service > Settings > Domains
2. Click "+ New Domain"
3. Add your custom domain
4. Configure DNS records as shown in Railway

## Step 6: Verify Deployment

### 6.1 Check Backend Health

```bash
curl https://your-backend-url.railway.app/health
```

Should return `200 OK`.

### 6.2 Check Frontend

Open your frontend URL in a browser. You should see the IELTS Proctoring System interface.

### 6.3 Test Real-Time Features

1. Log in as admin (use MASTER_KEY credentials)
2. Create an exam
3. Start a proctoring session
4. Verify WebSocket connections work

## Step 7: Configure Monitoring

### 7.1 Enable Railway Metrics

1. Go to project settings
2. Enable "Metrics"
3. View CPU, memory, and network usage

### 7.2 Set Up Alerts (Optional)

1. Go to service settings
2. Configure alert rules for:
   - High CPU usage (>80%)
   - High memory usage (>90%)
   - Service restarts

## Step 8: Scale as Needed

### 8.1 Scale Backend

1. Go to backend service > Settings
2. Adjust CPU/RAM allocation
3. Recommended for production:
   - Start: 1GB RAM, 0.5 vCPU
   - Scale: 2GB RAM, 1 vCPU (for 100+ concurrent sessions)

### 8.2 Separate Worker (Optional)

If background tasks queue up:

1. Create new service from backend directory
2. Use same Dockerfile but modify start command to run only worker
3. Update environment variables to disable API in worker service

## Cost Estimate

**Initial Setup (2 services):**
- Frontend: ~$5/month (512MB RAM)
- Backend: ~$10/month (1GB RAM)
- PostgreSQL: ~$5/month (512MB RAM)
- **Total: ~$20/month**

**Scaled Setup (3 services):**
- Frontend: ~$5/month
- Backend API: ~$15/month (2GB RAM)
- Worker: ~$10/month (1GB RAM)
- PostgreSQL: ~$10/month (1GB RAM)
- **Total: ~$40/month**

## Troubleshooting

### Backend Build Fails

**Issue**: Rust build takes too long or fails
**Solution**: 
- Check logs for specific error
- Ensure Rust version matches (1.88)
- Try increasing build timeout in Railway settings

### Database Connection Fails

**Issue**: Backend can't connect to PostgreSQL
**Solution**:
- Verify DATABASE_URL is set correctly
- Check database service is running
- Ensure both services are in same project

### WebSocket Connections Fail

**Issue**: Real-time features not working
**Solution**:
- Verify LIVE_MODE_ENABLED=true
- Check firewall settings
- Ensure backend service is accessible from frontend

### Object Storage Issues

**Issue**: Media files not uploading
**Solution**:
- Verify Railway volume is mounted at `/app/data`
- Check RAILWAY_VOLUME_PASSWORD is set
- Review backend logs for storage errors

## Migration from Development to Production

### 1. Export Development Data

```bash
# From your local development environment
pg_dump $DATABASE_URL > dev_backup.sql
```

### 2. Import to Railway

```bash
# Connect to Railway PostgreSQL
psql $RAILWAY_DATABASE_URL < dev_backup.sql
```

### 3. Update Environment Variables

Copy all environment variables from `.env.railway` to Railway backend service.

## Security Recommendations

1. **Change default credentials**: Update MASTER_KEY_USERNAME and MASTER_KEY_PASSWORD
2. **Enable HTTPS**: Railway provides this automatically
3. **Use secrets**: Never commit sensitive data to Git
4. **Limit access**: Use Railway's access controls
5. **Monitor logs**: Regularly review Railway logs for suspicious activity

## Backup Strategy

Railway provides automatic backups for PostgreSQL. To configure:

1. Go to PostgreSQL service > Settings
2. Enable "Point-in-Time Recovery"
3. Set retention period (7 days recommended)

For object storage (Railway Volume):
- Use external S3 for production (more reliable backups)
- Implement periodic sync to external storage

## Support

For issues:
- Railway documentation: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Your project logs: Railway dashboard > Service > Logs
