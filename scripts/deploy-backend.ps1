# Becoming Protocol - Backend Deployment Script (PowerShell)
# Run this after setting up Supabase CLI and linking your project

$ErrorActionPreference = "Continue"

Write-Host "========================================"
Write-Host "Becoming Protocol - Backend Deployment"
Write-Host "========================================"
Write-Host ""

# Check if supabase CLI is installed
try {
    $null = Get-Command supabase -ErrorAction Stop
} catch {
    Write-Host "ERROR: Supabase CLI not found. Install with: npm install -g supabase" -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Deploying Edge Functions..." -ForegroundColor Cyan
Write-Host "-----------------------------------"

$functions = @(
    "handler-ai"
    "handler-task-processor"
    "lovense-qrcode"
    "lovense-command"
    "lovense-callback"
    "generate-prescription"
    "schedule-notifications"
    "send-notifications"
)

foreach ($func in $functions) {
    Write-Host "Deploying $func..." -ForegroundColor Yellow
    try {
        supabase functions deploy $func --no-verify-jwt
        Write-Host "  SUCCESS" -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: Failed to deploy $func" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Step 2: Checking Secrets..." -ForegroundColor Cyan
Write-Host "---------------------------"

$secrets = supabase secrets list 2>$null

if ($secrets -notmatch "ANTHROPIC_API_KEY") {
    Write-Host "WARNING: ANTHROPIC_API_KEY not set!" -ForegroundColor Yellow
    Write-Host "  Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx"
}

if ($secrets -notmatch "LOVENSE_DEVELOPER_TOKEN") {
    Write-Host "WARNING: LOVENSE_DEVELOPER_TOKEN not set!" -ForegroundColor Yellow
    Write-Host "  Run: supabase secrets set LOVENSE_DEVELOPER_TOKEN=xxxxx"
}

Write-Host ""
Write-Host "Step 3: Verifying Deployment..." -ForegroundColor Cyan
Write-Host "-------------------------------"

supabase functions list

Write-Host ""
Write-Host "========================================"
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run database migrations (see DEPLOYMENT_CHECKLIST.md)"
Write-Host "2. Set any missing secrets"
Write-Host "3. Enable pg_cron and schedule cron jobs (see scripts/setup-cron-jobs.sql)"
Write-Host "4. Configure Lovense callback URL"
Write-Host ""
Write-Host "For full instructions, see: DEPLOYMENT_CHECKLIST.md"
