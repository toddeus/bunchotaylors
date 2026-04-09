# Bunch-o-Taylors — Deployment Guide

## Environments

| Environment | Frontend URL | API URL | S3 prefix | SAM stack |
|---|---|---|---|---|
| **Test** | `bunch-o-taylors.com/test` | `bunch-o-taylors.com/api` | `s3://bunch-o-taylors.com/test/` | `bunch-o-taylors-api` |
| **Production** | `bunch-o-taylors.com` | `bunch-o-taylors.com/api` | `s3://bunch-o-taylors.com/` | `bunch-o-taylors-prod` |

---

## Prerequisites

Install once on your machine:

| Tool | Version | Install |
|---|---|---|
| AWS CLI | v2 | https://aws.amazon.com/cli/ |
| AWS SAM CLI | latest | https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html |
| Node.js | 20.x | https://nodejs.org/ |

Configure AWS credentials:
```bash
aws configure
# Enter your Access Key ID, Secret, region (us-east-1), output format (json)
```

Verify everything is working:
```bash
aws sts get-caller-identity      # confirms credentials
sam --version                    # confirms SAM CLI
node --version                   # should show v20.x
```

You will need the following from your existing Cognito setup:
- **User Pool ID** — e.g. `us-east-1_AbCdEfGhI`
- **App Client ID** — e.g. `1abc2defghij3klmnopqrstu4v`

---

## Step 1 — Configure the frontend

Edit `frontend/js/config.js` and fill in your real Cognito values.
The API URL and basePath are already set for the test environment.

```javascript
window._config = {
  basePath: '/test',
  cognito: {
    userPoolId:      'us-east-1_YOUR_POOL_ID',   // ← fill in
    userPoolClientId:'YOUR_CLIENT_ID',            // ← fill in
    region:          'us-east-1',
  },
  api: {
    url: 'https://bunch-o-taylors.com/api',
  },
  s3: {
    bucket: 'bunch-o-taylors',
    url:    'https://bunch-o-taylors.s3.amazonaws.com',
  },
};
```

> **Do not commit this file with real values** if the repository is public.

---

## Step 2 — Deploy infrastructure (Lambda + API Gateway)

```bash
cd infra

sam build
```

On first deploy, use `--guided` to create a `samconfig.toml`:

```bash
sam deploy --guided --stack-name bunch-o-taylors-api \
  --parameter-overrides \
    CognitoUserPoolId=us-east-1_YOUR_POOL_ID \
    CognitoClientId=YOUR_CLIENT_ID
    
sam deploy --guided --stack-name bunch-o-taylors-api --parameter-overrides CognitoUserPoolId=us-east-1_F1f5MVHZp CognitoClientId=5n04ooefut2ig99c53me8l0qeq
```

SAM will prompt for confirmation before creating resources. Answer **y**.

When the deploy finishes, SAM prints the stack outputs:

```
Key    ApiUrl
Value  https://bunch-o-taylors.com/api

Key    RawApiUrl
Value  https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com
```

The `ApiUrl` output should match what is in `config.js`.
Keep the `RawApiUrl` handy — it is useful for testing the API directly before
the custom domain mapping is confirmed working.

> **Note — Lambda function name conflict:** The SAM template sets
> `FunctionName: bunch-o-taylors-api`. If a Lambda function with that name
> already exists in this AWS account (e.g. from the live production system),
> the deploy will fail with a conflict error. Resolve by either renaming the
> existing function or removing the `FunctionName` line from `infra/template.yaml`
> to let CloudFormation generate a unique name.

### Subsequent infrastructure deploys

After `samconfig.toml` exists, just run:

```bash
cd infra
sam build && sam deploy
```

---

## Step 3 — Deploy the frontend

```bash
aws s3 sync frontend/ s3://bunch-o-taylors.com/test/ \
  --delete \
  --exclude ".DS_Store" \
  --exclude "*.ps1"
```

> The `banner.png` file is in `frontend/` and will be included automatically.

### Confirm the S3 bucket website is configured

The bucket must have static website hosting enabled. This is a one-time
bucket setting on the existing production bucket — it should already be
configured. Verify in the AWS console:
S3 → `bunch-o-taylors.com` → Properties → Static website hosting → Enabled.

---

## Step 4 — Verify the test environment

1. Open `https://bunch-o-taylors.com/test/signin.html`
2. Sign in with a Cognito user account
3. Confirm the gallery loads and photos render
4. Open the hamburger menu and verify navigation links work
5. Click a photo and confirm the FancyBox lightbox opens
6. Test the API directly using the RawApiUrl (replace with your value):

```bash
# Get a token first — sign in via the site, then open DevTools →
# Application → Session Storage → copy the value of bot_id_token

TOKEN="eyJ..."

curl -H "Authorization: Bearer $TOKEN" \
  https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/bot/todayinhistory

curl -H "Authorization: Bearer $TOKEN" \
  https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/bot/tags
```

---

## Promoting to production

When test is signed off, promote with these changes:

**1. Update `frontend/js/config.js`:**
```javascript
basePath: '',                                    // was '/test'
url: 'https://bunch-o-taylors.com/api',         // unchanged — same path
```

**2. Deploy infrastructure:**
```bash
cd infra
sam build
sam deploy --stack-name bunch-o-taylors-prod \
  --parameter-overrides \
    CognitoUserPoolId=us-east-1_YOUR_POOL_ID \
    CognitoClientId=YOUR_CLIENT_ID
```

**3. Deploy frontend to root:**
```bash
aws s3 sync frontend/ s3://bunch-o-taylors.com/ \
  --delete \
  --exclude ".DS_Store" \
  --exclude "*.ps1"
```

**4. Update `frontend/manifest.json`** — change `start_url` back to `/index.html?nav=memories`.

---

## Quick reference — day-to-day commands

```bash
# Rebuild and redeploy Lambda after API code changes
cd infra && sam build && sam deploy

# Redeploy frontend after HTML/CSS/JS changes
aws s3 sync frontend/ s3://bunch-o-taylors.com/test/ --delete

# View Lambda logs
sam logs --stack-name bunch-o-taylors-api --tail

# Tear down the test environment
aws cloudformation delete-stack --stack-name bunch-o-taylors-api

# Check stack status
aws cloudformation describe-stacks \
  --stack-name bunch-o-taylors-api \
  --query "Stacks[0].StackStatus"
```

---

## Project structure reference

```
bunch-o-taylors/
├── frontend/          ← Deployed to s3://bunch-o-taylors/test/
│   ├── index.html
│   ├── signin.html
│   ├── banner.png
│   ├── manifest.json
│   └── js/
│       ├── config.js  ← Fill in Cognito values before deploying
│       ├── auth.js
│       ├── gallery.js
│       └── messages.json
├── api/               ← Bundled by SAM/esbuild and deployed as Lambda
│   ├── index.js
│   ├── lib/
│   │   ├── auth.js
│   │   ├── db.js
│   │   └── s3.js
│   └── routes/
│       ├── tags.js
│       ├── posts.js
│       ├── post.js
│       ├── search.js
│       └── todayinhistory.js
├── infra/
│   ├── template.yaml  ← SAM template (Lambda + API Gateway)
│   └── package.json
└── temp/
    └── bunchotaylors.db
```
