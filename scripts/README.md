# Deployment Scripts

Scripts for deploying and verifying the Becoming Protocol backend.

## Files

| Script | Purpose | How to Run |
|--------|---------|------------|
| `deploy-backend.ps1` | Deploy all edge functions (Windows) | `.\scripts\deploy-backend.ps1` |
| `deploy-backend.sh` | Deploy all edge functions (Unix) | `bash scripts/deploy-backend.sh` |
| `setup-cron-jobs.sql` | Set up cron jobs | Run in Supabase SQL Editor |
| `verify-deployment.sql` | Verify deployment status | Run in Supabase SQL Editor |

## Quick Start

### 1. Prerequisites
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Set Secrets
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
supabase secrets set LOVENSE_DEVELOPER_TOKEN=xxxxx
```

### 3. Deploy Edge Functions
```powershell
# Windows
.\scripts\deploy-backend.ps1

# Or manually
supabase functions deploy
```

### 4. Run Database Migrations
Go to Supabase Dashboard > SQL Editor and run each migration in order from `supabase/migrations/`.

### 5. Set Up Cron Jobs
1. Enable pg_cron in Supabase Dashboard > Database > Extensions
2. Run `scripts/setup-cron-jobs.sql` in SQL Editor

### 6. Verify
Run `scripts/verify-deployment.sql` in SQL Editor to check everything is working.

## Troubleshooting

### Edge function errors
```bash
# View logs
supabase functions logs handler-ai --follow
```

### Missing tables
Re-run the migrations in order from `supabase/migrations/`.

### Cron jobs not running
Check pg_cron is enabled and jobs are scheduled:
```sql
SELECT * FROM cron.job;
```
