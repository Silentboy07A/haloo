# SaveHydroo - Supabase Configuration

## Environment Variables

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional for local development
SUPABASE_LOCAL_URL=http://localhost:54321
```

## Edge Functions Setup

### Deploy Functions

```bash
# Deploy all functions
supabase functions deploy sensor-ingest
supabase functions deploy ml-predict
supabase functions deploy gamification
supabase functions deploy payment-simulation

# Or deploy all at once
supabase functions deploy
```

### Test Functions Locally

```bash
# Serve functions locally
supabase functions serve

# Test sensor-ingest
curl -X POST http://localhost:54321/functions/v1/sensor-ingest \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","readings":{"ro_reject":{"tds":1200,"temperature":28,"level":75,"flowRate":2.5},"rainwater":{"tds":50,"temperature":24,"level":60,"flowRate":3.0},"blended":{"tds":220,"temperature":26,"level":50,"flowRate":4.5}}}'
```

## Database Setup

1. Create a new Supabase project at https://supabase.com
2. Navigate to SQL Editor
3. Run the `supabase/schema.sql` file
4. Verify tables are created
5. Test Row Level Security policies

## Frontend Configuration

Update your frontend to point to the Edge Functions:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

## Security Notes

- Never commit `.env` file to version control
- Always use `SUPABASE_ANON_KEY` for client-side code
- Use `SUPABASE_SERVICE_ROLE_KEY` only in Edge Functions (server-side)
- Row Level Security (RLS) is enabled on all tables
- CORS is configured in each Edge Function
