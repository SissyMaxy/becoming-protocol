#!/bin/bash

# Becoming Protocol - Backend Deployment Script
# Run this after setting up Supabase CLI and linking your project

set -e

echo "========================================"
echo "Becoming Protocol - Backend Deployment"
echo "========================================"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "ERROR: Supabase CLI not found. Install with: npm install -g supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "ERROR: Not logged into Supabase. Run: supabase login"
    exit 1
fi

echo "Step 1: Deploying Edge Functions..."
echo "-----------------------------------"

FUNCTIONS=(
    "handler-ai"
    "handler-task-processor"
    "lovense-qrcode"
    "lovense-command"
    "lovense-callback"
    "generate-prescription"
    "schedule-notifications"
    "send-notifications"
)

for func in "${FUNCTIONS[@]}"; do
    echo "Deploying $func..."
    supabase functions deploy "$func" --no-verify-jwt || {
        echo "WARNING: Failed to deploy $func"
    }
done

echo ""
echo "Step 2: Checking Secrets..."
echo "---------------------------"

SECRETS=$(supabase secrets list 2>/dev/null || echo "")

if [[ ! "$SECRETS" =~ "ANTHROPIC_API_KEY" ]]; then
    echo "WARNING: ANTHROPIC_API_KEY not set!"
    echo "  Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx"
fi

if [[ ! "$SECRETS" =~ "LOVENSE_DEVELOPER_TOKEN" ]]; then
    echo "WARNING: LOVENSE_DEVELOPER_TOKEN not set!"
    echo "  Run: supabase secrets set LOVENSE_DEVELOPER_TOKEN=xxxxx"
fi

echo ""
echo "Step 3: Verifying Deployment..."
echo "-------------------------------"

supabase functions list

echo ""
echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Run database migrations (see DEPLOYMENT_CHECKLIST.md)"
echo "2. Set any missing secrets"
echo "3. Enable pg_cron and schedule cron jobs"
echo "4. Configure Lovense callback URL"
echo ""
echo "For full instructions, see: DEPLOYMENT_CHECKLIST.md"
