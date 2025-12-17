# Handwriter Helper

Created with [SpinItUp](https://spinitup.dev)

## Features

- **Authentication**: Email/password + GitHub + Google OAuth via BetterAuth
- **Payments**: Stripe subscriptions with Free and Pro tiers
- **AI Chat**: Claude-powered chat with streaming responses
- **Email**: Transactional emails via Resend

## Getting Started

```bash
# Install dependencies
npm install

# Set up local database
npm run db:migrate:local

# Run development server
npm run dev
```

Open http://localhost:5173 in your browser.

## Deployed URL

https://handwriter-helper.spinitup.dev

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required
- `BETTER_AUTH_SECRET` - Secret for session encryption (auto-generated)

### Optional (for full functionality)
- `STRIPE_SECRET_KEY` - Stripe API key for payments
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature verification
- `STRIPE_PRICE_ID_PRO` - Stripe price ID for Pro plan
- `ANTHROPIC_API_KEY` - Claude API key for AI chat
- `RESEND_API_KEY` - Resend API key for emails
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth

## Setting Up OAuth

### GitHub OAuth
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth app
3. Set callback URL to `https://handwriter-helper.spinitup.dev/api/auth/callback/github`
4. Add client ID and secret to environment variables

### Google OAuth
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create an OAuth 2.0 Client ID
3. Set callback URL to `https://handwriter-helper.spinitup.dev/api/auth/callback/google`
4. Add client ID and secret to environment variables

## Setting Up Stripe Webhooks

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://handwriter-helper.spinitup.dev/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`
